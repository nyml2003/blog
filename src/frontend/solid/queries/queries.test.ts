import assert from "node:assert/strict";
import test from "node:test";
import { emptyFilter } from "../../common/contracts/domain";
import type {
  ArticleBrowsePage,
  ArticleId,
  ArticleTypeId,
  ContentArticleRemoveInput,
  ContentArticleSaveInput,
  ContentWorkspace,
} from "../../common/client";
import { createDataTask } from "../../common/data/task";
import {
  articleBrowseInput,
  articleBrowseHasMore,
  adminQueryErrorMessage,
  articleFilterInput,
  createArticleBrowsePagination,
  createCategoryShelfResource,
  createTShelfResource,
  executeContentArticleSave,
  executeContentArticleRemoval,
  contentAnalysisArticleIds,
  limitUnicodeScalars,
  positiveArticleId,
  refreshAfterSuccessfulQuery,
  taskForArticleId,
  tShelfFilterFromSearch,
  tShelfSearch,
  unicodeScalarLength,
} from "./index";

const articleListItem = (id: number) => ({
  id: id as ArticleId,
  title: `文章 ${id}`,
  summary: "摘要",
  articleTypeId: 1 as ArticleTypeId,
  status: "published" as const,
  createdAt: "2026-09-07",
  updatedAt: "2026-09-07",
  termIds: [],
});

const browsePage = (
  page: number,
  ids: readonly number[],
): ArticleBrowsePage => ({
  items: ids.map(articleListItem),
  page,
  pageSize: 20,
  total: 60,
});

const contentArticle = (id = 7) => ({
  id,
  title: "文章",
  summary: "摘要",
  categoryIds: [2],
  tagIds: [3],
  contentHtml: "<p>正文</p>",
  createdAt: "2026-09-07",
  updatedAt: "2026-09-07",
  publishedAt: undefined,
});

const contentWorkspace = (version: number): ContentWorkspace => ({
  version,
  status: "saved",
  taxonomy: {
    version: 1,
    nextCategoryId: 3,
    nextTagId: 4,
    categories: [{ id: 2, name: "Rust", parentId: undefined, position: 10 }],
    tags: [{ id: 3, name: "性能" }],
  },
  articles: [{ id: 7, title: "文章", categoryIds: [2], tagIds: [3] }],
  pullRequest: undefined,
  lastError: undefined,
});

const validInspection = {
  profileVersion: "article-html/v1",
  valid: true,
  diagnostics: [],
} as const;

const invalidInspection = {
  profileVersion: "article-html/v1",
  valid: false,
  diagnostics: [
    {
      code: "HTML_UNSUPPORTED_ELEMENT",
      severity: "error",
      message: "不支持的元素",
      span: {
        start: { byte: 0, line: 1, column: 1 },
        end: { byte: 8, line: 1, column: 9 },
      },
      profileVersion: "article-html/v1",
    },
  ],
} as const;

const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

test("article filters are normalized before they reach the client", () => {
  const filter = emptyFilter();
  filter.termIds = ["4", "9"];
  filter.typeId = "3";
  filter.updatedFrom = "2026-01-01";

  assert.deepEqual(articleFilterInput(filter), {
    termIds: [4, 9],
    typeId: 3,
    createdFrom: undefined,
    createdTo: undefined,
    updatedFrom: "2026-01-01",
    updatedTo: undefined,
  });
});

test("article ids reject missing, malformed and unsafe values", () => {
  assert.equal(positiveArticleId(undefined), undefined);
  assert.equal(positiveArticleId(null), undefined);
  assert.equal(positiveArticleId(""), undefined);
  assert.equal(positiveArticleId("-1"), undefined);
  assert.equal(positiveArticleId("1.5"), undefined);
  assert.equal(positiveArticleId("9007199254740992"), undefined);
  assert.equal(positiveArticleId("42"), 42);
});

test("missing article ids fail without starting a client request", async () => {
  let started = false;
  const task = taskForArticleId(undefined, () => {
    started = true;
    throw new Error("client task must not be created");
  });

  const result = await task.start();
  assert.equal(started, false);
  assert.deepEqual(result, {
    ok: false,
    error: { kind: "protocol", message: "缺少或无效的文章 ID" },
  });
});

