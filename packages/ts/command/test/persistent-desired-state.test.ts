import assert from "node:assert/strict";
import test from "node:test";
import { createDataTask } from "@fluvient-loom/query";
import {
  createPersistentDesiredState,
  type PersistentDesiredState,
} from "@fluvient-loom/command";
import { err, ok, type Result } from "@fluvient/core";
import type {
  OperationIdPort,
  PersistencePort,
  PreparedCommand,
  ReversibleCommand,
  SchedulerPort,
} from "@fluvient-loom/port";

interface Settings {
  readonly theme: string;
  readonly font: string;
}

const DEFAULT: Settings = { theme: "paper", font: "sans" };
const KEY = "settings";

function parse(raw: string | undefined): Settings {
  if (raw === undefined) return DEFAULT;
  const parsed = JSON.parse(raw) as Partial<Settings>;
  return {
    theme: parsed.theme ?? DEFAULT.theme,
    font: parsed.font ?? DEFAULT.font,
  };
}

function memoryPersistence(initial?: string): {
  readonly persistence: PersistencePort;
  readonly dump: () => string | undefined;
} {
  let stored = initial;
  return {
    persistence: {
      read: () => ok(stored),
      write: (plan) => {
        stored = plan.value;
        return ok(undefined);
      },
      remove: () => {
        stored = undefined;
        return ok(undefined);
      },
    },
    dump: () => stored,
  };
}

function queuedScheduler(): {
  readonly scheduler: SchedulerPort;
  readonly runNext: () => void;
} {
  const callbacks: (() => void)[] = [];
  return {
    scheduler: {
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
    },
    runNext() {
      callbacks.shift()?.();
    },
  };
}

function operationIds(): OperationIdPort {
  let next = 0;
  return { next: () => `op-${++next}` };
}

function commandWritingTo(
  write: (next: Settings) => void,
  failFirst: boolean,
): {
  readonly command: ReversibleCommand<
    { previous: Settings; next: Settings; changes: Partial<Settings> },
    Error
  >;
  readonly writes: { previous: Settings; next: Settings }[];
} {
  const writes: { previous: Settings; next: Settings }[] = [];
  let calls = 0;
  return {
    writes,
    command: {
      kind: "atomic",
      async prepare(input): Promise<Result<PreparedCommand<Error>, Error>> {
        writes.push({ previous: input.previous, next: input.next });
        const call = ++calls;
        return ok({
          async execute() {
            if (call === 1 && failFirst) {
              return err(new Error("write failed"));
            }
            write(input.next);
            return ok(undefined);
          },
          async compensate() {
            return ok(undefined);
          },
        });
      },
    },
  };
}

interface Harness {
  readonly state: PersistentDesiredState<Settings, Error>;
  readonly projected: Settings[];
  readonly runNext: () => void;
  readonly writes: { previous: Settings; next: Settings }[];
  readonly seed: (value: Settings) => void;
}

function harness(options: { stored?: string; failFirstWrite?: boolean } = {}): Harness {
  const store = memoryPersistence(options.stored);
  const queued = queuedScheduler();
  const projected: Settings[] = [];
  const command = commandWritingTo(
    (next) => void store.persistence.write({ key: KEY, value: JSON.stringify(next) }),
    options.failFirstWrite ?? false,
  );
  const state = createPersistentDesiredState<Settings, Error>({
    disposedError: new Error("disposed"),
    persistence: store.persistence,
    restore: (persistence) => {
      const read = persistence.read(KEY);
      return parse(read.ok ? read.value : undefined);
    },
    reconcileTask: () =>
      createDataTask({
        execute: async () => ok(parse(store.dump())),
        mapRejected: (cause) => new Error(String(cause)),
      }),
    scheduler: queued.scheduler,
    operationIds: operationIds(),
    command: command.command,
    project: (value) => projected.push(value),
  });
  return {
    state,
    projected,
    runNext: queued.runNext,
    writes: command.writes,
    seed: (value) => void store.persistence.write({ key: KEY, value: JSON.stringify(value) }),
  };
}

test("restore path projects synchronously at creation", () => {
  const stored = JSON.stringify({ theme: "sepia", font: "serif" });
  const h = harness({ stored });
  assert.deepEqual(h.projected, [{ theme: "sepia", font: "serif" }]);
  assert.deepEqual(h.state.state().value, { theme: "sepia", font: "serif" });
  assert.equal(h.state.state().status, "idle");
});

test("reconcile path projects the reconciled value", async () => {
  const h = harness();
  h.seed({ theme: "dark", font: "mono" });
  const result = await h.state.reconcile();
  assert.deepEqual(result, { ok: true, value: { theme: "dark", font: "mono" } });
  assert.deepEqual(h.projected.at(-1), { theme: "dark", font: "mono" });
  assert.deepEqual(h.state.state().value, { theme: "dark", font: "mono" });
});

test("optimistic path projects the pending value before the write settles", async () => {
  const h = harness();
  const pending = h.state.update({ theme: "dark" });
  assert.deepEqual(h.projected.at(-1), { theme: "dark", font: "sans" });
  assert.equal(h.state.state().status, "pending");
  h.runNext();
  assert.deepEqual(await pending, { ok: true, value: undefined });
});

test("rollback path projects the recovered committed value after a failed write", async () => {
  const h = harness({ failFirstWrite: true });
  h.seed({ theme: "dark", font: "sans" });
  await h.state.reconcile();
  const failed = h.state.update({ font: "serif" });
  h.runNext();
  const result = await failed;
  assert.equal(result.ok, false);
  assert.equal(h.state.state().status, "error");
  assert.deepEqual(h.projected.at(-1), { theme: "dark", font: "sans" });
});

test("retry path re-runs the failed batch and projects the settled value", async () => {
  const h = harness({ failFirstWrite: true });
  const failed = h.state.update({ theme: "dark" });
  h.runNext();
  assert.equal((await failed).ok, false);
  // Let the mutation's settled-finally cleanup run (clears `active`) before
  // retrying: the fake scheduler only flushes on explicit runNext.
  await Promise.resolve();

  const retried = h.state.retry();
  h.runNext();
  const result = await retried;
  assert.deepEqual(result, { ok: true, value: undefined });
  assert.equal(h.state.state().status, "success");
  assert.deepEqual(h.projected.at(-1), { theme: "dark", font: "sans" });
  assert.equal(h.writes.length, 2);
});

test("all five paths flow through the single project hook", async () => {
  const h = harness({ failFirstWrite: true });
  // 1. restore
  assert.deepEqual(h.projected[0], DEFAULT);
  // 2. reconcile
  h.seed({ theme: "dark", font: "sans" });
  await h.state.reconcile();
  assert.deepEqual(h.projected.at(-1), { theme: "dark", font: "sans" });
  // 3. optimistic
  const failed = h.state.update({ font: "serif" });
  assert.deepEqual(h.projected.at(-1), { theme: "dark", font: "serif" });
  // 4. rollback
  h.runNext();
  await failed;
  assert.deepEqual(h.projected.at(-1), { theme: "dark", font: "sans" });
  await Promise.resolve();
  // 5. retry
  const retried = h.state.retry();
  h.runNext();
  await retried;
  assert.deepEqual(h.projected.at(-1), { theme: "dark", font: "serif" });
});
