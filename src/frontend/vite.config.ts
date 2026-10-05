import { resolve } from "node:path";
import {
  compressArtifacts,
  generatePageInputs,
  pageBootstrap,
  pageRouteMap,
  pageRoutesPlugin,
  pageTemplatePlugin,
  syncSiteRoutesManifest,
  validatePageRegistry,
} from "@fluvient-loom/page-build-kit";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { MOBILE_CATEGORY_SHELF_ENDPOINT } from "./bootstrap/mobile-prefetch-plan.ts";
import { pageRegistry } from "./pages.registry.ts";
import { mobilePrefetchServiceWorker } from "@fluvient-loom/mobile-prefetch/vite";

const root = resolve(import.meta.dirname);
const apiOrigin = process.env.BLOG_API_ORIGIN ?? "http://127.0.0.1:8080";
// 工作台入口可见性是构建期决策：本地部署构建时设 BLOG_ADMIN_ENTRY=true，
// 服务器发布包（ops delivery package）不设——线上产物经死代码消除后连入口字符串都不存在。
const adminEntry = process.env.BLOG_ADMIN_ENTRY === "true";

// 注册表校验先于任何构建副作用：坏注册表让 dev 拒绝启动、build 直接失败，
// 而不是等到测试期或后端启动期（同一校验器也供 ops page check 复用）。
const registryViolations = validatePageRegistry(pageRegistry);
if (registryViolations.length > 0) {
  const detail = registryViolations
    .map(
      (violation) =>
        `  [${violation.rule}] ${violation.pageId ?? "-"}: ${violation.message}`,
    )
    .join("\n");
  throw new Error(`页面注册表校验失败：\n${detail}`);
}
// 清单与注册表投影保持同步（内容不变时不写盘），site-routes.json 由此生成。
syncSiteRoutesManifest(root, { write: true }, pageRegistry);

const routes = pageRouteMap(pageRegistry);
const pageInputs = generatePageInputs(root, pageRegistry);

export default defineConfig({
  plugins: [
    pageTemplatePlugin(pageRegistry),
    pageBootstrap(root, {
      registrations: pageRegistry,
      bootstrapEntry: "bootstrap/mobile-settings.tsx",
    }),
    mobilePrefetchServiceWorker(root, {
      apiPathPrefix: MOBILE_CATEGORY_SHELF_ENDPOINT,
    }),
    pageRoutesPlugin(routes),
    // 预压缩产物（.zst/.br/.gz）：product 静态服务按 Accept-Encoding 回发。
    compressArtifacts(),
    solid(),
  ],
  root,
  define: {
    __BLOG_ADMIN_ENTRY__: JSON.stringify(adminEntry),
  },
  build: {
    rolldownOptions: {
      input: pageInputs,
    },
  },
  server: {
    host: "127.0.0.1",
    proxy: { "/api": apiOrigin },
  },
});
