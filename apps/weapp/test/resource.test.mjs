import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { createWeappResource } = createRequire(import.meta.url)("../../../target/weapp-test/lib/resource.cjs");

test("weapp resource cancels an older request when a newer request starts", async () => {
  let cancelled = 0;
  const resource = createWeappResource();
  let rejectFirst;
  const first = resource.run(() => ({
    start: () => new Promise((resolve) => { rejectFirst = resolve; }),
    cancel: () => { cancelled += 1; rejectFirst({ ok: false, error: { kind: "cancelled" } }); },
  }));
  const second = resource.run(() => ({
    start: async () => ({ ok: true, value: "new" }),
    cancel: () => undefined,
  }));
  assert.equal((await second).ok, true);
  resource.resource.cancel();
  assert.equal(cancelled, 1);
  assert.equal((await first).ok, false);
  assert.equal(resource.resource.getSnapshot().snapshot, "new");
});

test("unload cancellation preserves cancelled state when a task finishes late", async () => {
  let finish;
  const resource = createWeappResource();
  const pending = resource.run(() => ({
    start: () => new Promise((resolve) => { finish = resolve; }),
    cancel() {},
  }));
  resource.resource.cancel();
  finish({ ok: true, value: "late" });
  await pending;
  assert.equal(resource.resource.getSnapshot().status, "cancelled");
  assert.equal(resource.resource.getSnapshot().snapshot, undefined);
});
