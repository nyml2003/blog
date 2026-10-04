import test from "node:test";
import assert from "node:assert/strict";
import type { ServiceWorkerContainerLike } from "../src/client.ts";
import { registerMobilePrefetch } from "../src/register.ts";

interface MarkerRecord {
  readonly dataset: Record<string, string | undefined>;
}

function markerRecord(): MarkerRecord {
  return { dataset: {} };
}

function activeWorkerRegistration(
  reply: { status: string; prefetched: number } | null,
) {
  return {
    active:
      reply === null
        ? null
        : {
            postMessage(message: unknown, transfer?: readonly unknown[]) {
              const port = transfer?.[0] as
                | { postMessage(message: unknown): void }
                | undefined;
              port?.postMessage(reply);
            },
          },
  };
}

function containerWith(registration: {
  active: unknown;
}): ServiceWorkerContainerLike {
  return {
    register: async () =>
      registration as Awaited<
        ReturnType<ServiceWorkerContainerLike["register"]>
      >,
    ready: Promise.resolve(
      registration as Awaited<
        ReturnType<ServiceWorkerContainerLike["register"]>
      >,
    ),
  };
}

function immediateIdle(onCall?: () => void) {
  return (callback: () => void) => {
    onCall?.();
    callback();
    return 1;
  };
}

test("registration failure marks failed/0 and skips the plan", async () => {
  const marker = markerRecord();
  const order: string[] = [];
  const container: ServiceWorkerContainerLike = {
    register: async () => {
      throw new Error("registration denied");
    },
    ready: Promise.resolve({ active: null }),
  };

  await registerMobilePrefetch({
    serviceWorkerUrl: "/mobile-prefetch-sw.js",
    scope: "/m/",
    navigator: container,
    enabled: () => {
      order.push("enabled");
      return true;
    },
    resolveUrls: () => {
      order.push("resolveUrls");
      return [];
    },
    marker: {
      statusKey: "mobilePrefetch",
      countKey: "mobilePrefetchCount",
      root: marker,
    },
    requestIdleCallback: immediateIdle(() => order.push("idle")),
  });

  assert.deepEqual(marker.dataset, {
    mobilePrefetch: "failed",
    mobilePrefetchCount: "0",
  });
  assert.deepEqual(order, []);
});

test("enabled=false after successful registration returns silently without markers", async () => {
  const marker = markerRecord();
  let resolveCalls = 0;
  let idleCalls = 0;

  await registerMobilePrefetch({
    serviceWorkerUrl: "/mobile-prefetch-sw.js",
    navigator: containerWith(activeWorkerRegistration(null)),
    enabled: () => false,
    resolveUrls: () => {
      resolveCalls += 1;
      return [];
    },
    marker: {
      statusKey: "mobilePrefetch",
      countKey: "mobilePrefetchCount",
      root: marker,
    },
    requestIdleCallback: immediateIdle(() => {
      idleCalls += 1;
    }),
  });

  assert.deepEqual(marker.dataset, {});
  assert.equal(resolveCalls, 0);
  assert.equal(idleCalls, 0);
});

test("idle runs before the plan and a plan failure marks failed/0", async () => {
  const marker = markerRecord();
  const order: string[] = [];

  await registerMobilePrefetch({
    serviceWorkerUrl: "/mobile-prefetch-sw.js",
    navigator: containerWith(activeWorkerRegistration(null)),
    resolveUrls: () => {
      order.push("resolveUrls");
      throw new Error("category shelf unavailable");
    },
    marker: {
      statusKey: "mobilePrefetch",
      countKey: "mobilePrefetchCount",
      root: marker,
    },
    requestIdleCallback: immediateIdle(() => order.push("idle")),
  });

  assert.deepEqual(order, ["idle", "resolveUrls"]);
  assert.deepEqual(marker.dataset, {
    mobilePrefetch: "failed",
    mobilePrefetchCount: "0",
  });
});

test("an empty plan marks complete/0", async () => {
  const marker = markerRecord();
  await registerMobilePrefetch({
    serviceWorkerUrl: "/mobile-prefetch-sw.js",
    navigator: containerWith(activeWorkerRegistration(null)),
    resolveUrls: () => [],
    marker: {
      statusKey: "mobilePrefetch",
      countKey: "mobilePrefetchCount",
      root: marker,
    },
    requestIdleCallback: immediateIdle(),
  });
  assert.deepEqual(marker.dataset, {
    mobilePrefetch: "complete",
    mobilePrefetchCount: "0",
  });
});

test("accepted prefetch marks complete/count, status written before count", async () => {
  const marker = markerRecord();
  await registerMobilePrefetch({
    serviceWorkerUrl: "/mobile-prefetch-sw.js",
    navigator: containerWith(
      activeWorkerRegistration({ status: "accepted", prefetched: 3 }),
    ),
    resolveUrls: () => ["/api/a", "/api/b", "/api/c"],
    marker: {
      statusKey: "mobilePrefetch",
      countKey: "mobilePrefetchCount",
      root: marker,
    },
    requestIdleCallback: immediateIdle(),
  });
  assert.deepEqual(marker.dataset, {
    mobilePrefetch: "complete",
    mobilePrefetchCount: "3",
  });
  assert.deepEqual(Object.keys(marker.dataset), [
    "mobilePrefetch",
    "mobilePrefetchCount",
  ]);
});

test("a failed prefetch result marks failed with its count", async () => {
  const marker = markerRecord();
  await registerMobilePrefetch({
    serviceWorkerUrl: "/mobile-prefetch-sw.js",
    navigator: containerWith(activeWorkerRegistration(null)),
    resolveUrls: () => ["/api/a"],
    marker: {
      statusKey: "mobilePrefetch",
      countKey: "mobilePrefetchCount",
      root: marker,
    },
    requestIdleCallback: immediateIdle(),
  });
  assert.deepEqual(marker.dataset, {
    mobilePrefetch: "failed",
    mobilePrefetchCount: "0",
  });
});

test("unsupported environments still run the full flow (no short-circuit)", async () => {
  // 不传 navigator：node 全局 navigator 无 serviceWorker → supported=false。
  // 语义契约：不支持也不短路——resolveUrls 仍被调用，最终 unsupported → failed/0。
  const marker = markerRecord();
  let resolveCalls = 0;
  await registerMobilePrefetch({
    serviceWorkerUrl: "/mobile-prefetch-sw.js",
    resolveUrls: () => {
      resolveCalls += 1;
      return ["/api/a"];
    },
    marker: {
      statusKey: "mobilePrefetch",
      countKey: "mobilePrefetchCount",
      root: marker,
    },
    requestIdleCallback: immediateIdle(),
  });
  assert.equal(resolveCalls, 1);
  assert.deepEqual(marker.dataset, {
    mobilePrefetch: "failed",
    mobilePrefetchCount: "0",
  });
});

test("without a marker option no DOM write is attempted", async () => {
  await registerMobilePrefetch({
    serviceWorkerUrl: "/mobile-prefetch-sw.js",
    navigator: containerWith(
      activeWorkerRegistration({ status: "accepted", prefetched: 1 }),
    ),
    resolveUrls: () => ["/api/a"],
    requestIdleCallback: immediateIdle(),
  });
});
