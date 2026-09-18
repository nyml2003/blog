import assert from "node:assert/strict";
import test from "node:test";
import {
  cancellationFailure,
  createCancellationSource,
  err,
  ok,
  readonlyView,
} from "@fluvient-loom/common";

test("Result constructors discriminate ok and error", () => {
  const success = ok(3);
  const failure = err("boom");
  assert.equal(success.ok, true);
  assert.equal(success.ok && success.value, 3);
  assert.equal(failure.ok, false);
  assert.equal(!failure.ok && failure.error, "boom");
});

test("readonlyView is a compile-time projection that keeps identity", () => {
  const value = { list: [{ title: "a" }] };
  assert.equal(readonlyView(value), value);
});

test("cancellation source notifies subscribers exactly once and is idempotent", () => {
  let onCancel = 0;
  const source = createCancellationSource(() => {
    onCancel += 1;
  });
  let fired = 0;
  const handle = source.signal.subscribe(() => {
    fired += 1;
  });
  assert.equal(source.signal.cancelled, false);
  source.cancel();
  source.cancel();
  assert.equal(source.signal.cancelled, true);
  assert.equal(fired, 1);
  assert.equal(onCancel, 1);
  handle.release();

  let lateFired = 0;
  source.signal.subscribe(() => {
    lateFired += 1;
  });
  assert.equal(lateFired, 1);
});

test("released cancellation subscriptions no longer fire", () => {
  const source = createCancellationSource();
  let fired = 0;
  const handle = source.signal.subscribe(() => {
    fired += 1;
  });
  handle.release();
  handle.release();
  source.cancel();
  assert.equal(fired, 0);
});

test("cancellationFailure carries the cancelled kind", () => {
  assert.deepEqual(cancellationFailure(), { kind: "cancelled" });
});
