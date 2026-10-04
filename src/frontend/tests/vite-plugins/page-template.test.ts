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
  serializePageRoutes,
  validatePageRegistry,
} from "@fluvient-loom/page-build-kit";
import { siteRoutesSchema as desktopSiteRoutesSchema } from "../../desktop/foundation/api";
import { siteRoutesSchema } from "../../mobile/foundation/api";
import { pageRegistry, pageRoutes } from "../../pages.registry";
import { realEntryExists } from "../../page-registry/host";

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

const expectedRoutes = [
  ["/", "desktop/pages/public-home/index.html"],
  ["/articles/index.html", "desktop/pages/public-articles/index.html"],
  ["/articles/detail.html", "desktop/pages/public-detail/index.html"],
  ["/admin/login.html", "desktop/pages/admin-login/index.html"],
  ["/admin/index.html", "desktop/pages/admin-home/index.html"],
  ["/admin", "desktop/pages/admin-home/index.html"],
  ["/admin/", "desktop/pages/admin-home/index.html"],
  ["/admin/articles/new.html", "desktop/pages/admin-article-new/index.html"],
  ["/admin/articles/edit.html", "desktop/pages/admin-article-edit/index.html"],
  [
    "/admin/editor-guide/index.html",
    "desktop/pages/admin-editor-guide/index.html",
  ],
  [
    "/admin/content/workspace.html",
    "desktop/pages/admin-article-types/index.html",
  ],
  [
    "/admin/article-types/index.html",
    "desktop/pages/admin-article-types/index.html",
  ],
  ["/admin/terms/index.html", "desktop/pages/admin-terms/index.html"],
  [
    "/admin/articles/preview/desktop.html",
    "desktop/pages/admin-article-preview-desktop/index.html",
  ],
  ["/m/", "mobile/pages/home/index.html"],
  ["/m", "mobile/pages/home/index.html"],
  ["/m/articles/index.html", "mobile/pages/articles/index.html"],
  ["/m/articles/list.html", "mobile/pages/article-list/index.html"],
  ["/m/articles/detail.html", "mobile/pages/article-detail/index.html"],
  ["/m/settings/index.html", "mobile/pages/settings/index.html"],
  [
    "/admin/articles/preview/mobile.html",
    "mobile/pages/admin-article-preview-content/index.html",
  ],
  [
    "/admin/articles/preview/mobile/content.html",
    "mobile/pages/admin-article-preview-content/index.html",
  ],
] as const;

test("the real registry passes the build-kit validator", () => {
  assert.deepEqual(
    [...validatePageRegistry(pageRegistry, { entryExists: realEntryExists })],
    [],
  );
});

test("the frozen alias list matches the registry projection in order", () => {
  // 冻结清单是页面集合的唯一 tripwire：新增/改动页面必须同步这里
  // （ops page new 会代为追加行）。重复 id/alias 等语义违例由
  // page-registry 校验器负责，不在这里重复。
  assert.deepEqual(
    pageRoutes().map((route) => [route.alias, route.outputPath]),
    expectedRoutes,
  );
  assert.doesNotThrow(() => JSON.parse(serializePageRoutes(pageRoutes())));
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

test("generated HTML has the shared head and exact registered entry", () => {
  for (const page of pageRegistry) {
    const html = renderPageHtml(page);
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<html lang="zh-CN">/);
    assert.match(html, /<meta charset="UTF-8" \/>/);
    assert.match(
      html,
      /<meta name="viewport" content="width=device-width, initial-scale=1" \/>/,
    );
    assert.match(html, /<meta name="theme-color" content="#f4f1ea" \/>/);
    assert.ok(html.includes(`<title>${page.title}</title>`));
    assert.ok(html.includes(`src="${page.entry}"`));
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

test("registered entries use the bootstrap and mobile has one CSS entry", () => {
  const entryFiles = new Set(pageRegistry.map((page) => page.entry));
  for (const entry of entryFiles) {
    const source = readFileSync(resolve(frontendRoot, entry.slice(1)), "utf8");
    if (/(?:^\/app)?\/bootstrap\/mobile\//.test(entry)) {
      assert.match(source, /mountMobilePage\([^;]+\);/);
    } else if (/(?:^\/app)?\/bootstrap\/desktop\//.test(entry)) {
      assert.match(source, /mountDesktopPage\([^;]+\);/);
    }
    assert.doesNotMatch(source, /getElementById\("app"\)/);
    assert.doesNotMatch(source, /from "solid-js\/web"/);
  }

  for (const page of pageRegistry.filter(
    (entry) => entry.platform === "mobile",
  )) {
    const source = readFileSync(
      resolve(frontendRoot, page.entry.slice(1)),
      "utf8",
    );
    assert.equal(
      source.match(/import "(?:\.\.\/)+mobile\/foundation\/styles\/app\.css";/g)
        ?.length,
      1,
    );
  }

  const mobileStyles = readFileSync(
    resolve(frontendRoot, "mobile/foundation/styles/app.css"),
    "utf8",
  );
  assert.deepEqual(mobileStyles.trim().split("\n"), [
    '@import "@fluvient-loom/mobile-h5-solid-atoms/styles.css";',
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
    '@import "../ui/styles/themes.css";',
    '@import "../ui/styles/molecules.css";',
  ]);
});
