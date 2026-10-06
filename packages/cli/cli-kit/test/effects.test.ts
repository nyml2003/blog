import test from 'node:test';
import assert from 'node:assert/strict';
import { err, ok } from '@fluvient/core';
import type { OperationIdPort, PreparedCommand, ReversibleCommand } from '@fluvient-loom/port';
import { createEffectDispatcher, createEffectPort, dryRunMiddleware, effectFailure, reversibleEffect, type EffectFailure } from '../src/effects.ts';

function ids(): OperationIdPort {
  let sequence = 0;
  return { next: () => `op-${sequence += 1}` };
}

test('dry-run records described changes without executing or compensating', async () => {
  const calls: string[] = [];
  const port = createEffectPort({ dryRun: true, operationIds: ids() });
  const command = reversibleEffect<{ name: string }, EffectFailure>({
    describe: ({ name }) => ({ summary: `创建 ${name}` }),
    execute: async () => { calls.push('execute'); return ok(undefined); },
    compensate: async () => { calls.push('compensate'); return ok(undefined); },
  });
  const result = await port.run(command, { name: 'tag' });
  assert.deepEqual(result, { ok: true, value: undefined });
  assert.deepEqual(calls, []);
  assert.deepEqual(port.plan, [{ summary: '创建 tag' }]);
});

test('real policy executes and rollback compensates in reverse order', async () => {
  const calls: string[] = [];
  const port = createEffectPort({ dryRun: false, operationIds: ids() });
  const command = (name: string) => reversibleEffect<undefined, EffectFailure>({
    describe: () => ({ summary: name }),
    execute: async () => { calls.push(`execute:${name}`); return ok(undefined); },
    compensate: async () => { calls.push(`compensate:${name}`); return ok(undefined); },
  });
  await port.run(command('a'), undefined);
  await port.run(command('b'), undefined);
  assert.deepEqual(port.plan, []);
  const report = await port.rollback();
  assert.deepEqual(calls, ['execute:a', 'execute:b', 'compensate:b', 'compensate:a']);
  assert.equal(report.compensated, 2);
  assert.deepEqual(report.failures, []);
});

test('execute failure compensates the failing command and returns the error', async () => {
  const calls: string[] = [];
  const port = createEffectPort({ dryRun: false, operationIds: ids() });
  const command = reversibleEffect<undefined, EffectFailure>({
    describe: () => ({ summary: 'x' }),
    execute: async () => { calls.push('execute'); return err(effectFailure('boom')); },
    compensate: async () => { calls.push('compensate'); return ok(undefined); },
  });
  const result = await port.run(command, undefined);
  assert.deepEqual(result, { ok: false, error: { message: 'boom' } });
  assert.deepEqual(calls, ['execute', 'compensate']);
  await port.rollback();
  assert.deepEqual(calls, ['execute', 'compensate']);
});

test('prepare failure returns the error without recording or executing', async () => {
  const port = createEffectPort({ dryRun: true, operationIds: ids() });
  const failing: ReversibleCommand<undefined, EffectFailure> = {
    kind: 'atomic',
    prepare: async () => err(effectFailure('no-plan')),
  };
  const result = await port.run(failing, undefined);
  assert.deepEqual(result, { ok: false, error: { message: 'no-plan' } });
  assert.deepEqual(port.plan, []);
});

test('missing describe falls back to a generic plan line', async () => {
  const port = createEffectPort({ dryRun: true, operationIds: ids() });
  const prepared: PreparedCommand<EffectFailure> = {
    execute: async () => ok(undefined),
    compensate: async () => ok(undefined),
  };
  const command: ReversibleCommand<undefined, EffectFailure> = {
    kind: 'atomic',
    prepare: async () => ok(prepared),
  };
  await port.run(command, undefined);
  assert.deepEqual(port.plan, [{ summary: '效果 1' }]);
});

test('middleware wraps execution in onion order and observes the result', async () => {
  const calls: string[] = [];
  const port = createEffectDispatcher({
    operationIds: ids(),
    middlewares: [
      { name: 'outer', async handle(_execution, next) { calls.push('outer:before'); const result = await next(); calls.push('outer:after'); return result; } },
      { name: 'inner', async handle(_execution, next) { calls.push('inner:before'); const result = await next(); calls.push('inner:after'); return result; } },
    ],
  });
  const command = reversibleEffect<undefined, EffectFailure>({
    describe: () => ({ summary: 'x' }),
    execute: async () => { calls.push('execute'); return ok(undefined); },
  });
  const result = await port.run(command, undefined);
  assert.deepEqual(result, { ok: true, value: undefined });
  assert.deepEqual(calls, ['outer:before', 'inner:before', 'execute', 'inner:after', 'outer:after']);
});

test('a middleware that skips next() short-circuits without executing or compensating', async () => {
  const calls: string[] = [];
  const port = createEffectDispatcher({
    operationIds: ids(),
    middlewares: [{
      name: 'recorder',
      async handle(execution) {
        calls.push('record');
        execution.record();
        return ok(undefined);
      },
    }],
  });
  const command = reversibleEffect<undefined, EffectFailure>({
    describe: () => ({ summary: 'x' }),
    execute: async () => { calls.push('execute'); return ok(undefined); },
    compensate: async () => { calls.push('compensate'); return ok(undefined); },
  });
  const result = await port.run(command, undefined);
  assert.deepEqual(result, { ok: true, value: undefined });
  assert.deepEqual(calls, ['record']);
  assert.deepEqual(port.plan, [{ summary: 'x' }]);
});

