import assert from "node:assert/strict";
import test from "node:test";
import { createCancellationSource } from "@fluvient-loom/common";
import { createWebNetwork } from "@fluvient-loom/web";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function network(fetcher: typeof fetch) {
  return createWebNetwork({
    fetcher,
    setTimeoutFn: (callback, delay) => setTimeout(callback, delay),
    clearTimeoutFn: (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
}

test("web network passes request fields and preserves non-2xx bodies", async () => {
  let init: RequestInit | undefined;
  const port = network(async (_input, requestInit) => {
    init = requestInit;
    return response({ error: "bad" }, 422);
  });
  const source = createCancellationSource();
  const result = await port.request({
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

test("web network translates invalid JSON into protocol failure", async () => {
  const port = network(async () => new Response("not-json"));
  const result = await port.request({
    path: "/",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: createCancellationSource().signal,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "protocol");
});

test("web network reports caller cancellation before network failure", async () => {
  const port = network((_input, requestInit) =>
    new Promise((_resolve, reject) =>
      requestInit?.signal?.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      ),
    ),
  );
  const cancelled = createCancellationSource();
  const result = port.request({
    path: "/",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: cancelled.signal,
  });
  cancelled.cancel();
  assert.deepEqual(await result, { ok: false, error: { kind: "cancelled" } });
});

test("web network translates timeout into timeout failure", async () => {
  const port = network((_input, requestInit) =>
    new Promise((_resolve, reject) =>
      requestInit?.signal?.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      ),
    ),
  );
  const result = await port.request({
    path: "/",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: 1,
    signal: createCancellationSource().signal,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "timeout");
});
