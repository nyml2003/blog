import test from 'node:test';
import assert from 'node:assert/strict';
import { ok } from '@fluvient/core';
import { defineCommand, type CommandArgs, type CommandContext } from '../src/commands.ts';
import { createCliApp } from '../src/plugin.ts';
import { reversibleEffect, type EffectFailure, type EffectMiddleware, type EffectPort } from '../src/effects.ts';
import type { OutputPort } from '../src/output.ts';
import type { Reporter } from '../src/ports.ts';

function middleware(order: string[], name: string): EffectMiddleware {
  return {
    name,
    async handle(_execution, next) {
      order.push(name);
      return next();
    },
  };
}

function makeApp(order: string[]) {
  const command = defineCommand({ path: ['act'], summary: 'act' }, async (context: CommandContext) => {
    await context.effects.run(reversibleEffect<void, EffectFailure>({
      describe: () => ({ summary: 'x' }),
      execute: async () => ok(undefined),
    }), undefined);
    return ok({ exitCode: 0 });
  });
  return createCliApp({
    name: 'test',
    description: 'test',
    version: '0.0.0',
    entry: 'test',
    plugins: [
      {
        name: 'shell',
        commands: [command],
        configure({ container }) {
          container.bind('operationIds', { next: () => 'op' });
          container.bind<Reporter>('reporter', { section() {}, ok() {}, fail() {}, info() {} });
          container.bind<OutputPort>('output', {
            setJson() {},
            result() {},
            telemetry() {},
            log() {},
            lifecycle() {},
          } as unknown as OutputPort);
          container.bind('commandContext', (): CommandContext => ({
            effects: container.get<(globals: CommandArgs) => EffectPort>('effectsPolicy')({}),
          }) as unknown as CommandContext);
        },
      },
      { name: 'first', effectMiddlewares: [() => middleware(order, 'first')] },
      { name: 'second', effectMiddlewares: [() => middleware(order, 'second')] },
    ],
  });
}

test('effect middlewares are collected from plugins in declaration order and wrap execution', async () => {
  const order: string[] = [];
  const app = makeApp(order);
  const code = await app.run(['act']);
  assert.equal(code, 0);
  assert.deepEqual(order, ['first', 'second']);
});
