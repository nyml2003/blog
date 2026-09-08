import assert from "node:assert/strict";
import { test } from "node:test";
import type { ContentTaxonomy } from "../../../common/client";
import {
  categoryIdFromSearch,
  categoryRequestId,
  categorySearch,
  categorySelection,
  categoryScrollRestoreReady,
  childCategories,
  mobileArticleShelfHistory,
  navigateCategory,
  restoreCategoryPop,
  rootCategories,
  scheduleCategoryScrollRestore,
} from "./category-browser";

const taxonomy: ContentTaxonomy = {
  version: 1,
  nextCategoryId: 8,
  nextTagId: 1,
  categories: [
    { id: 4, name: "工具", parentId: 1, position: 20 },
    { id: 1, name: "前端", parentId: undefined, position: 20 },
    { id: 2, name: "React", parentId: 1, position: 10 },
    { id: 3, name: "Hooks", parentId: 2, position: 10 },
    { id: 5, name: "后端", parentId: undefined, position: 10 },
  ],
  tags: [],
};

test("category tree orders roots and direct child tabs by position", () => {
  assert.deepEqual(
    rootCategories(taxonomy).map((category) => category.id),
    [5, 1],
  );
  assert.deepEqual(
    childCategories(taxonomy, 1).map((category) => category.id),
    [2, 4],
  );
});

test("deep categories resolve to their first-level rail and second-level tab", () => {
  assert.deepEqual(categorySelection(taxonomy, 3), {
    rootId: 1,
    childId: 2,
  });
  assert.equal(categoryRequestId({ rootId: 1, childId: undefined }), 1);
  assert.equal(categoryRequestId({ rootId: 1, childId: 2 }), 2);
});

test("missing selections fall back to the first ordered root", () => {
  assert.deepEqual(categorySelection(taxonomy, 999), {
    rootId: 5,
    childId: undefined,
  });
  assert.equal(
    categorySelection({ ...taxonomy, categories: [] }, 1),
    undefined,
  );
});

test("category URL state accepts only positive safe integer ids", () => {
  assert.equal(categoryIdFromSearch("?category_id=4"), 4);
  assert.equal(categoryIdFromSearch("?category_id=-1"), undefined);
  assert.equal(categoryIdFromSearch("?category_id=4x"), undefined);
  assert.equal(categorySearch(4), "?category_id=4");
});

test("history state validates the saved section and scroll offset", () => {
  assert.deepEqual(
    mobileArticleShelfHistory({
      mobileArticleShelf: { sectionId: "4", scrollY: 596 },
    }),
    { sectionId: "4", scrollY: 596 },
  );
  assert.equal(
    mobileArticleShelfHistory({
      mobileArticleShelf: { sectionId: "4", scrollY: Number.NaN },
    }),
    undefined,
  );
  assert.equal(
    mobileArticleShelfHistory({
      mobileArticleShelf: { sectionId: 4, scrollY: 10 },
    }),
    undefined,
  );
});

test("category push persists the old entry before changing the requested id", () => {
  const calls: string[] = [];
  navigateCategory("/m/articles/index.html", { rootId: 1, childId: 4 }, false, {
    persistCurrent: () => calls.push("persist:old"),
    setRequested: (id) => calls.push(`request:${id}`),
    push: (href) => calls.push(`push:${href}`),
    replace: (href) => calls.push(`replace:${href}`),
  });
  assert.deepEqual(calls, [
    "persist:old",
    "request:4",
    "push:/m/articles/index.html?category_id=4",
  ]);
});

test("category pop restores entry state before selecting its request", () => {
  const calls: string[] = [];
  const snapshot = restoreCategoryPop(
    "?category_id=2",
    { mobileArticleShelf: { sectionId: "2", scrollY: 480 } },
    {
      setPendingHistory: (value) => calls.push(`history:${value?.scrollY}`),
      setRequested: (id) => calls.push(`request:${id}`),
    },
  );
  assert.deepEqual(snapshot, { sectionId: "2", scrollY: 480 });
  assert.deepEqual(calls, ["history:480", "request:2"]);
});

test("scroll restore waits for the final requested category response", () => {
  const pending = { sectionId: "1", scrollY: 480 };
  assert.equal(categoryScrollRestoreReady(true, 1, undefined, pending), false);
  assert.equal(categoryScrollRestoreReady(false, 2, 2, pending), false);
  assert.equal(categoryScrollRestoreReady(false, 1, 2, pending), false);
  assert.equal(categoryScrollRestoreReady(false, 1, 1, pending), true);
  assert.equal(categoryScrollRestoreReady(false, 1, 1, undefined), false);
});

test("scroll restore waits two frames and corrects after the traversal task", () => {
  const calls: string[] = [];
  const frames: Array<() => void> = [];
  const tasks: Array<() => void> = [];
  scheduleCategoryScrollRestore(480, {
    frame: (callback) => {
      calls.push("frame");
      frames.push(callback);
    },
    task: (callback) => {
      calls.push("task");
      tasks.push(callback);
    },
    scroll: (scrollY) => calls.push(`scroll:${scrollY}`),
    release: () => calls.push("release"),
  });

  assert.deepEqual(calls, ["frame"]);
  frames.shift()?.();
  assert.deepEqual(calls, ["frame", "frame"]);
  frames.shift()?.();
  assert.deepEqual(calls, ["frame", "frame", "scroll:480", "task"]);
  tasks.shift()?.();
  assert.deepEqual(calls, [
    "frame",
    "frame",
    "scroll:480",
    "task",
    "scroll:480",
    "release",
  ]);
});
