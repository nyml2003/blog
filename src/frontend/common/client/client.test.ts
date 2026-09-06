import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "./client";
import { createJsonTransport } from "../data/transport";
import { parseArticle } from "./domain";

// ArticleListItem wire fields from src/core/protocol/src/wire.rs.
const listItem = {
  id: 12,
  title: "Ops runtime checklist",
  summary: "Runtime contract verification",
  articleTypeId: 2,
  articleType: { id: 2, name: "Field Notes" },
  status: "published",
  createdAt: "2026-08-05T09:00:00Z",
  updatedAt: "2026-09-05T12:00:00Z",
  publishedAt: "2026-08-05T10:00:00Z",
  termIds: [4],
  terms: [{ id: 4, name: "runtime", kind: "tag" }],
};
const detail = { ...listItem, contentHtml: "<p>Runtime contract</p>" };
const inspection = {
  profileVersion: "article-html/v1",
  valid: true,
  diagnostics: [],
};

function clientRespondingWith(data: unknown) {
  return createClient(
    createJsonTransport(async () =>
      Response.json({ code: "OK", message: "", data }),
    ),
  );
}

test("public and admin lists decode body-free wire items and preserve totals", async () => {
  const draft = { ...listItem, id: 13, status: "draft" };
  const { publishedAt: _publishedAt, ...draftItem } = draft;
  for (const item of [listItem, draftItem]) {
    const client = clientRespondingWith({
      items: [item],
      page: 1,
      pageSize: 20,
      total: 25,
      hasMore: true,
    });
    const tasks = [client.adminArticles.list()];
    if (item.status === "published") {
      tasks.push(client.articleCatalog.listPublishedArticles());
    }
    for (const task of tasks) {
      const result = await task.start();
      assert.deepEqual(result, {
        ok: true,
        value: { items: [item], total: 25 },
      });
      assert.ok(result.ok);
      assert.equal("contentHtml" in result.value.items[0], false);
    }
  }
});

test("list decoding strips an unexpected body without treating it as detail", async () => {
  const client = clientRespondingWith({ items: [detail], total: 1 });
  for (const task of [
    client.articleCatalog.listPublishedArticles(),
    client.adminArticles.list(),
  ]) {
    assert.deepEqual(await task.start(), {
      ok: true,
      value: { items: [listItem], total: 1 },
    });
  }
});

test("public detail, admin detail and recommendations still require contentHtml", async () => {
  const id = parseArticle(detail).id;
  const missingBody = clientRespondingWith({
    ...listItem,
    htmlInspection: inspection,
  });
  const missingRecommendationBody = clientRespondingWith([listItem]);
  for (const task of [
    missingBody.articleCatalog.getPublishedArticle(id),
    missingBody.adminArticles.get(id),
    missingRecommendationBody.recommendationFeed.getHomeRecommendations(),
  ]) {
    const result = await task.start();
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("Missing article body must fail decoding");
    assert.equal(result.error.kind, "protocol");
    if (result.error.kind !== "protocol")
      assert.fail("Expected protocol error");
    assert.ok(
      result.error.issues?.some((issue) => issue.endsWith("contentHtml")),
    );
  }

  const publicDetail = clientRespondingWith(detail);
  assert.deepEqual(
    await publicDetail.articleCatalog.getPublishedArticle(id).start(),
    {
      ok: true,
      value: detail,
    },
  );
  const adminDetail = { ...detail, htmlInspection: inspection };
  assert.deepEqual(
    await clientRespondingWith(adminDetail).adminArticles.get(id).start(),
    {
      ok: true,
      value: adminDetail,
    },
  );
  assert.deepEqual(
    await clientRespondingWith([detail])
      .recommendationFeed.getHomeRecommendations()
      .start(),
    { ok: true, value: [detail] },
  );
});

test("client builds domain intent requests and rejects invalid response data", async () => {
  const requests: string[] = [];
  const transport = {
    request: async <T>({ path }: { path: string }) => {
      requests.push(path);
      return { ok: true, value: { items: [], total: 0 } } as {
        ok: true;
        value: T;
      };
    },
  };
  const client = createClient(transport);
  assert.deepEqual(
    await client.articleCatalog.listPublishedArticles({ typeId: 2 }).start(),
    { ok: true, value: { items: [], total: 0 } },
  );
  assert.equal(
    requests[0],
    "/api/public/articles?sceneCode=public.article_list&type_id=2",
  );
  const bad = createClient({
    request: async () => ({ ok: true, value: { invalid: true } }) as never,
  }).articleCatalog.listPublishedArticles();
  assert.equal((await bad.start()).ok, false);
});
