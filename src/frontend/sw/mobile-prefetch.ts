import { createMobilePrefetchServiceWorker } from "@fluvient-loom/mobile-prefetch/service-worker";

const runtime = createMobilePrefetchServiceWorker({
  apiPathPrefix: "/api/public/mobile/category-shelf",
});

runtime.install(self);
self.addEventListener("fetch", (event) => {
  event.respondWith(runtime.handleFetch(event.request));
});
self.addEventListener("message", (event) => runtime.handleMessage(event));
