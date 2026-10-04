import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  generatePageInputs,
  generateSiteRoutesManifest,
  generatedPagePath,
  renderPageHtml,
  validatePageRegistry,
} from "@fluvient-loom/page-build-kit";
import { siteRoutesSchema as desktopSiteRoutesSchema } from "@blog/desktop-api";
import { siteRoutesSchema } from "@blog/mobile-api";
import { pageRegistry } from "../../pages.registry";

const frontendRoot = fileURLToPath(new URL("../../", import.meta.url));

const ignoredHtmlDirectories = new Set([".generated", "dist", "node_modules"]);

function sourceHtmlFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (ignoredHtmlDirectories.has(entry.name)) return [];
      return sourceHtmlFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".html") ? [path] : [];
  });
}

test("the real registry passes the build-kit validator", () => {
  assert.deepEqual(
    [...validatePageRegistry(pageRegistry)],
    [],
  );
});

test("site-routes.json manifest matches the registry projection", () => {
  // 清单是生成物（canonical = aliases[0]，由 page-registry/generate.ts 产出），
  // 守卫从"集合一致"升级为"重新生成逐字节一致"；漂移时运行
  // pnpm -C src/frontend run page:generate 并提交。
  const onDisk = readFileSync(
    resolve(frontendRoot, "site-routes.json"),
    "utf8",
  );
  assert.equal(onDisk, generateSiteRoutesManifest(pageRegistry));
});

test("embedded site-routes manifest satisfies both runtime schemas", () => {
  // Desktop 与 Mobile bootstrap 均在构建期内嵌这份清单（SPEC-SITE-ROUTES-001），
  // 形状必须通过两端运行时同一个 zod schema（多余字段被剥离），
  // 且覆盖全部注册页面 id。
  const manifest = JSON.parse(
    readFileSync(resolve(frontendRoot, "site-routes.json"), "utf8"),
  );
  for (const schema of [desktopSiteRoutesSchema, siteRoutesSchema]) {
    const parsed = schema.safeParse(manifest);
    assert.ok(parsed.success, "manifest must satisfy siteRoutesSchema");
    for (const page of pageRegistry) {
      assert.ok(
        typeof parsed.data.routes[page.id] === "string" &&
          parsed.data.routes[page.id] !== "",
        `manifest must provide route: ${page.id}`,
      );
    }
  }
});

test("generated HTML has the shared head, page id, and platform entry", () => {
  for (const page of pageRegistry) {
    const html = renderPageHtml(page);
    assert.match(html, /^<!doctype html>/);
    assert.match(html, new RegExp(`<html lang="zh-CN" data-page-id="${page.id}">`));
    assert.match(html, /<meta charset="UTF-8" \/>/);
    assert.match(
      html,
      /<meta name="viewport" content="width=device-width, initial-scale=1" \/>/,
    );
    assert.match(html, /<meta name="theme-color" content="#f4f1ea" \/>/);
    assert.ok(html.includes(`<title>${page.title}</title>`));
    // 统一入口：script 指向平台 main.tsx，不逐页建入口
    const expectedEntry = page.platform === "desktop"
      ? "/bootstrap/desktop/main.tsx"
      : "/bootstrap/mobile/main.tsx";
    assert.ok(html.includes(`src="${expectedEntry}"`), `entry mismatch for ${page.id}`);
    assert.doesNotMatch(
      page.title,
      /\b(?:Blog|Admin|Article|Articles|New|Edit)\b/,
    );
  }
});

test("mobile article detail injects an app shell before the application mount", () => {
  const page = pageRegistry.find(
    (entry) => entry.id === "mobile-article-detail",
  );
  assert.ok(page);
  const html = renderPageHtml(page);
  const shellOffset = html.indexOf('data-loom-app-shell="true"');
  const appOffset = html.indexOf('<div id="app"></div>');

  assert.ok(shellOffset >= 0);
  assert.ok(html.includes("<style data-loom-app-shell>"));
  assert.ok(html.includes('aria-hidden="true"'));
  assert.ok(shellOffset < appOffset);
  assert.deepEqual(
    pageRegistry
      .filter((entry) => entry.shell !== undefined)
      .map((entry) => entry.id),
    ["mobile-article-detail"],
  );
});

test("the generator writes one input per page without source HTML", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "blog-page-template-"));
  try {
    const inputs = generatePageInputs(tempRoot, pageRegistry);
    assert.equal(Object.keys(inputs).length, pageRegistry.length);
    for (const page of pageRegistry) {
      const filename = generatedPagePath(tempRoot, page);
      assert.equal(inputs[page.id], filename);
      assert.equal(readFileSync(filename, "utf8"), renderPageHtml(page));
      assert.equal(
        existsSync(resolve(frontendRoot, page.outputPath)),
        false,
        `${page.outputPath} must be generated instead of hand-written`,
      );
    }
    assert.deepEqual(
      sourceHtmlFiles(frontendRoot),
      [],
      "all frontend HTML must come from the page registry generator",
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("platform main entries mount pages and mobile imports CSS once", () => {
  // 统一入口：每端一个 main.tsx，含挂载调用和 CSS 引入
  const desktopMain = readFileSync(
    resolve(frontendRoot, "bootstrap/desktop/main.tsx"),
    "utf8",
  );
  assert.match(desktopMain, /mountDesktopApplication/);
  assert.match(desktopMain, /home\.css/);
  assert.doesNotMatch(desktopMain, /getElementById\("app"\)/);

  const mobileMain = readFileSync(
    resolve(frontendRoot, "bootstrap/mobile/main.tsx"),
    "utf8",
  );
  assert.match(mobileMain, /mountMobileApplication/);
  assert.match(mobileMain, /app\.css/);
  assert.doesNotMatch(mobileMain, /getElementById\("app"\)/);

  const mobileStyles = readFileSync(
    resolve(frontendRoot, "mobile/foundation/styles/app.css"),
    "utf8",
  );
  assert.deepEqual(mobileStyles.trim().split("\n"), [
    '@import "@blog/mobile-h5-solid-atoms/styles.css";',
    '@import "@fluvient-loom/app-shell/styles.css";',
    '@import "./tokens.css";',
    '@import "./base.css";',
    '@import "./shell.css";',
    '@import "./layout.css";',
    '@import "./components.css";',
    '@import "./shelf.css";',
    '@import "./detail.css";',
    '@import "./article-body.css";',
    '@import "./browse.css";',
    '@import "./pages.css";',
    '@import "@blog/mobile-shared/styles.css";',
  ]);
});
