import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  editorSnapshot,
  valueForCurrentSource,
} from "../../../../app/habitat/desktop/logic/editor-state";
import {
  takeEditorSessionDraft,
  writeEditorSessionDraft,
  type EditorDraftStorage,
} from "../../../../app/habitat/desktop/logic/editor-session-draft";
import {
  canAbandonWorkspace,
  canSubmitWorkspace,
  workspaceActionPending,
  workspaceStatusLabel,
} from "../../../../app/habitat/desktop/logic/taxonomy-state";

const memoryStorage = (): EditorDraftStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

test("session redirect draft restores exact input once on the matching editor URL", () => {
  const storage = memoryStorage();
  const draft = {
    schemaVersion: 1 as const,
    returnPath: "/admin/articles/edit.html?id=7",
    expectedVersion: 12,
    values: {
      id: 7,
      title: "  保留标题空格  ",
      summary: "emoji 😀",
      categoryIds: [2],
      tagIds: [5],
      contentHtml: "<p>未保存内容</p>",
    },
  };

  writeEditorSessionDraft(storage, draft);
  assert.equal(
    takeEditorSessionDraft(storage, "/admin/articles/edit.html?id=8"),
    undefined,
  );
  assert.deepEqual(takeEditorSessionDraft(storage, draft.returnPath), draft);
  assert.equal(takeEditorSessionDraft(storage, draft.returnPath), undefined);
});

test("server HTML diagnostics remain attached only to the rejected source", () => {
  const local = { valid: true };
  const server = { valid: false, code: "INVALID_ARTICLE_HTML" };
  const associated = { source: "<script></script>", value: server };

  assert.equal(
    valueForCurrentSource("<script></script>", associated, local),
    server,
  );
  assert.equal(valueForCurrentSource("<p>fixed</p>", associated, local), local);
});

test("workspace actions follow the finite server status matrix", () => {
  assert.equal(canSubmitWorkspace("saved"), true);
  assert.equal(canSubmitWorkspace("submitted_with_changes"), true);
  assert.equal(canSubmitWorkspace("clean"), false);
  assert.equal(canAbandonWorkspace("clean"), false);
  assert.equal(canAbandonWorkspace("saved"), true);
  assert.equal(canAbandonWorkspace("submitting"), false);
  assert.equal(workspaceActionPending("discarding"), true);
  assert.equal(workspaceStatusLabel("failed"), "操作失败");
});

test("editor keeps its form mounted after save and public navigation has no admin entry", () => {
  const editorSource = readFileSync(
    new URL(
      "../../../../app/habitat/desktop/pages/editor.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const headerSource = readFileSync(
    new URL(
      "../../../../app/habitat/desktop/pages/admin-home.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.doesNotMatch(editorSource, /workspace\.refetch\(\)/);
  // 导航经路由清单取用，源码不出现页面路径字面量；
  // 管理台入口只存在于 admin 分支（public 分支无管理入口文案）。
  assert.doesNotMatch(headerSource, /href="\/(admin|m|articles)\//);
  assert.match(headerSource, /desktop-admin-home/);
  assert.doesNotMatch(headerSource, />管理</);
  assert.equal(
    editorSnapshot({
      title: "文章",
      summary: "摘要",
      categoryIds: [],
      tagIds: [],
      contentHtml: "<p>正文</p>",
    }).contentHtml,
    "<p>正文</p>",
  );
});
