import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  editorPageTitle,
  editorSnapshot,
  editorSnapshotsEqual,
} from "../../../../desktop/src/pages/admin/editor-state";

test("saved editor snapshots ignore whitespace and taxonomy selection order", () => {
  const saved = editorSnapshot({
    title: "排查 HTML 校验错误",
    summary: "记录定位过程",
    categoryIds: [4, 2],
    tagIds: [3, 1],
    contentHtml: "<p>正文</p>",
  });
  const current = editorSnapshot({
    title: "  排查 HTML 校验错误  ",
    summary: "  记录定位过程 ",
    categoryIds: [2, 4],
    tagIds: [1, 3],
    contentHtml: "<p>正文</p>",
  });

  assert.equal(editorSnapshotsEqual(saved, current), true);
});

test("saved editor snapshots treat source changes as unsaved", () => {
  const saved = editorSnapshot({
    title: "排查 HTML 校验错误",
    summary: "",
    categoryIds: [2],
    tagIds: [],
    contentHtml: "<p>原始正文</p>",
  });
  const current = editorSnapshot({
    ...saved,
    contentHtml: "<p>修改后的正文</p>",
  });

  assert.equal(editorSnapshotsEqual(saved, current), false);
});

test("admin article pages do not invoke retired direct-write methods", () => {
  const sources = [
    "../../../../desktop/src/pages/admin/editor.tsx",
    "../../../../desktop/src/pages/admin/home.tsx",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
  const retiredWrites =
    /generateRecommendations|saveAdminEditorArticle|unpublishArticle|\.saveDraft\(|\.publish\(|\.unpublish\(|\.createType\(|\.renameType\(|\.createTerm\(|\.renameTerm\(/;

  for (const source of sources) assert.doesNotMatch(source, retiredWrites);
});

test("a newly allocated article id switches the editor into edit mode", () => {
  assert.equal(editorPageTitle(true, 0), "新建文章");
  assert.equal(editorPageTitle(true, 17), "编辑文章");
  assert.equal(editorPageTitle(false, 17), "编辑文章");
});

test("admin navigation uses the content workspace canonical path", () => {
  // canonical 路径的选择收敛到后端下发的路由清单，
  // 页面源码本身不出现任何页面路径字面量。
  const manifest = JSON.parse(
    readFileSync(
      new URL("../../../../site-routes.json", import.meta.url),
      "utf8",
    ),
  ) as { routes: Record<string, string> };
  assert.equal(
    manifest.routes["desktop-admin-article-types"],
    "/admin/content/workspace.html",
  );
  // workspace 页的旧别名（article-types/terms 的 index.html 形态）不得作为导航值下发。
  assert.notEqual(
    manifest.routes["desktop-admin-article-types"],
    "/admin/article-types/index.html",
  );

  const sources = [
    "../../../../desktop/src/pages/admin/editor.tsx",
    "../../../../desktop/src/pages/admin/home.tsx",
    "../../../../desktop/src/shell/header.tsx",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
  for (const source of sources) {
    assert.match(source, /adminWorkspaceHref/);
    assert.doesNotMatch(source, /\/admin\/content\/workspace\.html/);
    assert.doesNotMatch(
      source,
      /\/admin\/(?:article-types|terms)\/index\.html/,
    );
  }
});
