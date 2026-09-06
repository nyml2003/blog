import assert from "node:assert/strict";
import { test } from "node:test";
import { createDataTask } from "./task";
import { createJsonTransport } from "./transport";

test("DataTask is lazy, single-start, and cancellation is stable", async () => {
  let runs = 0;
  const task = createDataTask(async () => {
    runs += 1;
    return { ok: true, value: 7 } as const;
  });
  assert.equal(runs, 0);
  const first = task.start();
  assert.equal(task.start(), first);
  assert.deepEqual(await first, { ok: true, value: 7 });
  assert.equal(runs, 1);
});

test("cancel before start returns cancellation without executing", async () => {
  let runs = 0;
  const task = createDataTask(async () => {
    runs += 1;
    return { ok: true, value: 1 } as const;
  });
  task.cancel();
  assert.deepEqual(await task.start(), {
    ok: false,
    error: { kind: "cancelled" },
  });
  assert.equal(runs, 0);
});

test("JSON transport maps envelope, remote, protocol, and cancellation errors", async () => {
  const make = (body: unknown, ok = true) =>
    createJsonTransport(
      async () =>
        new Response(JSON.stringify(body), { status: ok ? 200 : 400 }),
    );
  const signal = new AbortController().signal;
  assert.deepEqual(
    await make({ code: "OK", data: { x: 1 } }).request({
      path: "/x",
      method: "GET",
      signal,
    }),
    { ok: true, value: { x: 1 } },
  );
  assert.equal(
    (
      await make({ code: "BAD", message: "no", data: null }, false).request({
        path: "/x",
        method: "GET",
        signal,
      })
    ).ok,
    false,
  );
  assert.equal(
    (await make("bad").request({ path: "/x", method: "GET", signal })).ok,
    false,
  );
});

test("JSON transport reports timeout separately from caller cancellation", async () => {
  const transport = createJsonTransport(
    (_path, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
  );
  const result = await transport.request({
    path: "/slow",
    method: "GET",
    signal: new AbortController().signal,
    timeoutMs: 1,
  });
  assert.deepEqual(result, { ok: false, error: { kind: "timeout" } });
});

test("JSON transport applies request interceptors in order before sending", async () => {
  const sent: Array<{ path: string; headers: Record<string, string> }> = [];
  const headerRecord = (init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    if (init?.headers === undefined) return headers;
    for (const [key, value] of new Headers(init.headers)) headers[key] = value;
    return headers;
  };
  const transport = createJsonTransport({
    fetcher: async (path, init) => {
      sent.push({ path: String(path), headers: headerRecord(init) });
      return new Response(JSON.stringify({ code: "OK", data: null }), {
        headers: { "content-type": "application/json" },
      });
    },
    interceptors: [
      (request) => ({
        ...request,
        headers: { ...request.headers, "x-trace-id": "t-1" },
      }),
      (request) => ({ ...request, path: `${request.path}&from=interceptor` }),
    ],
  });
  const result = await transport.request<null>({
    path: "/api/public/articles",
    method: "GET",
    signal: new AbortController().signal,
  });
  assert.deepEqual(result, { ok: true, value: null });
  assert.deepEqual(sent, [
    {
      path: "/api/public/articles&from=interceptor",
      headers: { "x-trace-id": "t-1" },
    },
  ]);
});

test("JSON transport keeps a body request readable while interceptor headers merge", async () => {
  const sent: Array<Record<string, string>> = [];
  const transport = createJsonTransport({
    fetcher: async (_path, init) => {
      const headers: Record<string, string> = {};
      if (init?.headers !== undefined) {
        for (const [key, value] of new Headers(init.headers)) {
          headers[key] = value;
        }
      }
      sent.push(headers);
      return new Response(JSON.stringify({ code: "OK", data: null }), {
        headers: { "content-type": "application/json" },
      });
    },
    interceptors: [
      (request) => ({
        ...request,
        headers: { ...request.headers, "x-trace-id": "t-2" },
      }),
    ],
  });
  await transport.request<null>({
    path: "/api/admin/articles",
    method: "POST",
    signal: new AbortController().signal,
    body: { sceneCode: "admin.article_create", title: "标题" },
  });
  assert.deepEqual(sent, [
    { "x-trace-id": "t-2", "content-type": "application/json" },
  ]);
});
