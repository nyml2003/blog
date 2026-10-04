import assert from "node:assert/strict";
import test from "node:test";
import { createWebScheduler } from "@fluvient-loom/web";

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

test("web scheduler runs microtasks after the current turn", async () => {
  const scheduler = createWebScheduler();
  const order: string[] = ["start"];
  scheduler.microtask(() => order.push("microtask"));
  order.push("queued");
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(order, ["start", "queued", "microtask"]);
});

test("web scheduler delays run on the standard timer and cancel", async () => {
  const scheduler = createWebScheduler();
  let fired = 0;
  scheduler.delay(() => {
    fired += 1;
  }, 0);
  await settle();
  assert.equal(fired, 1);

  let cancelled = 0;
  const handle = scheduler.delay(() => {
    cancelled += 1;
  }, 5);
  handle.release();
  await settle();
  assert.equal(cancelled, 0);
});

test("web scheduler uses an injected rAF and forwards the timestamp", async () => {
  const scheduler = createWebScheduler({
    requestAnimationFrameFn: (callback) => {
      setTimeout(() => callback(42), 0);
      return 0;
    },
    cancelAnimationFrameFn: () => undefined,
  });
  let timestamp: number | undefined;
  scheduler.animationFrame((value) => {
    timestamp = value;
  });
  await settle();
  assert.equal(timestamp, 42);
});

test("web scheduler degrades animationFrame to setTimeout without rAF", async () => {
  const scheduler = createWebScheduler();
  let timestamp: number | undefined;
  scheduler.animationFrame((value) => {
    timestamp = value;
  });
  await settle();
  assert.equal(timestamp, 0);
});
