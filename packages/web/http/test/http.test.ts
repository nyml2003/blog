import assert from "node:assert/strict";
import test from "node:test";
import { createCancellationSource } from "@fluvient/core";
import { classifyTransportFailure, httpStatusError } from "../src/error.ts";
import { createHttpKernel } from "../src/kernel.ts";
import type { HttpError } from "../src/error.ts";


const encoder = new TextEncoder();

function hangingFetcher(): typeof fetch {
  return ((_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
    })) as typeof fetch;
}

function stalledBodyResponse(firstChunk: string): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(firstChunk));
        // Intentionally never closes: the next read hangs forever.
      },
    }),
  );
}

function codedError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

test("round-trips a real (data:) request through global fetch", async () => {
  const kernel = createHttpKernel();
  const payload = JSON.stringify({ theme: "dark" });
  const result = await kernel.request({
    url: `data:application/json;base64,${btoa(payload)}`,
  });
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.value.status, 200);
  assert.equal(await result.value.readText(), payload);
  assert.ok(result.value.finalUrl.startsWith("data:"));
});

test("readText returns the decoded body with headers and content length", async () => {
  const kernel = createHttpKernel({
    fetcher: async () =>
      new Response("hello", {
        status: 200,
        headers: { "content-type": "text/plain", "content-length": "5" },
      }),
  });
  const result = await kernel.request({ url: "https://example.invalid/a" });
  assert.ok(result.ok);
  assert.equal(result.value.headers["content-type"], "text/plain");
  assert.equal(result.value.contentLength, 5);
  assert.equal(await result.value.readText(), "hello");
});

test("readStream reports chunk bytes with known and unknown totals", async () => {
  const kernel = createHttpKernel({
    fetcher: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode("abc"));
            controller.enqueue(encoder.encode("de"));
            controller.close();
          },
        }),
        { headers: { "content-length": "5" } },
      ),
  });
  const seen: string[] = [];
  const infos: number[] = [];
  const result = await kernel.request({ url: "https://example.invalid/a" });
  assert.ok(result.ok);
  const final = await result.value.readStream((chunk, info) => {
    seen.push(new TextDecoder().decode(chunk));
    infos.push(info.received);
    assert.equal(info.total, 5);
  });
  assert.deepEqual(seen, ["abc", "de"]);
  assert.deepEqual(infos, [3, 5]);
  assert.deepEqual(final, { received: 5, total: 5 });

  const unknown = await createHttpKernel({
    fetcher: async () => new Response(encoder.encode("xyz")),
  }).request({ url: "https://example.invalid/b" });
  assert.ok(unknown.ok);
  assert.equal(unknown.value.contentLength, undefined);
  const tail = await unknown.value.readStream(() => undefined);
  assert.deepEqual(tail, { received: 3, total: undefined });
});

test("HEAD responses carry content length without a body", async () => {
  const kernel = createHttpKernel({
    fetcher: async () => new Response(null, { headers: { "content-length": "1024" } }),
  });
  const result = await kernel.request({ url: "https://example.invalid/asset", method: "HEAD" });
  assert.ok(result.ok);
  assert.equal(result.value.contentLength, 1024);
  assert.equal(await result.value.readText(), "");
  assert.deepEqual(await result.value.readStream(() => undefined), {
    received: 0,
    total: 1024,
  });
});

test("a headers timeout classifies as retryable timeout", async () => {
  const kernel = createHttpKernel({ fetcher: hangingFetcher() });
  const result = await kernel.request({
    url: "https://example.invalid/a",
    timeouts: { headersMs: 10 },
  });
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "timeout");
  assert.equal(result.error.retryable, true);
});

test("a stalled body trips the body-idle timeout", async () => {
  const kernel = createHttpKernel({
    fetcher: async () => stalledBodyResponse("partial"),
  });
  const result = await kernel.request({
    url: "https://example.invalid/a",
    timeouts: { bodyIdleMs: 10 },
  });
  assert.ok(result.ok);
  await assert.rejects(
    () => result.value.readText(),
    (error: HttpError) => error.kind === "timeout",
  );
});

test("the total deadline aborts mid-body reads", async () => {
  const kernel = createHttpKernel({
    fetcher: async () => stalledBodyResponse("partial"),
  });
  const result = await kernel.request({
    url: "https://example.invalid/a",
    timeouts: { totalMs: 10 },
  });
  assert.ok(result.ok);
  await assert.rejects(
    () => result.value.readStream(() => undefined),
    (error: HttpError) => error.kind === "timeout",
  );
});

test("a pre-cancelled signal short-circuits with a cancellation failure", async () => {
  const kernel = createHttpKernel({ fetcher: hangingFetcher() });
  const source = createCancellationSource();
  source.cancel();
  const result = await kernel.request({ url: "https://example.invalid/a", signal: source.signal });
  assert.deepEqual(result, { ok: false, error: { kind: "cancelled" } });
});

test("cancelling mid-flight settles as a cancellation failure", async () => {
  const kernel = createHttpKernel({ fetcher: hangingFetcher() });
  const source = createCancellationSource();
  const pending = kernel.request({ url: "https://example.invalid/a", signal: source.signal });
  source.cancel();
  const result = await pending;
  assert.deepEqual(result, { ok: false, error: { kind: "cancelled" } });
});

test("transport causes classify into dns/tls/connection/reset/transport", () => {
  const dns = classifyTransportFailure(
    new TypeError("fetch failed", { cause: codedError("ENOTFOUND") }),
    "https://a.invalid",
  );
  assert.equal(dns.kind, "dns");
  assert.equal(dns.retryable, false);
  assert.equal(dns.url, "https://a.invalid");

  const dnsAgain = classifyTransportFailure(
    new TypeError("fetch failed", { cause: codedError("EAI_AGAIN") }),
  );
  assert.equal(dnsAgain.kind, "dns");
  assert.equal(dnsAgain.retryable, true);

  const tls = classifyTransportFailure(
    new TypeError("fetch failed", { cause: codedError("SELF_SIGNED_CERT_IN_CHAIN") }),
  );
  assert.equal(tls.kind, "tls");
  assert.equal(tls.retryable, false);

  const refused = classifyTransportFailure(
    new TypeError("fetch failed", { cause: codedError("ECONNREFUSED") }),
  );
  assert.equal(refused.kind, "connection");
  assert.equal(refused.retryable, false);

  const reset = classifyTransportFailure(
    new TypeError("fetch failed", { cause: codedError("ECONNRESET") }),
  );
  assert.equal(reset.kind, "reset");
  assert.equal(reset.retryable, true);

  const unknown = classifyTransportFailure(new TypeError("fetch failed"));
  assert.equal(unknown.kind, "transport");
  assert.equal(unknown.retryable, true);
});

test("a thrown fetcher surfaces its classified failure", async () => {
  const kernel = createHttpKernel({
    fetcher: async () => {
      throw new TypeError("fetch failed", { cause: codedError("ECONNRESET") });
    },
  });
  const result = await kernel.request({ url: "https://example.invalid/a" });
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "reset");
});

test("httpStatusError marks 408/429/5xx retryable and the rest final", () => {
  assert.equal(httpStatusError(404).retryable, false);
  assert.equal(httpStatusError(400).retryable, false);
  assert.equal(httpStatusError(408).retryable, true);
  assert.equal(httpStatusError(429).retryable, true);
  assert.equal(httpStatusError(500).retryable, true);
  assert.equal(httpStatusError(503).retryable, true);
  const error = httpStatusError(503, "https://example.invalid/a");
  assert.equal(error.status, 503);
  assert.equal(error.kind, "status");
});