test("browse selection and page are mapped in one query-layer function", () => {
  const selection = { typeId: 2, topicId: 5, tagId: undefined };
  assert.deepEqual(articleBrowseInput(selection), {
    typeId: 2,
    topicId: 5,
    tagId: undefined,
    page: undefined,
  });
  assert.deepEqual(articleBrowseInput(selection, 3), {
    typeId: 2,
    topicId: 5,
    tagId: undefined,
    page: 3,
  });
});

test("T shelf URLs preserve valid type filters and reject malformed values", () => {
  assert.equal(tShelfFilterFromSearch(""), "all");
  assert.equal(tShelfFilterFromSearch("?type_id=7"), "7");
  assert.equal(tShelfFilterFromSearch("?type_id=-2"), "all");
  assert.equal(tShelfFilterFromSearch("?type_id=2.5"), "all");
  assert.equal(tShelfSearch("all"), "");
  assert.equal(tShelfSearch("7"), "?type_id=7");
});

test("T shelf keeps filters stable and ignores an older selection response", async () => {
  const initial = deferred<{
    ok: true;
    value: {
      filters: { id: string; name: string }[];
      selectedFilterId: string;
      articles: never[];
      total: number;
    };
  }>();
  const older = deferred<{
    ok: true;
    value: {
      filters: { id: string; name: string }[];
      selectedFilterId: string;
      articles: never[];
      total: number;
    };
  }>();
  const newest = deferred<{
    ok: true;
    value: {
      filters: { id: string; name: string }[];
      selectedFilterId: string;
      articles: never[];
      total: number;
    };
  }>();
  const responses = [initial, older, newest];
  let requestIndex = 0;
  const shelf = createTShelfResource(
    () => createDataTask(async () => responses[requestIndex++].promise),
    { surface: "archive", filterId: "all" },
  );
  const firstRequest = shelf.start();

  initial.resolve({
    ok: true,
    value: {
      filters: [
        { id: "all", name: "全部" },
        { id: "7", name: "工程" },
      ],
      selectedFilterId: "all",
      articles: [],
      total: 2,
    },
  });
  await firstRequest;
  assert.deepEqual(
    shelf.filters().map((filter) => filter.id),
    ["all", "7"],
  );

  const olderRequest = shelf.select({ surface: "archive", filterId: "7" });
  assert.equal(shelf.getSnapshot().status, "loading");
  assert.equal(shelf.filters().length, 2);
  const newestRequest = shelf.select({
    surface: "archive",
    filterId: "all",
  });

  newest.resolve({
    ok: true,
    value: {
      filters: [{ id: "all", name: "全部" }],
      selectedFilterId: "all",
      articles: [],
      total: 1,
    },
  });
  await newestRequest;
  older.resolve({
    ok: true,
    value: {
      filters: [{ id: "7", name: "过期筛选" }],
      selectedFilterId: "7",
      articles: [],
      total: 99,
    },
  });
  await olderRequest;

  assert.equal(shelf.getSnapshot().snapshot?.selectedFilterId, "all");
  assert.equal(shelf.getSnapshot().snapshot?.total, 1);
  assert.deepEqual(
    shelf.filters().map((filter) => filter.id),
    ["all"],
  );
  shelf.cancel();
});

test("category shelf retains taxonomy while a new category is loading", async () => {
  const taxonomy = {
    version: 1,
    nextCategoryId: 3,
    nextTagId: 1,
    categories: [
      { id: 1, name: "工程", parentId: undefined, position: 10 },
      { id: 2, name: "Rust", parentId: 1, position: 10 },
    ],
    tags: [],
  };
  const pending = deferred<{
    ok: true;
    value: {
      taxonomy: typeof taxonomy;
      selectedCategoryId: number;
      articles: never[];
      total: number;
    };
  }>();
  let call = 0;
  const shelf = createCategoryShelfResource(() =>
    createDataTask(async () => {
      call += 1;
      if (call === 1) {
        return {
          ok: true as const,
          value: {
            taxonomy,
            selectedCategoryId: 1,
            articles: [],
            total: 1,
          },
        };
      }
      return pending.promise;
    }),
  );
  await shelf.start();
  const selecting = shelf.select({ categoryId: 2 });
  assert.equal(shelf.getSnapshot().status, "loading");
  assert.equal(shelf.getSnapshot().latest?.taxonomy.categories.length, 2);
  pending.resolve({
    ok: true,
    value: { taxonomy, selectedCategoryId: 2, articles: [], total: 0 },
  });
  await selecting;
  assert.equal(shelf.getSnapshot().snapshot?.selectedCategoryId, 2);
});

