import assert from "node:assert/strict";
import test from "node:test";
import { emptyFilter } from "../../common/contracts/domain";
import {
  articleBrowseInput,
  articleFilterInput,
  positiveArticleId,
  taskForArticleId,
} from "./index";

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
