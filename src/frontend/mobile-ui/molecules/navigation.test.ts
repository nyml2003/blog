import assert from "node:assert/strict";
import test from "node:test";
import { nextRovingIndex } from "./navigation";

test("roving navigation wraps in both directions", () => {
  assert.equal(nextRovingIndex(2, 3, "next"), 0);
  assert.equal(nextRovingIndex(0, 3, "previous"), 2);
  assert.equal(nextRovingIndex(1, 3, "first"), 0);
  assert.equal(nextRovingIndex(1, 3, "last"), 2);
  assert.equal(nextRovingIndex(0, 0, "next"), -1);
});
