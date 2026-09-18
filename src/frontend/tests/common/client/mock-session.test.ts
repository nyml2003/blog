import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Server } from "node:http";
import { createServer } from "node:http";
import type { TransportRequest } from "../../../common/data/transport";
import { createJsonTransport } from "../../../common/data/transport";
import {
  createMockSessionInterceptor,
  readMockSessionFromLocation,
} from "../../../common/client/mock-session";

const SESSION_HEADER = "X-Blog-Mock-Session";

const requestFixture = (
  headers?: Record<string, string>,
): TransportRequest => ({
  path: "/api/public/articles",
  method: "GET",
  signal: new AbortController().signal,
  ...(headers === undefined ? {} : { headers }),
});

function listen(server: Server, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => resolve());
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

function serverOrigin(server: Server): string {
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("测试服务器未监听在 IPv4 端口上");
  }
  return `http://127.0.0.1:${address.port}`;
}

function isInjectionLayerFile(path: string): boolean {
  const injectionLayer = [
    "common/client/browser.ts",
    "common/client/mock-session.ts",
  ];
  return injectionLayer.some((entry) => path.endsWith(entry));
}

function isSourceFile(path: string): boolean {
  if (!/\.(ts|tsx)$/.test(path)) return false;
  if (path.endsWith(".test.ts")) return false;
  return !isInjectionLayerFile(path);
}

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(path));
    if (entry.isFile() && isSourceFile(path)) files.push(path);
  }
  return files;
}

test("session id comes only from an explicit mock-session query parameter", () => {
  assert.equal(
    readMockSessionFromLocation("?mock-session=review-1"),
    "review-1",
  );
  assert.equal(
    readMockSessionFromLocation("?mock-session=review-1&type_id=2"),
    "review-1",
  );
  assert.equal(
    readMockSessionFromLocation("?type_id=2&mock-session=abc"),
    "abc",
  );
});

test("no session id source exists without the query parameter", () => {
  assert.equal(readMockSessionFromLocation(""), undefined);
  assert.equal(readMockSessionFromLocation("?type_id=2"), undefined);
  assert.equal(readMockSessionFromLocation("?mock-session="), undefined);
});

test("interceptor attaches the mock session header when a session is explicit", () => {
  const interceptor = createMockSessionInterceptor({
    readSessionId: () => "review-1",
  });
  const request = requestFixture();
  const outgoing = interceptor(request);
  assert.equal(outgoing.path, request.path);
  assert.equal(outgoing.method, request.method);
  assert.equal(outgoing.signal, request.signal);
  assert.deepEqual(outgoing.headers, { [SESSION_HEADER]: "review-1" });
});

test("interceptor leaves the request untouched when no session is present", () => {
  const interceptor = createMockSessionInterceptor({
    readSessionId: () => undefined,
  });
  const request = requestFixture();
  assert.equal(interceptor(request), request);
  const withOtherHeaders = requestFixture({ "x-trace": "1" });
  assert.equal(interceptor(withOtherHeaders), withOtherHeaders);
});

test("interceptor keeps existing headers and re-reads the session per request", () => {
  const sessions = ["review-1", undefined, "review-2"];
  const interceptor = createMockSessionInterceptor({
    readSessionId: () => sessions.shift(),
  });
  const first = interceptor(requestFixture({ "x-trace": "1" }));
  assert.deepEqual(first.headers, {
    "x-trace": "1",
    [SESSION_HEADER]: "review-1",
  });
  const second = requestFixture();
  assert.equal(interceptor(second), second);
  const third = interceptor(requestFixture());
  assert.deepEqual(third.headers, { [SESSION_HEADER]: "review-2" });
});

test("session header reaches a real HTTP endpoint and survives a POST body", async () => {
  const seen: Array<{
    url: string | undefined;
    session: string | string[] | undefined;
    contentType: string | string[] | undefined;
  }> = [];
  const server = createServer((request, response) => {
    seen.push({
      url: request.url,
      session: request.headers["x-blog-mock-session"],
      contentType: request.headers["content-type"],
    });
    let body = "";
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ code: "OK", data: { body } }));
    });
  });
  await listen(server, "127.0.0.1");
  try {
    const transport = createJsonTransport({
      fetcher: fetch,
      interceptors: [
        createMockSessionInterceptor({ readSessionId: () => "review-1" }),
      ],
    });
    const origin = serverOrigin(server);
    const listed = await transport.request<{ body: string }>({
      path: `${origin}/api/public/articles?sceneCode=public.article_list`,
      method: "GET",
      signal: new AbortController().signal,
    });
    assert.deepEqual(listed, { ok: true, value: { body: "" } });
    const saved = await transport.request<{ body: string }>({
      path: `${origin}/api/admin/articles`,
      method: "POST",
      signal: new AbortController().signal,
      body: { sceneCode: "admin.article_create", title: "标题" },
    });
    assert.deepEqual(saved, {
      ok: true,
      value: {
        body: JSON.stringify({
          sceneCode: "admin.article_create",
          title: "标题",
        }),
      },
    });
    assert.deepEqual(seen, [
      {
        url: "/api/public/articles?sceneCode=public.article_list",
        session: "review-1",
        contentType: undefined,
      },
      {
        url: "/api/admin/articles",
        session: "review-1",
        contentType: "application/json",
      },
    ]);
  } finally {
    await close(server);
  }
});

test("no session header is sent without an explicit session", async () => {
  const sessions: Array<string | string[] | undefined> = [];
  const server = createServer((request, response) => {
    sessions.push(request.headers["x-blog-mock-session"]);
    response.end(JSON.stringify({ code: "OK", data: null }));
  });
  await listen(server, "127.0.0.1");
  try {
    const transport = createJsonTransport({
      fetcher: fetch,
      interceptors: [
        createMockSessionInterceptor({ readSessionId: () => undefined }),
      ],
    });
    const result = await transport.request<null>({
      path: `${serverOrigin(server)}/api/public/recommendations`,
      method: "GET",
      signal: new AbortController().signal,
    });
    assert.deepEqual(result, { ok: true, value: null });
    assert.deepEqual(sessions, [undefined]);
  } finally {
    await close(server);
  }
});

test("mock session vocabulary stays inside the composition root injection layer", () => {
  const roots = [
    join(import.meta.dirname, "../../../desktop"),
    join(import.meta.dirname, "../../../mobile"),
    join(import.meta.dirname, "../../../common"),
    join(import.meta.dirname, "../../../solid"),
  ];
  const leaking: string[] = [];
  for (const root of roots) {
    for (const file of listSourceFiles(root)) {
      if (readFileSync(file, "utf8").toLowerCase().includes("mock")) {
        leaking.push(file);
      }
    }
  }
  assert.deepEqual(
    leaking,
    [],
    "页面与领域模型不得出现 Mock 专用词汇（仅 composition root 注入层可见）",
  );
});
