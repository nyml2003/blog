import assert from "node:assert/strict";
import test from "node:test";
import { createCancellationSource } from "@fluvient/core";
import { createNodeNetwork } from "@fluvient-loom/node";

function dataUrl(json: unknown): string {
  const encoded = btoa(JSON.stringify(json));
  return `data:application/json;base64,${encoded}`;
}

const idleSignal = () => createCancellationSource().signal;

test("node network round-trips a real (data:) request through global fetch", async () => {
  const network = createNodeNetwork();
  const result = await network.request({
    path: dataUrl({ theme: "dark", font: "serif" }),
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: idleSignal(),
  });
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.value.status, 200);
  assert.deepEqual(result.value.body, { theme: "dark", font: "serif" });
  assert.equal(result.value.headers["content-type"], "application/json");
});

test("a pre-cancelled signal short-circuits with a cancellation failure", async () => {
  const network = createNodeNetwork();
  const source = createCancellationSource();
  source.cancel();
  const result = await network.request({
    path: dataUrl({}),
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: source.signal,
  });
  assert.deepEqual(result, { ok: false, error: { kind: "cancelled" } });
});

test("cancelling mid-flight settles as a cancellation failure", async () => {
  const network = createNodeNetwork({
    fetcher: (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
  });
  const source = createCancellationSource();
  const pending = network.request({
    path: "https://example.invalid/api",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: source.signal,
  });
  source.cancel();
  const result = await pending;
  assert.deepEqual(result, { ok: false, error: { kind: "cancelled" } });
});

test("an injected immediate timer turns into a timeout failure", async () => {
  const network = createNodeNetwork({
    fetcher: (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
    setTimeoutFn: (callback) => {
      callback();
      return 0;
    },
    clearTimeoutFn: () => undefined,
  });
  const result = await network.request({
    path: "https://example.invalid/api",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: 1000,
    signal: idleSignal(),
  });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "timeout");
});

test("a non-JSON body settles as a protocol failure", async () => {
  const network = createNodeNetwork({
    fetcher: async () => new Response("not json"),
  });
  const result = await network.request({
    path: "https://example.invalid/api",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: idleSignal(),
  });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "protocol");
});

test("a thrown fetcher settles as a network failure", async () => {
  const network = createNodeNetwork({
    fetcher: async () => {
      throw new TypeError("fetch failed");
    },
  });
  const result = await network.request({
    path: "https://example.invalid/api",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: idleSignal(),
  });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "network");
});

test("POST bodies are serialized as JSON and passed through", async () => {
  let observed: { method?: string; body?: string } = {};
  const network = createNodeNetwork({
    fetcher: async (_input, init) => {
      observed = { method: init?.method, body: init?.body as string };
      return new Response(JSON.stringify({ saved: true }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const result = await network.request({
    path: "https://example.invalid/api",
    method: "POST",
    headers: { "x-test": "1" },
    body: { theme: "sepia" },
    timeoutMs: undefined,
    signal: idleSignal(),
  });
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.value.status, 201);
  assert.deepEqual(observed.body, JSON.stringify({ theme: "sepia" }));
  assert.equal(observed.method, "POST");
});
