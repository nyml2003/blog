import assert from "node:assert/strict";
import test from "node:test";
import {
  createBrowserDataTask,
  createBrowserNetwork,
  createBrowserPersistence,
  createBrowserScheduler,
  createBrowserSpaceTime,
} from "../../../app/infrastructure/browser/index.ts";
import { createMemoryPersistence } from "../../../app/infrastructure/memory/index.ts";
import { createCancellationSource } from "../../../app/kernel/index.ts";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("browser network passes request fields and preserves non-2xx bodies", async () => {
  let init: RequestInit | undefined;
  const network = createBrowserNetwork({
    fetcher: async (_input, requestInit) => {
      init = requestInit;
      return response({ error: "bad" }, 422);
    },
    setTimeoutFn: (callback, delay) => setTimeout(callback, delay),
    clearTimeoutFn: (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  const source = createCancellationSource();
  const result = await network.request({
    path: "/api/test",
    method: "POST",
    headers: { "x-test": "yes" },
    body: { value: 1 },
    timeoutMs: undefined,
    signal: source.signal,
  });
  assert.deepEqual(result, {
    ok: true,
    value: {
      status: 422,
      headers: { "content-type": "application/json" },
      body: { error: "bad" },
    },
  });
  assert.equal(init?.method, "POST");
  assert.equal(init?.body, JSON.stringify({ value: 1 }));
});

test("browser network translates invalid JSON, timeout, and caller cancellation", async () => {
  const invalid = createBrowserNetwork({
    fetcher: async () => new Response("not-json"),
    setTimeoutFn: (callback, delay) => setTimeout(callback, delay),
    clearTimeoutFn: (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  const source = createCancellationSource();
  assert.equal(
    (
      await invalid.request({
        path: "/",
        method: "GET",
        headers: {},
        body: undefined,
        timeoutMs: undefined,
        signal: source.signal,
      })
    ).ok,
    false,
  );
  const pending = createBrowserNetwork({
    fetcher: (_input, requestInit) =>
      new Promise((_resolve, reject) =>
        requestInit?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        ),
      ),
    setTimeoutFn: (callback, delay) => setTimeout(callback, delay),
    clearTimeoutFn: (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  const cancelled = createCancellationSource();
  const result = pending.request({
    path: "/",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: cancelled.signal,
  });
  cancelled.cancel();
  assert.deepEqual(await result, { ok: false, error: { kind: "cancelled" } });
  const timedOut = createBrowserNetwork({
    fetcher: (_input, requestInit) =>
      new Promise((_resolve, reject) =>
        requestInit?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        ),
      ),
    setTimeoutFn: (callback, delay) => setTimeout(callback, delay),
    clearTimeoutFn: (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  const timeoutResult = await timedOut.request({
    path: "/",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: 1,
    signal: createCancellationSource().signal,
  });
  assert.equal(timeoutResult.ok, false);
  if (!timeoutResult.ok) assert.equal(timeoutResult.error.kind, "timeout");
});

test("browser task factory uses the generic cancellation contract", async () => {
  const task = createBrowserDataTask<string, string>({
    execute: async (signal) =>
      new Promise((resolve) =>
        signal.subscribe(() =>
          resolve({ ok: false, error: { kind: "cancelled" } }),
        ),
      ),
    mapRejected: () => "failed",
  });
  const result = task.start();
  task.cancel();
  assert.deepEqual(await result, { ok: false, error: { kind: "cancelled" } });
});

test("browser and memory persistence share read/write/remove semantics", () => {
  const backing = new Map<string, string>();
  const browser = createBrowserPersistence({
    getItem: (key) => backing.get(key) ?? null,
    setItem: (key, value) => {
      backing.set(key, value);
    },
    removeItem: (key) => {
      backing.delete(key);
    },
  });
  const memory = createMemoryPersistence();
  for (const persistence of [browser, memory]) {
    assert.deepEqual(persistence.read("missing"), {
      ok: true,
      value: undefined,
    });
    assert.deepEqual(persistence.write("key", "value"), {
      ok: true,
      value: undefined,
    });
    assert.deepEqual(persistence.read("key"), { ok: true, value: "value" });
    assert.deepEqual(persistence.remove("key"), { ok: true, value: undefined });
  }
});

test("browser persistence normalizes null and returns operation failures", () => {
  const failing = createBrowserPersistence({
    getItem() {
      throw new Error("read failed");
    },
    setItem() {
      throw new Error("write failed");
    },
    removeItem() {
      throw new Error("remove failed");
    },
  });
  assert.deepEqual(failing.read("key"), {
    ok: false,
    error: { kind: "persistence", operation: "read", message: "read failed" },
  });
  assert.deepEqual(failing.write("key", "value"), {
    ok: false,
    error: { kind: "persistence", operation: "write", message: "write failed" },
  });
  assert.deepEqual(failing.remove("key"), {
    ok: false,
    error: {
      kind: "persistence",
      operation: "remove",
      message: "remove failed",
    },
  });
});

test("scheduler handles are idempotent and space-time returns injected time", () => {
  let timeout: (() => void) | undefined;
  let cleared = 0;
  const scheduler = createBrowserScheduler({
    queueMicrotaskFn: (callback) => callback(),
    setTimeoutFn: (callback) => {
      timeout = callback;
      return 1;
    },
    clearTimeoutFn: () => {
      cleared += 1;
    },
    requestAnimationFrameFn: (callback) => {
      callback(12);
      return 2;
    },
    cancelAnimationFrameFn: () => {
      cleared += 1;
    },
  });
  let calls = 0;
  const handle = scheduler.delay(() => {
    calls += 1;
  }, 10);
  timeout?.();
  handle.release();
  handle.release();
  assert.equal(calls, 1);
  assert.equal(cleared, 1);
  let timestamp = 0;
  scheduler
    .animationFrame((value) => {
      timestamp = value;
    })
    .release();
  assert.equal(timestamp, 12);
  assert.equal(createBrowserSpaceTime({ now: () => 123 }).now(), 123);
});
