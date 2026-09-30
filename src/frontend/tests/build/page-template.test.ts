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
import { pageRegistry, pageRoutes } from "../../pages.registry";
import { siteRoutesSchema } from "../../app/habitat/api/mobile";
import {
  generatedPagePath,
  generatePageInputs,
  renderPageHtml,
  serializePageRoutes,
} from "../../build/page-template";

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
  ["/admin", "desktop/pages/admin-home/index.html"],
  ["/admin/", "desktop/pages/admin-home/index.html"],
  ["/admin/index.html", "desktop/pages/admin-home/index.html"],
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
  ["/m", "mobile/pages/home/index.html"],
  ["/m/", "mobile/pages/home/index.html"],
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

test("the registry covers 17 pages and the frozen 22 aliases", () => {
  assert.equal(pageRegistry.length, 17);
  assert.deepEqual(
    pageRoutes().map((route) => [route.alias, route.outputPath]),
    expectedRoutes,
  );
  assert.equal(new Set(pageRegistry.map((page) => page.id)).size, 17);
  assert.equal(new Set(pageRegistry.map((page) => page.outputPath)).size, 17);
  assert.equal(new Set(pageRoutes().map((route) => route.alias)).size, 22);
  assert.doesNotThrow(() => JSON.parse(serializePageRoutes(pageRoutes())));
});

test("site-routes.json manifest stays in sync with the page registry", () => {
  // 清单是后端下发路由的唯一来源（protocol include_str! 内嵌），
  // 键必须是注册表页面 id，值必须是该页面的已注册 alias。
  const manifest = JSON.parse(
    readFileSync(resolve(frontendRoot, "site-routes.json"), "utf8"),
  ) as { version: number; routes: Record<string, string> };
  assert.equal(manifest.version, 1);
  assert.deepEqual(
    Object.keys(manifest.routes).sort(),
    pageRegistry.map((page) => page.id).sort(),
  );
  for (const [id, path] of Object.entries(manifest.routes)) {
    const aliases: readonly string[] =
      pageRegistry.find((page) => page.id === id)?.aliases ?? [];
    assert.ok(
      aliases.includes(path),
      `manifest route ${id} -> ${path} must be a registered alias`,
    );
  }
});

test("embedded site-routes manifest satisfies the mobile runtime schema", () => {
  // Mobile bootstrap 在构建期内嵌这份清单，形状必须能通过运行时同一个
  // zod schema（多余字段被剥离），且覆盖 Mobile 页面实际引用的路由 id。
  const manifest = JSON.parse(
    readFileSync(resolve(frontendRoot, "site-routes.json"), "utf8"),
  );
  const parsed = siteRoutesSchema.safeParse(manifest);
  assert.ok(parsed.success, `manifest must satisfy siteRoutesSchema`);
  const mobileRouteIds = [
    "mobile-home",
    "mobile-articles",
    "mobile-article-list",
    "mobile-article-detail",
    "mobile-settings",
    "mobile-admin-article-preview",
  ] as const;
  for (const id of mobileRouteIds) {
    assert.ok(
      typeof parsed.data.routes[id] === "string" &&
        parsed.data.routes[id] !== "",
      `manifest must provide route: ${id}`,
    );
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

test("the generator writes one input per page without source HTML", () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "blog-page-template-"));
  try {
    const inputs = generatePageInputs(tempRoot);
    assert.equal(Object.keys(inputs).length, 17);
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

test("registered entries use definePage and mobile has one CSS entry", () => {
  const entryFiles = new Set(pageRegistry.map((page) => page.entry));
  for (const entry of entryFiles) {
    const source = readFileSync(resolve(frontendRoot, entry.slice(1)), "utf8");
    if (entry.startsWith("/app/bootstrap/mobile/")) {
      assert.match(source, /mountMobilePage\([^;]+\);/);
    } else if (entry.startsWith("/app/bootstrap/desktop/")) {
      assert.match(source, /mountDesktopPage\([^;]+\);/);
    } else {
      assert.match(source, /definePage\([A-Za-z]+\);/);
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
    if (page.entry.startsWith("/app/bootstrap/")) {
      assert.equal(
        source.match(/import "\.\.\/\.\.\/habitat\/mobile\/styles\/app\.css";/g)
          ?.length,
        1,
      );
    } else {
      assert.equal(
        source.match(/import "\.\.\/\.\.\/styles\/app\.css";/g)?.length,
        1,
      );
      assert.equal(source.match(/import ".*styles\/.*\.css";/g)?.length, 1);
    }
  }

  const mobileStyles = readFileSync(
    resolve(frontendRoot, "mobile/styles/app.css"),
    "utf8",
  );
  assert.deepEqual(mobileStyles.trim().split("\n"), [
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
    '@import "../../mobile-ui/styles/themes.css";',
    '@import "../../mobile-ui/styles/atoms.css";',
    '@import "../../mobile-ui/styles/molecules.css";',
  ]);
});
