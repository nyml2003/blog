import { resolve } from "node:path";
import { pageRegistry, pageRoutes } from "../pages.registry.ts";
import {
  syncSiteRoutesManifest,
  validatePageRegistry,
} from "@fluvient-loom/page-build-kit";

// CLI 入口：pnpm -C src/frontend run page:check（校验 + 清单同步检查）
// 与 page:generate（校验 + 重新写出清单）。ops page check 包装前者。
const write = process.argv.includes("--write");
const root = resolve(import.meta.dirname, "..");

const violations = validatePageRegistry(pageRegistry);
if (violations.length > 0) {
  console.error(`页面注册表校验失败（${violations.length} 项）：`);
  for (const violation of violations) {
    console.error(
      `  [${violation.rule}] ${violation.pageId ?? "-"}: ${violation.message}`,
    );
  }
  process.exit(1);
}
console.log(
  `页面注册表校验通过：${pageRegistry.length} 页 / ${pageRoutes().length} 个 alias`,
);

const sync = syncSiteRoutesManifest(root, { write }, pageRegistry);
if (sync.changed) {
  if (write) {
    console.log(`site-routes.json 已重新生成：${sync.path}`);
  } else {
    console.error(
      "site-routes.json 与注册表投影不一致；运行 pnpm -C src/frontend run page:generate 后提交。",
    );
    process.exit(1);
  }
} else {
  console.log("site-routes.json 与注册表投影一致");
}
