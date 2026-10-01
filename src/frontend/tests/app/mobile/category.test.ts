import assert from "node:assert/strict";
import test from "node:test";
import {
  categoryHref,
  categoryIdFromSearch,
  categoryRequestId,
  categorySelection,
} from "../../../app/habitat/mobile/logic/category";
import {
  displayDate,
  positiveFilterIdFromSearch,
} from "../../../app/habitat/route-input";

const model = {
  taxonomy: {
    version: 1,
    nextCategoryId: 4,
    nextTagId: 1,
    categories: [
      { id: 2, parentId: undefined, position: 2, name: "后端" },
      { id: 1, parentId: undefined, position: 1, name: "前端" },
      { id: 3, parentId: 1, position: 1, name: "Solid" },
    ],
    tags: [],
  },
  selectedCategoryId: undefined,
  articles: [],
  total: 0,
} as const;

test("category input accepts only positive safe integer ids", () => {
  assert.equal(categoryIdFromSearch("?category_id=3"), 3);
  assert.equal(categoryIdFromSearch("?category_id=0"), undefined);
  assert.equal(categoryIdFromSearch("?category_id=1.5"), undefined);
  assert.equal(
    categoryIdFromSearch("?category_id=9007199254740992"),
    undefined,
  );
});

test("shared route input normalizes filters and invalid dates", () => {
  assert.equal(positiveFilterIdFromSearch("?type_id=3", "type_id"), "3");
  assert.equal(positiveFilterIdFromSearch("?type_id=0", "type_id"), "all");
  assert.equal(displayDate("not-a-date"), "-");
});

test("category selection falls back to the first root", () => {
  assert.deepEqual(categorySelection(model, undefined), {
    rootId: 1,
    childId: undefined,
  });
  assert.deepEqual(categorySelection(model, 3), { rootId: 1, childId: 3 });
  assert.deepEqual(categorySelection(model, 99), {
    rootId: 1,
    childId: undefined,
  });
});

test("category navigation preserves the current pathname and selected id", () => {
  const selection = { rootId: 1, childId: 3 };
  assert.equal(categoryRequestId(selection), 3);
  assert.equal(
    categoryHref("/m/articles/list.html", selection),
    "/m/articles/list.html?category_id=3",
  );
});
