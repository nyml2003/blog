import { resolve } from "node:path";
import {
  generatePageInputs,
  pageBootstrap,
  pageRouteMap,
  pageRoutesPlugin,
  pageTemplatePlugin,
  validatePageRegistry,
} from "@fluvient-loom/page-build-kit";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { pageRegistry } from "./pages.registry.ts";
import { mobilePrefetchServiceWorker } from "./vite-plugins/mobile-prefetch.ts";
import {
  realEntryExists,
  syncSiteRoutesManifest,
} from "./page-registry/host.ts";

const root = resolve(import.meta.dirname);
const apiOrigin = process.env.BLOG_API_ORIGIN ?? "http://127.0.0.1:8080";

// 注册表校验先于任何构建副作用：坏注册表让 dev 拒绝启动、build 直接失败，
// 而不是等到测试期或后端启动期（同一校验器也供 ops page check 复用）。
const registryViolations = validatePageRegistry(pageRegistry, {
  entryExists: realEntryExists,
});
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
syncSiteRoutesManifest(root, { write: true });

const routes = pageRouteMap(pageRegistry);
const pageInputs = generatePageInputs(root, pageRegistry);

export default defineConfig({
  plugins: [
    pageTemplatePlugin(pageRegistry),
    pageBootstrap(root, {
      registrations: pageRegistry,
      bootstrapEntry: "bootstrap/mobile/settings.tsx",
    }),
    mobilePrefetchServiceWorker(root),
    pageRoutesPlugin(routes),
    solid(),
  ],
  root,
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
