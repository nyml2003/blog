import test from "node:test";
import assert from "node:assert/strict";
import { createMobilePrefetchServiceWorker } from "../src/service-worker.ts";

test("service worker prefetches serially and serves a fresh cached response", async () => {
  const requests: string[] = [];
  const cache = new MemoryCache();
  let now = 1_000;
  const worker = createMobilePrefetchServiceWorker({
    apiPathPrefix: "/api/public/mobile/category-shelf",
    origin: "https://example.test",
    caches: new MemoryCaches(cache),
    now: () => now,
    fetcher: async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ url: String(input) }), { headers: { "content-type": "application/json" } });
    },
  });
  const response = await worker.handleFetch(new Request("https://example.test/api/public/mobile/category-shelf?category_id=1"));
  assert.ok(response);
  assert.equal(await response.json().then((value) => (value as { url: string }).url), "https://example.test/api/public/mobile/category-shelf?category_id=1");
  const cached = await worker.handleFetch(new Request("https://example.test/api/public/mobile/category-shelf?category_id=1"));
  assert.ok(cached);
  assert.equal(await cached.json().then((value) => (value as { url: string }).url), "https://example.test/api/public/mobile/category-shelf?category_id=1");
  assert.deepEqual(requests, ["https://example.test/api/public/mobile/category-shelf?category_id=1"]);
  now += 61_000;
  await worker.handleFetch(new Request("https://example.test/api/public/mobile/category-shelf?category_id=1"));
  assert.equal(requests.length, 2);
});

test("service worker rejects out-of-scope URLs and deduplicates in-flight requests", async () => {
  let calls = 0;
  let release: (() => void) | undefined;
  const worker = createMobilePrefetchServiceWorker({
    apiPathPrefix: "/api/public/mobile/category-shelf",
    origin: "https://example.test",
    caches: new MemoryCaches(new MemoryCache()),
    fetcher: async (input) => {
      if (!String(input).includes("category-shelf")) return new Response("passthrough");
      calls += 1;
      await new Promise<void>((resolve) => { release = resolve; });
      return new Response("ok");
    },
  });
  const passthrough = await worker.handleFetch(new Request("https://example.test/api/other"));
  assert.ok(passthrough);
  assert.equal(passthrough.status, 200);
  const a = worker.handleFetch(new Request("https://example.test/api/public/mobile/category-shelf?category_id=1"));
  const b = worker.handleFetch(new Request("https://example.test/api/public/mobile/category-shelf?category_id=1"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  release?.();
  await Promise.all([a, b]);
});

class MemoryCache {
  private readonly values = new Map<string, Response>();
  async match(request: RequestInfo | URL): Promise<Response | undefined> { return this.values.get(cacheKey(request))?.clone(); }
  async put(request: RequestInfo | URL, response: Response): Promise<void> { this.values.set(cacheKey(request), response.clone()); }
  async delete(request: RequestInfo | URL): Promise<boolean> { return this.values.delete(cacheKey(request)); }
}

function cacheKey(request: RequestInfo | URL): string {
  return request instanceof Request ? request.url : String(request);
}

class MemoryCaches {
  private readonly cache: MemoryCache;
  constructor(cache: MemoryCache) { this.cache = cache; }
  async open(): Promise<MemoryCache> { return this.cache; }
}
