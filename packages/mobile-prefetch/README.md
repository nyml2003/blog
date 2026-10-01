# @fluvient-loom/mobile-prefetch

MPA 页面下的 Mobile API 预取与 Service Worker 响应复用能力。包不依赖 Solid 或 `@fluvient-loom/query`，现有 query/resource 链路继续通过原来的 `NetworkPort` 发请求；只要底层使用同源 `fetch`，SW 命中会对业务透明。

页面侧只需注册并传入要预取的 URL：

```ts
import { createMobilePrefetchClient } from "@fluvient-loom/mobile-prefetch";

const prefetch = createMobilePrefetchClient({
  serviceWorkerUrl: "/mobile-prefetch.js",
  scope: "/m/",
});

await prefetch.register();
void prefetch.prefetchAllWhenIdle(categoryShelfUrls);
```

SW 入口由业务构建系统提供，包只提供运行时：

```ts
import { createMobilePrefetchServiceWorker } from "@fluvient-loom/mobile-prefetch/service-worker";

const runtime = createMobilePrefetchServiceWorker({
  apiPathPrefix: "/api/public/mobile/category-shelf",
});

self.addEventListener("fetch", (event) => {
  event.respondWith(runtime.handleFetch(event.request));
});
self.addEventListener("message", (event) => runtime.handleMessage(event));
runtime.install(self);
```

第一版只处理同源 GET API，默认 TTL 为 60 秒，默认缓存名为 `mobile-prefetch-v1`。HTML、后端响应头和业务 UI 不在包内处理。

## 与 query/resource 组合

现有 `@fluvient-loom/query`、`createDataResource` 和 Mobile API client 不需要替换。它们仍然调用现有 `NetworkPort`；浏览器端 `NetworkPort` 最终使用同源 `fetch` 时，Service Worker 会在网络层透明命中缓存。预取包本身不依赖 query，避免把缓存生命周期耦合进资源状态机。
