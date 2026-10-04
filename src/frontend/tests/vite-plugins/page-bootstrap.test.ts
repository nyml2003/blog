import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  generatedPagePath,
  pageBootstrap,
  renderPageHtml,
} from "@fluvient-loom/page-build-kit";
import { pageRegistry } from "../../pages.registry";

const frontendRoot = fileURLToPath(new URL("../../", import.meta.url));

test("the inlined bootstrap entry stays off page package roots", () => {
  // bootstrapEntry 由独立构建（configFile:false，无框架插件）打包：静态图里
  // 出现页面包 root 就会经 definition.load 拖入需要 JSX 的 page.tsx，生产
  // 构建在嵌套构建期直接失败（曾由 mobile-settings 经包根取
  // readMobileSettings 暴露）。取页面模型走其子路径，不碰登记。
  const source = readFileSync(
    resolve(frontendRoot, "bootstrap/mobile-settings.tsx"),
    "utf8",
  );
  assert.doesNotMatch(source, /from "@blog\/page-[a-z-]+"/);
});

test("one bootstrap build is shared by every registered mobile page", async () => {
  let bundleCount = 0;
  const plugin = pageBootstrap(frontendRoot, {
    registrations: pageRegistry,
    bootstrapEntry: "bootstrap/mobile-settings.tsx",
    dependencies: {
      bundle: async () => {
        bundleCount += 1;
        return 'window.bootstrap = "</script>";';
      },
    },
  });
  const transform = plugin.transformIndexHtml;
  assert.ok(
    transform && typeof transform === "object" && "handler" in transform,
  );
  // vite 的 handler 类型是携带 this 的递归 union（Hook | { handler }），
  // 读取位无法收窄；此处按实际实现签名显式收窄后调用。
  const invoke = transform.handler as (
    html: string,
    context: { path: string; filename: string },
  ) => Promise<unknown>;

  const results = await Promise.all(
    pageRegistry.map((page) =>
      invoke(renderPageHtml(page), {
        path: page.aliases[0],
        filename: generatedPagePath(frontendRoot, page),
      }),
    ),
  );

  assert.equal(bundleCount, 1);
  for (const [index, page] of pageRegistry.entries()) {
    const transformed = results[index];
    if (!page.bootstrap) {
      assert.equal(transformed, undefined);
      continue;
    }
    assert.ok(Array.isArray(transformed));
    assert.equal(transformed.length, 1);
    const script = transformed[0];
    assert.equal(script.tag, "script");
    assert.equal(script.injectTo, "head");
    assert.equal(script.attrs?.type, undefined);
    assert.equal(script.children, 'window.bootstrap = "<\\/script>";');
  }
});
