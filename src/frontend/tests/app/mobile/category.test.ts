import assert from "node:assert/strict";
import test from "node:test";
import {
  categoryHref,
  categoryRequestId,
  categorySelection,
  mobileArticlesPage,
} from "@blog/page-mobile-articles";
import { desktopArticlesPage } from "@blog/page-desktop-articles";
import { displayDate } from "@fluvient-loom/mobile-foundation/date";

/** 页面参数的读取辅助：非法/缺失 id 归一为 undefined，便于断言。 */
function readCategoryId(search: string): number | undefined {
  const params = mobileArticlesPage.parseParams(search);
  return params.ok ? params.value.category_id : undefined;
}

function readFilterId(search: string): string {
  const params = desktopArticlesPage.parseParams(search);
  return params.ok ? params.value.type_id : "all";
}

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
  assert.equal(readCategoryId("?category_id=3"), 3);
  assert.equal(readCategoryId("?category_id=0"), undefined);
  assert.equal(readCategoryId("?category_id=1.5"), undefined);
  assert.equal(readCategoryId("?category_id=9007199254740992"), undefined);
});

test("shared param schemas normalize filters and invalid dates", () => {
  assert.equal(readFilterId("?type_id=3"), "3");
  assert.equal(readFilterId("?type_id=0"), "all");
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