test("article browse pagination owns page numbering and ignores a stale response", async () => {
  const older = deferred<{
    ok: true;
    value: ArticleBrowsePage;
  }>();
  const newer = deferred<{
    ok: true;
    value: ArticleBrowsePage;
  }>();
  const responses = [older, newer];
  const requests: Array<{
    selection: { readonly typeId?: number };
    page: number;
  }> = [];
  let requestIndex = 0;
  const pagination = createArticleBrowsePagination((selection, page) => {
    requests.push({ selection, page });
    return createDataTask(async () => responses[requestIndex++].promise);
  }, {});

  const staleRequest = pagination.loadMore(browsePage(1, [1]));
  assert.equal(pagination.getSnapshot().moreStatus, "loading");
  pagination.reset({ typeId: 2 });
  const currentRequest = pagination.loadMore(browsePage(1, [21]));
  newer.resolve({ ok: true, value: browsePage(2, [22]) });
  await currentRequest;
  older.resolve({ ok: true, value: browsePage(2, [2]) });
  await staleRequest;

  assert.deepEqual(requests, [
    { selection: {}, page: 2 },
    { selection: { typeId: 2 }, page: 2 },
  ]);
  assert.deepEqual(
    pagination
      .getSnapshot()
      .appended.flatMap((page) => page.items.map((item) => item.id)),
    [22],
  );
});

test("article browse pagination exposes errors and stops after an empty page", async () => {
  let call = 0;
  const pagination = createArticleBrowsePagination(
    (_selection, page) =>
      createDataTask<ArticleBrowsePage>(async () => {
        call += 1;
        if (call === 1) {
          return {
            ok: false,
            error: { kind: "remote", code: "failed", message: "失败" },
          };
        }
        return { ok: true, value: browsePage(page, []) };
      }),
    {},
  );

  await pagination.loadMore(browsePage(1, [1]));
  assert.equal(pagination.getSnapshot().moreStatus, "error");
  await pagination.loadMore(browsePage(1, [1]));
  assert.equal(pagination.getSnapshot().moreStatus, "idle");
  assert.equal(pagination.getSnapshot().appended.length, 1);
  assert.equal(pagination.getSnapshot().appended[0].items.length, 0);
  assert.equal(
    articleBrowseHasMore(browsePage(1, [1]), pagination.getSnapshot()),
    false,
  );
  await pagination.loadMore(browsePage(1, [1]));
  assert.equal(call, 2);
});

test("taxonomy mutations refresh only after a successful write", async () => {
  let refreshes = 0;
  const refresh = async () => {
    refreshes += 1;
  };
  const succeeded = await refreshAfterSuccessfulQuery(
    Promise.resolve({ ok: true as const, value: "created" }),
    refresh,
  );
  assert.equal(succeeded.ok, true);
  assert.equal(refreshes, 1);

  const failed = await refreshAfterSuccessfulQuery(
    Promise.resolve({
      ok: false as const,
      error: { kind: "remote" as const, code: "conflict", message: "重复" },
    }),
    refresh,
  );
  assert.equal(failed.ok, false);
  assert.equal(refreshes, 1);
});

test("workspace editor save trims fields and writes taxonomy ids once", async () => {
  let savedInput: ContentArticleSaveInput | undefined;
  let writes = 0;
  const savedArticle = contentArticle(17);
  const outcome = await executeContentArticleSave(
    {
      saveArticle: (input) => {
        writes += 1;
        savedInput = input;
        return createDataTask(async () => ({
          ok: true,
          value: { workspace: contentWorkspace(5), article: savedArticle },
        }));
      },
    },
    4,
    {
      id: 0,
      title: "  标题  ",
      summary: "  摘要  ",
      categoryIds: [2],
      tagIds: [3],
      contentHtml: "<p>正文</p>",
    },
    validInspection,
  );

  assert.equal(writes, 1);
  assert.deepEqual(savedInput, {
    kind: "create",
    expectedVersion: 4,
    article: {
      title: "标题",
      summary: "摘要",
      categoryIds: [2],
      tagIds: [3],
      contentHtml: "<p>正文</p>",
    },
  });
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.value.article.id, 17);
    assert.equal(outcome.value.workspace.version, 5);
  }
});

