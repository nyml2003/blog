import assert from "node:assert/strict";
import test from "node:test";

test("bundled weapp API sends the shared mobile-api request through wx.request", async () => {
  const calls = [];
  globalThis.wx = {
    request(options) {
      calls.push(options);
      options.success({
        statusCode: 200,
        header: { "content-type": "application/json" },
        data: {
          code: "OK",
          data: { items: [], page: 1, pageSize: 20, total: 0, hasMore: false },
        },
      });
      return { abort() {} };
    },
  };
  const bundle = await import("../../../target/weapp-test/lib/api.cjs");
  const { createWeappApi } = bundle.default;
  const api = createWeappApi("https://example.test");
  const result = await api.search.get("rust & web", 1).start();
  assert.equal(result.ok, true);
  assert.equal(calls[0].url, "https://example.test/api/public/articles?sceneCode=public.article_search&q=rust%20%26%20web&page=1");
  assert.equal(calls[0].timeout, 10_000);
});

test("transport retries failed reads with bounded backoff", async () => {
  let attempts = 0;
  const started = performance.now();
  globalThis.wx = {
    request(options) {
      attempts += 1;
      options.fail({ errMsg: "request:fail timeout" });
      return { abort() {} };
    },
  };
  const { default: { createWeappApi } } = await import("../../../target/weapp-test/lib/api.cjs");
  const result = await createWeappApi("https://example.test").search.get("rust", 1).start();
  assert.equal(result.ok, false);
  assert.equal(result.error.kind, "timeout");
  assert.equal(attempts, 3);
  assert.ok(performance.now() - started >= 700);
});

test("cancelling during backoff settles without another request", async () => {
  let attempts = 0;
  globalThis.wx = {
    request(options) {
      attempts += 1;
      options.fail({ errMsg: "request:fail network" });
      return { abort() {} };
    },
  };
  const { default: { createWeappApi } } = await import("../../../target/weapp-test/lib/api.cjs");
  const task = createWeappApi("https://example.test").search.get("rust", 1);
  const pending = task.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  task.cancel();
  assert.equal((await pending).error.kind, "cancelled");
  assert.equal(attempts, 1);
});
