import assert from "node:assert/strict";
import test from "node:test";
import { createCancellationSource } from "@fluvient-loom/common";
import type { SchedulerPort } from "@fluvient-loom/port";
import { createMockNetwork } from "@fluvient-loom/mock";

const idleSignal = () => createCancellationSource().signal;

function route(
  method: "GET" | "POST" | "DELETE",
  path: string,
  respond: Parameters<typeof createMockNetwork>[0][number]["respond"],
) {
  return { method, path, respond };
}

test("matched routes settle with their response", async () => {
  const network = createMockNetwork([
    route("GET", "/settings", async () => ({
      status: 200,
      headers: {},
      body: { theme: "dark", font: "serif" },
    })),
  ]);
  const result = await network.request({
    path: "/settings",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: idleSignal(),
  });
  assert.deepEqual(result, {
    ok: true,
    value: { status: 200, headers: {}, body: { theme: "dark", font: "serif" } },
  });
});

test("unmatched routes settle as a business-level 404 response", async () => {
  const network = createMockNetwork([]);
  const result = await network.request({
    path: "/nope",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: idleSignal(),
  });
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.value.status, 404);
});

test("transport failures pass through as typed NetworkFailures", async () => {
  const network = createMockNetwork([
    route("GET", "/flaky", () => ({ kind: "network", message: "reset" })),
  ]);
  const result = await network.request({
    path: "/flaky",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: idleSignal(),
  });
  assert.deepEqual(result, {
    ok: false,
    error: { kind: "network", message: "reset" },
  });
});

test("a pre-cancelled signal short-circuits before routing", async () => {
  const network = createMockNetwork([
    route("GET", "/settings", () => ({
      status: 200,
      headers: {},
      body: {},
    })),
  ]);
  const source = createCancellationSource();
  source.cancel();
  const result = await network.request({
    path: "/settings",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: source.signal,
  });
  assert.deepEqual(result, { ok: false, error: { kind: "cancelled" } });
});

test("injected scheduler delays the response", async () => {
  const fired: number[] = [];
  const scheduler: SchedulerPort = {
    microtask(callback) {
      queueMicrotask(callback);
      return { release() {} };
    },
    delay(callback, delayMs) {
      fired.push(delayMs);
      setTimeout(callback, delayMs);
      return { release() {} };
    },
    animationFrame(callback) {
      setTimeout(() => callback(0), 0);
      return { release() {} };
    },
  };
  const network = createMockNetwork(
    [
      {
        method: "GET",
        path: "/slow",
        delayMs: 25,
        respond: () => ({ status: 200, headers: {}, body: {} }),
      },
    ],
    { scheduler },
  );
  const result = await network.request({
    path: "/slow",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: idleSignal(),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(fired, [25]);
});

test("hang routes stay pending so timeoutMs can rehearse timeouts", async () => {
  const network = createMockNetwork([
    route("GET", "/hang", () => ({ kind: "hang" })),
  ]);
  const settled = network.request({
    path: "/hang",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: idleSignal(),
  });
  const raced = await Promise.race([
    settled.then(() => "settled"),
    new Promise((resolve) => setTimeout(() => resolve("still-pending"), 20)),
  ]);
  assert.equal(raced, "still-pending");
});

test("colon segments capture params and the query string is ignored", async () => {
  const seen: Array<Record<string, string>> = [];
  const network = createMockNetwork([
    {
      method: "GET",
      path: "/articles/:id/reactions/:kind",
      respond: (context) => {
        seen.push({ ...context.params });
        return { status: 200, headers: {}, body: {} };
      },
    },
  ]);
  const result = await network.request({
    path: "/articles/42/reactions/like?trace=1",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: idleSignal(),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(seen, [{ id: "42", kind: "like" }]);
});

test("param routes still require the same segment count", async () => {
  const network = createMockNetwork([
    route("GET", "/articles/:id", () => ({ status: 200, headers: {}, body: {} })),
  ]);
  const result = await network.request({
    path: "/articles/1/extra",
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
    signal: idleSignal(),
  });
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.value.status, 404);
});