test("workspace editor save sends an existing article id", async () => {
  let savedInput: ContentArticleSaveInput | undefined;
  const outcome = await executeContentArticleSave(
    {
      saveArticle: (input) => {
        savedInput = input;
        return createDataTask(async () => ({
          ok: true,
          value: {
            workspace: contentWorkspace(9),
            article: contentArticle(11),
          },
        }));
      },
    },
    8,
    {
      id: 11,
      title: "文章",
      summary: "摘要",
      categoryIds: [2],
      tagIds: [],
      contentHtml: "<p>正文</p>",
    },
    validInspection,
  );

  assert.equal(outcome.ok, true);
  assert.equal(savedInput?.kind, "update");
  if (savedInput?.kind === "update") assert.equal(savedInput.article.id, 11);
});

test("empty taxonomy analysis selection expands to every workspace article", () => {
  const articles = [
    { id: 4, title: "四", categoryIds: [], tagIds: [] },
    { id: 9, title: "九", categoryIds: [2], tagIds: [3] },
  ];
  assert.deepEqual(contentAnalysisArticleIds([], articles), [4, 9]);
  assert.deepEqual(contentAnalysisArticleIds([9], articles), [9]);
});

test("summary limits count Unicode scalar values instead of UTF-16 units", () => {
  const value = `${"字".repeat(159)}😀尾`;
  assert.equal(unicodeScalarLength(value), 161);
  assert.equal(unicodeScalarLength(limitUnicodeScalars(value, 160)), 160);
  assert.equal(limitUnicodeScalars(value, 160), `${"字".repeat(159)}😀`);
});

test("workspace save rejects a summary over 160 Unicode scalars", async () => {
  let writes = 0;
  const outcome = await executeContentArticleSave(
    {
      saveArticle: () => {
        writes += 1;
        return createDataTask(async () => ({
          ok: true,
          value: {
            workspace: contentWorkspace(5),
            article: contentArticle(),
          },
        }));
      },
    },
    4,
    {
      id: 0,
      title: "标题",
      summary: "😀".repeat(161),
      categoryIds: [],
      tagIds: [],
      contentHtml: "<p>正文</p>",
    },
    validInspection,
  );

  assert.equal(outcome.ok, false);
  assert.equal(writes, 0);
});

test("invalid article HTML does not start a workspace write", async () => {
  let writes = 0;
  const outcome = await executeContentArticleSave(
    {
      saveArticle: () => {
        writes += 1;
        return createDataTask(async () => ({
          ok: true,
          value: {
            workspace: contentWorkspace(5),
            article: contentArticle(),
          },
        }));
      },
    },
    4,
    {
      id: 0,
      title: "保留当前输入",
      summary: "",
      categoryIds: [],
      tagIds: [],
      contentHtml: "<script></script>",
    },
    invalidInspection,
  );

  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error.kind, "html-validation");
  assert.equal(writes, 0);
});

test("workspace version conflict gets an actionable editor message", () => {
  assert.equal(
    adminQueryErrorMessage({
      kind: "remote",
      code: "WORKSPACE_VERSION_CONFLICT",
      message: "expected 4, current 5",
    }),
    "工作区版本已变化。当前输入已保留，请刷新后重新应用修改。",
  );
});

test("workspace article removal confirms before sending the current version", async () => {
  let writes = 0;
  let removeInput: ContentArticleRemoveInput | undefined;
  const remover = {
    removeArticle: (input: ContentArticleRemoveInput) => {
      writes += 1;
      removeInput = input;
      return createDataTask(async () => ({
        ok: true,
        value: contentWorkspace(10),
      }));
    },
  };

  const cancelled = await executeContentArticleRemoval(
    remover,
    8,
    11,
    () => false,
  );
  assert.equal(cancelled, undefined);
  assert.equal(writes, 0);

  const confirmed = await executeContentArticleRemoval(
    remover,
    9,
    11,
    () => true,
  );
  assert.equal(confirmed?.ok, true);
  assert.equal(writes, 1);
  assert.deepEqual(removeInput, { expectedVersion: 9, articleId: 11 });
});
