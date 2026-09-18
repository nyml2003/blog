import assert from "node:assert/strict";
import { test } from "node:test";
import {
  browseAllLevelId,
  browseFilterFromSearch,
  browseFiltersEqual,
  browseHref,
  browseSearchWithFilter,
  browseSelectedLevelId,
  cleanBrowseHref,
  cleanBrowseSearch,
  firstBrowsePage,
  nextBrowsePage,
  selectBrowseFilter,
  type BrowseFilter,
} from "../../../mobile/src/logic/browse-filter";

test("empty and foreign-only searches resolve to the all filter", () => {
  for (const search of ["", "?", "?mock-session=s1", "?type=&topic=&tag="]) {
    assert.deepEqual(browseFilterFromSearch(search), {});
  }
});

test("shareable URLs round-trip through the filter model", () => {
  const filter: BrowseFilter = { typeId: 2, topicId: 4, tagId: 7 };
  const href = browseHref("/m/articles/list.html", filter, "");
  assert.deepEqual(browseFilterFromSearch("?type=2&topic=4&tag=7"), filter);
  assert.equal(href, "/m/articles/list.html?type=2&topic=4&tag=7");
  assert.deepEqual(
    browseFilterFromSearch(new URL(href, "https://blog.local").search),
    filter,
  );
});

test("malformed id shapes degrade to the all selection", () => {
  for (const search of [
    "?type=abc",
    "?type=0",
    "?type=-2",
    "?type=2.5",
    "?type=2e3",
    "?type=12px",
    "?type=%202",
    "?type=",
    "?type=99999999999999999999999",
  ]) {
    assert.deepEqual(browseFilterFromSearch(search), {}, search);
  }
});

test("a tag without a concrete topic is ignored, not recovered", () => {
  assert.deepEqual(browseFilterFromSearch("?type=1&tag=7"), { typeId: 1 });
  assert.deepEqual(browseFilterFromSearch("?topic=4&tag=7"), {
    topicId: 4,
    tagId: 7,
  });
});

test("legacy date params are ignored and cleaned from the URL", () => {
  const search =
    "created_from=2024-01-01&updated_to=2024-12-31&type=3&mock-session=s1";
  assert.deepEqual(browseFilterFromSearch(`?${search}`), { typeId: 3 });
  assert.equal(cleanBrowseSearch(search), "type=3&mock-session=s1");
  assert.equal(
    browseHref("/m/articles/list.html", { typeId: 3 }, `?${search}`),
    "/m/articles/list.html?type=3&mock-session=s1",
  );
  assert.equal(
    cleanBrowseHref("/m/articles/index.html", `?${search}`),
    "/m/articles/index.html?type=3&mock-session=s1",
  );
  assert.equal(
    cleanBrowseHref("/m/articles/index.html", "?created_from=2024-01-01"),
    "/m/articles/index.html",
  );
});

test("selecting a level keeps independent dimensions and clears the cascade", () => {
  const base: BrowseFilter = { typeId: 2, topicId: 4, tagId: 7 };
  assert.deepEqual(selectBrowseFilter(base, "type", "9"), {
    typeId: 9,
    topicId: 4,
    tagId: 7,
  });
  assert.deepEqual(selectBrowseFilter(base, "type", browseAllLevelId), {
    topicId: 4,
    tagId: 7,
  });
  assert.deepEqual(selectBrowseFilter(base, "topic", "5"), {
    typeId: 2,
    topicId: 5,
    tagId: 7,
  });
  assert.deepEqual(selectBrowseFilter(base, "topic", browseAllLevelId), {
    typeId: 2,
  });
  assert.deepEqual(selectBrowseFilter(base, "tag", "8"), {
    typeId: 2,
    topicId: 4,
    tagId: 8,
  });
  assert.deepEqual(selectBrowseFilter(base, "tag", browseAllLevelId), {
    typeId: 2,
    topicId: 4,
  });
  assert.deepEqual(selectBrowseFilter({}, "topic", "4"), { topicId: 4 });
});

test("selection and rendering share one level-id mapping", () => {
  let filter: BrowseFilter = {};
  for (const [level, levelId] of [
    ["type", "2"],
    ["topic", "4"],
    ["tag", "7"],
  ] as const) {
    filter = selectBrowseFilter(filter, level, levelId);
    assert.equal(browseSelectedLevelId(filter, level), levelId);
  }
  for (const level of ["type", "topic", "tag"] as const) {
    const all = selectBrowseFilter(filter, level, browseAllLevelId);
    assert.equal(browseSelectedLevelId(all, level), browseAllLevelId);
  }
});

test("filters compare by value so pages can detect real selection changes", () => {
  assert.ok(browseFiltersEqual({}, {}));
  assert.ok(browseFiltersEqual({ typeId: 2 }, { typeId: 2 }));
  assert.ok(!browseFiltersEqual({ typeId: 2 }, { typeId: 2, topicId: 4 }));
  assert.ok(!browseFiltersEqual({ topicId: 4 }, { topicId: 5 }));
});

test("any selection change restarts the list at the first page", () => {
  const before: BrowseFilter = { typeId: 2, topicId: 4 };
  const after = selectBrowseFilter(before, "tag", "7");
  assert.equal(firstBrowsePage, 1);
  assert.ok(!browseFiltersEqual(before, after));
  assert.equal(
    browseHref(
      "/m/articles/list.html",
      after,
      browseSearchWithFilter("", before),
    ),
    "/m/articles/list.html?type=2&topic=4&tag=7",
  );
});

test("load more continues after the first page and every appended page", () => {
  assert.equal(nextBrowsePage(0), 2);
  assert.equal(nextBrowsePage(1), 3);
  assert.equal(nextBrowsePage(4), 6);
});
