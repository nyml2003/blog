import assert from "node:assert/strict";
import test from "node:test";
import { cancellationFailure, err, ok, type Result, type CancellationFailure } from "@fluvient/core";
import { withHttpRetry } from "../src/retry.ts";
import type { HttpError, HttpRetryEvent } from "../src/index.ts";

const failure = (retryable: boolean): HttpError => ({
  kind: "reset",
  message: "reset",
  retryable,
});

test("retries retryable failures with exponential backoff until success", async () => {
  const delays: number[] = [];
  const events: HttpRetryEvent[] = [];
  let attempts = 0;
  const result = await withHttpRetry(
    () => {
      attempts += 1;
      return attempts < 3
        ? Promise.resolve(err(failure(true)))
        : Promise.resolve(ok("done") as Result<string, HttpError | CancellationFailure>);
    },
    { maxAttempts: 5, initialDelayMs: 100, maxDelayMs: 4_000 },
    {
      sleep: async (ms) => {
        delays.push(ms);
      },
      onRetry: (event) => events.push(event),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [100, 200]);
  assert.deepEqual(events.map((event) => event.attempt), [1, 2]);
});

test("caps the backoff delay at maxDelayMs", async () => {
  const delays: number[] = [];
  let attempts = 0;
  const result = await withHttpRetry(
    () => {
      attempts += 1;
      return Promise.resolve(err(failure(true)));
    },
    { maxAttempts: 4, initialDelayMs: 100, maxDelayMs: 300 },
    { sleep: async (ms) => void delays.push(ms) },
  );
  assert.ok(!result.ok);
  assert.equal(attempts, 4);
  assert.deepEqual(delays, [100, 200, 300]);
});

test("non-retryable failures return after the first attempt", async () => {
  let attempts = 0;
  let retried = 0;
  const result = await withHttpRetry(
    () => {
      attempts += 1;
      return Promise.resolve(err(failure(false)));
    },
    { maxAttempts: 5, initialDelayMs: 1, maxDelayMs: 10 },
    { sleep: async () => void (retried += 1) },
  );
  assert.ok(!result.ok);
  assert.equal(attempts, 1);
  assert.equal(retried, 0);
});

test("cancellation failures are never retried", async () => {
  let attempts = 0;
  const result = await withHttpRetry(
    () => {
      attempts += 1;
      return Promise.resolve(err(cancellationFailure()));
    },
    { maxAttempts: 5, initialDelayMs: 1, maxDelayMs: 10 },
  );
  assert.deepEqual(result, { ok: false, error: { kind: "cancelled" } });
  assert.equal(attempts, 1);
});
