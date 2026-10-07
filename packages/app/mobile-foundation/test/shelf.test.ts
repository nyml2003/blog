import assert from "node:assert/strict";
import test from "node:test";

import {
  fshelfRequestId,
  fshelfSelection,
  toFShelfModel,
  toTShelfModel,
} from "../src/index.ts";

const categoryShelf = {
  taxonomy: {
    version: 1,
    nextCategoryId: 10,
    nextTagId: 20,
    categories: [
      { id: 2, name: "Archive", parentId: undefined, position: 2 },
      { id: 1, name: "Engineering", parentId: undefined, position: 1 },
      { id: 4, name: "TypeScript", parentId: 1, position: 2 },
      { id: 3, name: "Rust", parentId: 1, position: 1 },
    ],
    tags: [],
  },
  selectedCategoryId: 4,
  articles: [],
  total: 0,
};

test("F shelf builds stable root and child ordering", () => {
  const model = toFShelfModel(categoryShelf);
  assert.deepEqual(model.roots.map((root) => root.id), [1, 2]);
  assert.deepEqual(model.roots[0]?.children.map((child) => child.id), [3, 4]);
  assert.equal(model.selectedCategoryId, 4);
});

test("F shelf resolves child selection to its root and request id", () => {
  const model = toFShelfModel(categoryShelf);
  const selection = fshelfSelection(model, 4);
  assert.deepEqual(selection, { rootId: 1, childId: 4 });
  assert.equal(fshelfRequestId(selection!), 4);
  assert.deepEqual(fshelfSelection(model, 2), { rootId: 2, childId: undefined });
});

test("F shelf falls back to the first root for unknown categories", () => {
  const model = toFShelfModel(categoryShelf);
  assert.deepEqual(fshelfSelection(model, 999), { rootId: 1, childId: undefined });
  assert.deepEqual(fshelfSelection(model, undefined), { rootId: 1, childId: undefined });
});

test("T shelf model keeps the cross-platform data contract", () => {
  const source = {
    filters: [{ id: "all", name: "All" }],
    selectedFilterId: "all",
    articles: [],
    total: 0,
  };
  assert.deepEqual(toTShelfModel(source), source);
});
