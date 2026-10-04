# @fluvient-loom/mobile-prefetch

MPA 页面下的 Mobile API 预取与 Service Worker 响应复用能力——**闭环包**：客户端运行时、注册编排、Vite 插件与 SW 入口生成全部在包内，应用不写任何 SW 入口文件。

包不依赖 Solid 或 `@fluvient-loom/query`，现有 query/resource 链路继续通过原来的 `NetworkPort` 发请求；只要底层使用同源 `fetch`，SW 命中会对业务透明。

## 包内四件

| 出口 | 内容 |
| --- | --- |
| `.` | `createMobilePrefetchClient`（客户端运行时）、`registerMobilePrefetch`（注册编排）、`DEFAULT_SERVED_PATH` |
| `./service-worker` | SW 运行时（缓存/TTL/去重/白名单）+ `attachMobilePrefetch`（SW 全局接线） |
| `./vite` | Vite 插件：从 `apiPathPrefix` 生成 SW 入口（虚拟模块）并打包；dev 按需伺服、build 期产出 asset |

## 接入（应用侧两步）

```ts
// 1) vite.config.ts：插件自产 SW 入口，应用只给 API 前缀
import { mobilePrefetchServiceWorker } from "@fluvient-loom/mobile-prefetch/vite";

plugins: [
  mobilePrefetchServiceWorker(root, {
    apiPathPrefix: "/api/public/mobile/category-shelf",
  }),
];
```

```ts
// 2) 页面挂载后：注册编排（SW 注册、idle 调度、失败降级、观测标记）
import {
  DEFAULT_SERVED_PATH,
  registerMobilePrefetch,
} from "@fluvient-loom/mobile-prefetch";

void registerMobilePrefetch({
  serviceWorkerUrl: DEFAULT_SERVED_PATH,
  scope: "/m/",
  navigator: navigator.serviceWorker,
  enabled: () => isHomePath(window.location.pathname), // 哪些页参与预取
  resolveUrls: () => resolvePrefetchUrls(),            // 预取哪些 URL（应用 API 契约）
  marker: { statusKey: "mobilePrefetch", countKey: "mobilePrefetchCount" },
});
```

语义契约：每个页面无条件先注册 SW（注册失败 → 标记 failed/0）；`enabled()` 为 false 静默返回、不写标记；`resolveUrls` 抛错 → failed/0、返回 `[]` → complete/0；`prefetchAll` 结果决定 complete/failed 与计数；SW 不受支持时**不短路**，走完整流程后以 failed/0 观测。

## 契约与约定

- `DEFAULT_SERVED_PATH`（`/mobile-prefetch-sw.js`）与后端静态服务
  （`src/backend/product/src/static_files.rs`）硬编码路径一致，有包单测锚定；应用不要覆盖 `servedPath`。
- `marker` 键名与 `complete`/`failed` 词表是应用观测契约
  （消费方：`apps/blog/src/e2e/perf.ts`）；包内不硬编码键名。
- `scope`（如 `/m/`）是应用 URL 空间决策，不进包默认值。
- SW 只处理同源 GET 且路径在 `apiPathPrefix` 白名单内的请求；默认 TTL 60 秒、缓存名
  `mobile-prefetch-v1`；非 GET 或越界请求透传。
- `apiPathPrefix` 改动需重启 dev server（打包结果按进程缓存）。
- SW 产物由插件内嵌别名指向包自身的运行时源码，不依赖宿主 node_modules 解析。

## 与 query/resource 组合

现有 `@fluvient-loom/query`、`createDataResource` 和 Mobile API client 不需要替换。它们仍然调用现有 `NetworkPort`；浏览器端 `NetworkPort` 最终使用同源 `fetch` 时，Service Worker 会在网络层透明命中缓存。预取包本身不依赖 query，避免把缓存生命周期耦合进资源状态机。
