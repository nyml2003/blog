import assert from "node:assert/strict";
import { test } from "node:test";
import { createDataResource } from "./resource";
import { createDataTask } from "./task";

const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

test("DataResource starts once and retains latest while refetching", async () => {
  const first = deferred<{ ok: true; value: number }>();
  const second = deferred<{ ok: true; value: number }>();
  let taskCount = 0;
  const resource = createDataResource(() =>
    createDataTask(async () => {
      taskCount += 1;
      return taskCount === 1 ? first.promise : second.promise;
    }),
  );
  const states: string[] = [];
  const unsubscribe = resource.subscribe(() =>
    states.push(resource.getSnapshot().status),
  );

  assert.equal(resource.getSnapshot().status, "idle");
  const initial = resource.start();
  assert.equal(resource.start(), initial);
  assert.equal(resource.getSnapshot().status, "loading");
  first.resolve({ ok: true, value: 1 });
  assert.deepEqual(await initial, { ok: true, value: 1 });
  assert.deepEqual(resource.getSnapshot(), {
    status: "success",
    snapshot: 1,
    latest: 1,
    error: undefined,
  });

  const refreshed = resource.refetch();
  assert.deepEqual(resource.getSnapshot(), {
    status: "loading",
    snapshot: undefined,
    latest: 1,
    error: undefined,
  });
  second.resolve({ ok: true, value: 2 });
  assert.deepEqual(await refreshed, { ok: true, value: 2 });
  assert.equal(taskCount, 2);
  assert.deepEqual(states, ["loading", "success", "loading", "success"]);
  unsubscribe();
});

test("DataResource ignores stale completion and represents explicit cancellation", async () => {
  const first = deferred<{ ok: true; value: number }>();
  const second = deferred<{ ok: true; value: number }>();
  let taskCount = 0;
  const resource = createDataResource(() =>
    createDataTask(async () => {
      taskCount += 1;
      return taskCount === 1 ? first.promise : second.promise;
    }),
  );

  void resource.start();
  const refreshed = resource.refetch();
  second.resolve({ ok: true, value: 2 });
  await refreshed;
  first.resolve({ ok: true, value: 1 });
  await Promise.resolve();
  assert.equal(resource.getSnapshot().latest, 2);
  assert.equal(resource.getSnapshot().snapshot, 2);

  const cancellable = createDataResource(() =>
    createDataTask(
      (signal) =>
        new Promise<{ ok: false; error: { kind: "cancelled" } }>((resolve) => {
          signal.addEventListener(
            "abort",
            () => resolve({ ok: false, error: { kind: "cancelled" } }),
            { once: true },
          );
        }),
    ),
  );
  void cancellable.start();
  cancellable.cancel();
  assert.deepEqual(cancellable.getSnapshot(), {
    status: "cancelled",
    snapshot: undefined,
    latest: undefined,
    error: { kind: "cancelled" },
  });
});
