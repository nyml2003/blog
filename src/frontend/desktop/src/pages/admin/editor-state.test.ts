import assert from "node:assert/strict";
import test from "node:test";
import { editorSnapshot, editorSnapshotsEqual } from "./editor-state";

test("saved editor snapshots ignore form whitespace and term selection order", () => {
  const saved = editorSnapshot({
    title: "排查 HTML 校验错误",
    summary: "记录定位过程",
    typeId: 2,
    termIds: [3, 1],
    contentHtml: "<p>正文</p>",
  });
  const current = editorSnapshot({
    title: "  排查 HTML 校验错误  ",
    summary: "  记录定位过程 ",
    typeId: 2,
    termIds: [1, 3],
    contentHtml: "<p>正文</p>",
  });

  assert.equal(editorSnapshotsEqual(saved, current), true);
});

test("saved editor snapshots treat source changes as unsaved", () => {
  const saved = editorSnapshot({
    title: "排查 HTML 校验错误",
    summary: "",
    typeId: 2,
    termIds: [],
    contentHtml: "<p>原始正文</p>",
  });
  const current = editorSnapshot({
    ...saved,
    contentHtml: "<p>修改后的正文</p>",
  });

  assert.equal(editorSnapshotsEqual(saved, current), false);
});
