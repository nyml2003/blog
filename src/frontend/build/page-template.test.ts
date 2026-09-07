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
import { pageRegistry, pageRoutes } from "../pages.registry";
import {
  generatedPagePath,
  generatePageInputs,
  renderPageHtml,
  serializePageRoutes,
} from "./page-template";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));

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

test("the registry covers 16 pages and the frozen 20 aliases", () => {
  assert.equal(pageRegistry.length, 16);
  assert.deepEqual(
    pageRoutes().map((route) => [route.alias, route.outputPath]),
    expectedRoutes,
  );
  assert.equal(new Set(pageRegistry.map((page) => page.id)).size, 16);
  assert.equal(new Set(pageRegistry.map((page) => page.outputPath)).size, 16);
  assert.equal(new Set(pageRoutes().map((route) => route.alias)).size, 20);
  assert.doesNotThrow(() => JSON.parse(serializePageRoutes(pageRoutes())));
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
    assert.equal(Object.keys(inputs).length, 16);
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
    assert.match(source, /definePage\([A-Za-z]+\);/);
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
      source.match(/import "\.\.\/\.\.\/styles\/app\.css";/g)?.length,
      1,
    );
    assert.equal(source.match(/import ".*styles\/.*\.css";/g)?.length, 1);
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
