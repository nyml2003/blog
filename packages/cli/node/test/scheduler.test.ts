import assert from "node:assert/strict";
import test from "node:test";
import { createNodeScheduler } from "@fluvient-loom/node";

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

test("microtask callbacks run after the current synchronous turn", async () => {
  const scheduler = createNodeScheduler();
  const order: string[] = ["start"];
  const handle = scheduler.microtask(() => order.push("microtask"));
  order.push("queued");
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(order, ["start", "queued", "microtask"]);
  handle.release();
});

test("released microtask handles suppress the callback", async () => {
  const scheduler = createNodeScheduler();
  let fired = 0;
  const handle = scheduler.microtask(() => {
    fired += 1;
  });
  handle.release();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fired, 0);
});

test("delay callbacks run on the standard timer and can be cancelled", async () => {
  const scheduler = createNodeScheduler();
  let fired = 0;
  scheduler.delay(() => {
    fired += 1;
  }, 0);
  await settle();
  assert.equal(fired, 1);

  let cancelled = 0;
  const pending = scheduler.delay(() => {
    cancelled += 1;
  }, 5);
  pending.release();
  await settle();
  assert.equal(cancelled, 0);
});

test("animationFrame uses an injected frame clock and forwards the timestamp", async () => {
  const scheduler = createNodeScheduler({
    requestAnimationFrameFn: (callback) => {
      setTimeout(() => callback(1234.5), 0);
      return 0;
    },
    cancelAnimationFrameFn: () => undefined,
  });
  let timestamp: number | undefined;
  scheduler.animationFrame((value) => {
    timestamp = value;
  });
  await settle();
  assert.equal(timestamp, 1234.5);
});

test("animationFrame degrades to setTimeout in Node (no rAF)", async () => {
  const scheduler = createNodeScheduler();
  let timestamp: number | undefined;
  scheduler.animationFrame((value) => {
    timestamp = value;
  });
  await settle();
  assert.equal(timestamp, 0);
});
