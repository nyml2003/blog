import assert from "node:assert/strict";
import test from "node:test";
import { createDesiredStateMutation } from "../../../app/kernel";
import type {
  OperationIdPort,
  PreparedCommand,
  ReversibleCommand,
  SchedulerPort,
} from "../../../app/kernel/ports";
import { ok, type Result } from "../../../app/kernel/result";

interface Settings {
  readonly theme: string;
  readonly font: string;
}

function scheduler(): {
  readonly scheduler: SchedulerPort;
  readonly runNext: () => void;
} {
  const callbacks: (() => void)[] = [];
  const scheduler: SchedulerPort = {
    microtask(callback) {
      callbacks.push(callback);
      return { release() {} };
    },
    delay() {
      return { release() {} };
    },
    animationFrame() {
      return { release() {} };
    },
  };
  return {
    scheduler,
    runNext() {
      callbacks.shift()?.();
    },
  };
}

function operationIds(): OperationIdPort {
  let next = 0;
  return { next: () => `op-${++next}` };
}

function commandFor(
  execute: () => Promise<Result<void, Error>>,
  contexts: string[],
): ReversibleCommand<
  { previous: Settings; next: Settings; changes: Partial<Settings> },
  Error
> {
  return {
    kind: "atomic",
    async prepare(
      _input,
      context,
    ): Promise<Result<PreparedCommand<Error>, Error>> {
      contexts.push(context.operationId);
      return ok({ execute, compensate: async () => ok(undefined) });
    },
  };
}

test("desired state mutation preserves later intent after an earlier batch fails", async () => {
  const queued = scheduler();
  let failFirst: (() => void) | undefined;
  let resolveSecond: (() => void) | undefined;
  let calls = 0;
  const contexts: string[] = [];
  const states: Settings[] = [];
  const command = commandFor(() => {
    calls += 1;
    if (calls === 1) {
      return new Promise<Result<void, Error>>((resolve) => {
        failFirst = () =>
          resolve({ ok: false, error: new Error("write failed") });
      });
    }
    return new Promise<Result<void, Error>>((resolve) => {
      resolveSecond = () => resolve(ok(undefined));
    });
  }, contexts);
  const mutation = createDesiredStateMutation<Settings, Error>({
    initial: { theme: "paper", font: "sans" },
    disposedError: new Error("disposed"),
    scheduler: queued.scheduler,
    operationIds: operationIds(),
    command,
    invalidate: async () => ok({ theme: "paper", font: "mono" }),
    onState: (value) => states.push(value),
  });

  const first = mutation.update({ theme: "dark" });
  const second = mutation.update({ font: "serif" });
  queued.runNext();
  const later = mutation.update({ font: "mono" });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  failFirst?.();
  const firstResult = await first;
  const secondResult = await second;
  assert.equal(firstResult.ok, false);
  assert.equal(secondResult.ok, false);
  assert.deepEqual(mutation.state().value, { theme: "paper", font: "mono" });

  await Promise.resolve();
  queued.runNext();
  await Promise.resolve();
  await Promise.resolve();
  resolveSecond?.();
  assert.deepEqual(await later, { ok: true, value: undefined });
  assert.deepEqual(mutation.state().value, { theme: "paper", font: "mono" });
  assert.deepEqual(contexts, ["op-1", "op-2"]);
  assert.ok(states.some((value) => value.theme === "dark"));
});

test("desired state mutation coalesces patches in one scheduler boundary", async () => {
  const queued = scheduler();
  let executeCount = 0;
  const mutation = createDesiredStateMutation<Settings, Error>({
    initial: { theme: "paper", font: "sans" },
    disposedError: new Error("disposed"),
    scheduler: queued.scheduler,
    operationIds: operationIds(),
    command: commandFor(async () => {
      executeCount += 1;
      return ok(undefined);
    }, []),
    invalidate: async () => ok({ theme: "dark", font: "mono" }),
    onState: () => undefined,
  });
  const first = mutation.update({ theme: "dark" });
  const second = mutation.update({ font: "mono" });
  queued.runNext();
  assert.deepEqual(await first, { ok: true, value: undefined });
  assert.deepEqual(await second, { ok: true, value: undefined });
  assert.equal(executeCount, 1);
});