test('a middleware can reject an effect before execution', async () => {
  const port = createEffectDispatcher({
    operationIds: ids(),
    middlewares: [{ name: 'approval', async handle() { return err(effectFailure('denied')); } }],
  });
  const command = reversibleEffect<undefined, EffectFailure>({
    describe: () => ({ summary: 'x' }),
    execute: async () => ok(undefined),
  });
  const result = await port.run(command, undefined);
  assert.deepEqual(result, { ok: false, error: { message: 'denied' } });
  assert.deepEqual(port.plan, []);
});

test('without a short-circuiting middleware the dispatcher executes', async () => {
  const calls: string[] = [];
  const port = createEffectDispatcher({ operationIds: ids(), middlewares: [] });
  const command = reversibleEffect<undefined, EffectFailure>({
    describe: () => ({ summary: 'x' }),
    execute: async () => { calls.push('execute'); return ok(undefined); },
  });
  await port.run(command, undefined);
  assert.deepEqual(calls, ['execute']);
  assert.deepEqual(port.plan, []);
});

test('plugins compose: an outer audit middleware wraps the built-in dry-run middleware', async () => {
  const seen: string[] = [];
  const port = createEffectDispatcher({
    operationIds: ids(),
    middlewares: [
      { name: 'audit', async handle(execution, next) { const result = await next(); seen.push(`${execution.description?.summary}:${result.ok ? 'skipped' : 'failed'}`); return result; } },
      dryRunMiddleware(),
    ],
  });
  const command = reversibleEffect<undefined, EffectFailure>({
    describe: () => ({ summary: '创建 tag' }),
    execute: async () => ok(undefined),
  });
  await port.run(command, undefined);
  assert.deepEqual(seen, ['创建 tag:skipped']);
  assert.deepEqual(port.plan, [{ summary: '创建 tag' }]);
});

test('rollback continues past compensation failures and aggregates the report', async () => {
  const calls: string[] = [];
  const port = createEffectDispatcher({ operationIds: ids(), middlewares: [] });
  const command = (name: string, failCompensate: boolean) => reversibleEffect<undefined, EffectFailure>({
    describe: () => ({ summary: name }),
    execute: async () => { calls.push(`execute:${name}`); return ok(undefined); },
    compensate: async () => {
      calls.push(`compensate:${name}`);
      return failCompensate ? err(effectFailure(`cant undo ${name}`)) : ok(undefined);
    },
  });
  await port.run(command('a', false), undefined);
  await port.run(command('b', true), undefined);
  await port.run(command('c', false), undefined);
  const report = await port.rollback();
  assert.deepEqual(calls, ['execute:a', 'execute:b', 'execute:c', 'compensate:c', 'compensate:b', 'compensate:a']);
  assert.equal(report.compensated, 2);
  assert.deepEqual(report.failures.map((failure) => failure.error.message), ['cant undo b']);
});

test('execute throwing is converted to a failure and compensated', async () => {
  const calls: string[] = [];
  const command: ReversibleCommand<undefined, EffectFailure> = {
    kind: 'atomic',
    prepare: async () => ok({
      describe: () => ({ summary: 'x' }),
      execute: async () => { calls.push('execute'); throw new Error('disk full'); },
      compensate: async () => { calls.push('compensate'); return ok(undefined); },
    }),
  };
  const port = createEffectDispatcher({ operationIds: ids(), middlewares: [] });
  const result = await port.run(command, undefined);
  assert.deepEqual(result, { ok: false, error: { message: 'disk full' } });
  assert.deepEqual(calls, ['execute', 'compensate']);
});

test('calling next() twice fails the effect instead of executing twice', async () => {
  const calls: string[] = [];
  const port = createEffectDispatcher({
    operationIds: ids(),
    middlewares: [{
      name: 'greedy',
      async handle(_execution, next) {
        await next();
        return next();
      },
    }],
  });
  const command = reversibleEffect<undefined, EffectFailure>({
    describe: () => ({ summary: 'x' }),
    execute: async () => { calls.push('execute'); return ok(undefined); },
  });
  const result = await port.run(command, undefined);
  assert.deepEqual(calls, ['execute']);
  assert.deepEqual(result, { ok: false, error: { message: 'greedy: next() called more than once' } });
});

test('createScope isolates plan and undo from the default scope', async () => {
  const calls: string[] = [];
  const port = createEffectDispatcher({ operationIds: ids(), middlewares: [] });
  const scope = port.createScope();
  const command = reversibleEffect<undefined, EffectFailure>({
    describe: () => ({ summary: 'x' }),
    execute: async () => { calls.push('execute'); return ok(undefined); },
    compensate: async () => { calls.push('compensate'); return ok(undefined); },
  });
  await scope.run(command, undefined);
  await port.run(command, undefined);
  await scope.rollback();
  assert.deepEqual(calls, ['execute', 'execute', 'compensate']);
  await port.rollback();
  assert.deepEqual(calls, ['execute', 'execute', 'compensate', 'compensate']);
});
