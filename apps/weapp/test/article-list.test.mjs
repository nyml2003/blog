import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { highlightTitle } = createRequire(import.meta.url)(
  "../../../target/weapp-test/lib/article-list.cjs",
);

test("article search creates escaped native highlight segments", () => {
  assert.deepEqual(highlightTitle("TypeScript 与中文 TypeScript", "script"), [
    { text: "Type", match: false },
    { text: "Script", match: true },
    { text: " 与中文 Type", match: false },
    { text: "Script", match: true },
  ]);
  assert.deepEqual(highlightTitle("正文", "  "), [{ text: "正文", match: false }]);
});
