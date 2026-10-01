import assert from "node:assert/strict";
import test from "node:test";
import { err, ok } from "@fluvient/core";
import { createDataResource, createDataTask } from "@fluvient-loom/query";

test("DataTask is lazy, single start, cancellable before start, and maps rejection", async () => {
  let executions = 0;
  let resolve: ((value: ReturnType<typeof ok<number>>) => void) | undefined;
  const task = createDataTask<number, string>({
    execute: async (signal) => {
      executions += 1;
      return new Promise((done) => {
        signal.subscribe(() => done(err({ kind: "cancelled" as const })));
        resolve = done;
      });
    },
    mapRejected: () => "mapped",
  });
  const first = task.start();
  const second = task.start();
  assert.strictEqual(first, second);
  assert.equal(executions, 0);
  await Promise.resolve();
  assert.equal(executions, 1);
  resolve?.(ok(3));
  assert.deepEqual(await first, ok(3));
  task.cancel();

  let rejected = createDataTask<number, string>({
    execute: async () => {
      throw new Error("boom");
    },
    mapRejected: () => "mapped",
  });
  assert.deepEqual(await rejected.start(), err("mapped"));
});

test("DataTask cancellation before start is stable", async () => {
  const task = createDataTask({
    execute: async () => ok("value"),
    mapRejected: () => "failed",
  });
  task.cancel();
  task.cancel();
  assert.deepEqual(await task.start(), err({ kind: "cancelled" }));
});

test("DataTask converts mapper failures into a task Result", async () => {
  const task = createDataTask<number, string>({
    execute: async () => {
      throw new Error("source failed");
    },
    mapRejected: () => {
      throw new Error("mapper failed");
    },
  });
  assert.deepEqual(await task.start(), {
    ok: false,
    error: { kind: "task", message: "mapper failed" },
  });

  const resource = createDataResource<number, string>(() =>
    createDataTask({
      execute: async () => {
        throw new Error("source failed");
      },
      mapRejected: () => {
        throw new Error("mapper failed");
      },
    }),
  );
  assert.deepEqual(await resource.start(), {
    ok: false,
    error: { kind: "task", message: "mapper failed" },
  });
  assert.equal(resource.getSnapshot().status, "error");
});

test("DataTask cancellation settles a non-cooperative running execution", async () => {
  const task = createDataTask({
    execute: async () => new Promise(() => undefined),
    mapRejected: () => "failed",
  });
  const running = task.start();
  task.cancel();
  assert.deepEqual(await running, err({ kind: "cancelled" }));
});

test("DataResource keeps latest value and isolates stale refetches", async () => {
  const resolvers: Array<(value: ReturnType<typeof ok<number>>) => void> = [];
  const resource = createDataResource<number, string>(() =>
    createDataTask({
      execute: async () => new Promise((resolve) => resolvers.push(resolve)),
      mapRejected: () => "failed",
    }),
  );
  const first = resource.start();
  await Promise.resolve();
  resolvers[0](ok(1));
  assert.deepEqual(await first, ok(1));
  assert.equal(resource.getSnapshot().status, "success");
  const second = resource.refetch();
  await Promise.resolve();
  assert.equal(resource.getSnapshot().status, "loading");
  assert.equal(resource.getSnapshot().snapshot, undefined);
  resolvers[1](ok(2));
  assert.deepEqual(await second, ok(2));
  assert.equal(resource.getSnapshot().latest, 2);
  const listener = () => undefined;
  const release = resource.subscribe(listener);
  release();
});
