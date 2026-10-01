import assert from "node:assert/strict";
import test from "node:test";
import { findTextMatches } from "../src/index.ts";

test("finds non-overlapping matches with UTF-16 offsets", () => {
  assert.deepEqual(findTextMatches("TypeScript 与中文 TypeScript", "typescript").matches, [
    { start: 0, end: 10 },
    { start: 15, end: 25 },
  ]);
  assert.deepEqual(findTextMatches("中文搜索中文", "搜索").matches, [
    { start: 2, end: 4 },
  ]);
});

test("empty queries do not produce ranges", () => {
  assert.deepEqual(findTextMatches("正文", "   ").matches, []);
});
