import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { pageRegistry } from "../pages.registry";
import { pageBootstrap } from "./page-bootstrap";
import { generatedPagePath, renderPageHtml } from "./page-template";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));

test("one bootstrap build is shared by every registered mobile page", async () => {
  let bundleCount = 0;
  const plugin = pageBootstrap(frontendRoot, pageRegistry, {
    bundle: async () => {
      bundleCount += 1;
      return 'window.bootstrap = "</script>";';
    },
  });
  const transform = plugin.transformIndexHtml;
  assert.ok(
    transform && typeof transform === "object" && "handler" in transform,
  );

  const results = await Promise.all(
    pageRegistry.map((page) =>
      transform.handler(renderPageHtml(page), {
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
