import test from "node:test";
import assert from "node:assert/strict";
import {
  createMobilePrefetchClient,
  type ServiceWorkerContainerLike,
} from "../src/client.ts";

test("client registers and sends prefetch URLs through the active worker", async () => {
  const messages: unknown[] = [];
  let idleCalled = false;
  const registration = {
    active: {
      postMessage(message: unknown, transfer?: readonly unknown[]) {
        messages.push(message);
        const port = transfer?.[0] as
          | { postMessage(message: unknown): void }
          | undefined;
        port?.postMessage({ status: "accepted", prefetched: 2 });
      },
    },
  };
  const navigatorBinding: ServiceWorkerContainerLike = {
    register: async () => registration,
    ready: Promise.resolve(registration),
  };
  const client = createMobilePrefetchClient({
    serviceWorkerUrl: "/mobile-prefetch.js",
    navigator: navigatorBinding,
    requestIdleCallback(callback) {
      idleCalled = true;
      callback();
      return 1;
    },
  });

  await client.register();
  const result = await client.prefetchAllWhenIdle(["/api/a", "/api/b"]);
  assert.equal(client.supported, true);
  assert.equal(idleCalled, true);
  assert.deepEqual(result, { status: "accepted", prefetched: 2 });
  assert.deepEqual(messages, [
    { type: "mobile-prefetch/prefetch", urls: ["/api/a", "/api/b"] },
  ]);
});

test("client degrades without Service Worker support", async () => {
  const client = createMobilePrefetchClient({
    serviceWorkerUrl: "/mobile-prefetch.js",
    navigator: undefined,
  });
  assert.equal(client.supported, false);
  assert.deepEqual(await client.prefetchAll([]), {
    status: "unsupported",
    prefetched: 0,
  });
  await client.register();
});
