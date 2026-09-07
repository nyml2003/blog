import assert from "node:assert/strict";
import test from "node:test";
import { emptyFilter } from "../../common/contracts/domain";
import type {
  AdminArticle,
  ArticleBrowsePage,
  ArticleId,
  ArticleTypeId,
  DraftInput,
} from "../../common/client";
import { createDataTask } from "../../common/data/task";
import {
  articleBrowseInput,
  articleBrowseHasMore,
  articleFilterInput,
  createArticleBrowsePagination,
  createTShelfResource,
  executeAdminEditorSave,
  positiveArticleId,
  refreshAfterSuccessfulQuery,
  taskForArticleId,
  tShelfFilterFromSearch,
  tShelfSearch,
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

const adminArticle = (
  status: AdminArticle["status"],
  id = 7,
): AdminArticle => ({
  id: id as ArticleId,
  title: "文章",
  summary: "摘要",
  articleTypeId: 1 as ArticleTypeId,
  contentHtml: "<p>正文</p>",
  status,
  createdAt: "2026-09-07",
  updatedAt: "2026-09-07",
  termIds: [],
  htmlInspection: {
    profileVersion: "article-html/v1",
    valid: true,
    diagnostics: [],
  },
});

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

test("editor save trims input and publishes the saved draft in order", async () => {
  const calls: string[] = [];
  let savedInput: DraftInput | undefined;
  const saved = adminArticle("draft");
  const published = adminArticle("published");
  const outcome = await executeAdminEditorSave(
    {
      saveDraft: (input) => {
        calls.push("save");
        savedInput = input;
        return createDataTask(async () => ({ ok: true, value: saved }));
      },
      publish: (id) => {
        calls.push(`publish:${id}`);
        return createDataTask(async () => ({ ok: true, value: published }));
      },
    },
    {
      id: 0,
      title: "  标题  ",
      summary: "  摘要  ",
      articleTypeId: 1,
      termIds: [2],
      contentHtml: "<p>正文</p>",
    },
    true,
  );

  assert.deepEqual(calls, ["save", "publish:7"]);
  assert.equal(savedInput?.title, "标题");
  assert.equal(savedInput?.summary, "摘要");
  assert.equal(outcome.kind, "completed");
  if (outcome.kind === "completed") {
    assert.equal(outcome.savedArticle.status, "draft");
    assert.equal(outcome.article.status, "published");
  }
});

test("editor save reports publish failure while retaining the saved article", async () => {
  const saved = adminArticle("draft", 11);
  const outcome = await executeAdminEditorSave(
    {
      saveDraft: () => createDataTask(async () => ({ ok: true, value: saved })),
      publish: () =>
        createDataTask<AdminArticle>(async () => ({
          ok: false,
          error: { kind: "remote", code: "publish", message: "发布失败" },
        })),
    },
    {
      id: 11,
      title: "文章",
      summary: "摘要",
      articleTypeId: 1,
      termIds: [],
      contentHtml: "<p>正文</p>",
    },
    true,
  );

  assert.equal(outcome.kind, "publish-failed");
  if (outcome.kind === "publish-failed") {
    assert.equal(outcome.savedArticle.id, 11);
    assert.equal(outcome.error.kind, "remote");
  }
});

test("editor validation failure does not start a write", async () => {
  let writes = 0;
  const outcome = await executeAdminEditorSave(
    {
      saveDraft: () => {
        writes += 1;
        return createDataTask(async () => ({
          ok: true,
          value: adminArticle("draft"),
        }));
      },
      publish: () => {
        writes += 1;
        return createDataTask(async () => ({
          ok: true,
          value: adminArticle("published"),
        }));
      },
    },
    {
      id: 0,
      title: "   ",
      summary: "",
      articleTypeId: 0,
      termIds: [],
      contentHtml: "",
    },
    true,
  );

  assert.equal(outcome.kind, "save-failed");
  assert.equal(writes, 0);
});
