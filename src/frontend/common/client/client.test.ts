import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CLIENT_API_ROUTES, createClient } from "./client";
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

type GoldenRoute = {
  method: "GET" | "POST";
  endpoint: string;
  sceneCode: string;
};

const routeKey = (route: GoldenRoute) =>
  `${route.method} ${route.endpoint} ${route.sceneCode}`;

test("the enumerable client route registry matches the API golden list", () => {
  const golden = JSON.parse(
    readFileSync(
      new URL("../../../../docs/api/routes.json", import.meta.url),
      "utf8",
    ),
  ) as GoldenRoute[];
  assert.deepEqual(
    [...new Set(Object.values(CLIENT_API_ROUTES).map(routeKey))].sort(),
    [...new Set(golden.map(routeKey))].sort(),
  );
});

test("client request code keeps API literals inside the route registry", () => {
  const source = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
  const implementation = source
    .replace(
      /export const CLIENT_API_ROUTES = \{[\s\S]*?\} as const satisfies Record<string, ClientApiRoute>;/,
      "",
    )
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(implementation, /["'`]\/api\//);
  assert.doesNotMatch(implementation, /["'`](?:public|admin)\.[a-z_]+["'`]/);
});

// ShelfCard wire fields from src/core/protocol/src/wire.rs (no article body, no type).
const shelfCard = {
  id: 12,
  title: "Ops runtime checklist",
  summary: "Runtime contract verification",
  updatedAt: "2026-09-05T12:00:00Z",
  terms: [{ id: 4, name: "runtime", kind: "tag" }],
};

test("mobile shelf is requested without filters and keeps per-section totals", async () => {
  const shelf = {
    sections: [
      { id: "recommendation", title: "推荐", total: 3, articles: [shelfCard] },
      { id: "type-2", title: "Field Notes", total: 9, articles: [shelfCard] },
    ],
    total: 25,
    hasFilters: false,
    warnings: [],
  };
  const requests: string[] = [];
  const client = createClient({
    request: async <T>({ path }: { path: string }) => {
      requests.push(path);
      return { ok: true, value: shelf } as { ok: true; value: T };
    },
  });
  assert.deepEqual(await client.mobileShelf.list().start(), {
    ok: true,
    value: shelf,
  });
  assert.equal(
    requests[0],
    "/api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf",
  );
});

test("T shelf requests keep surface and selected filter in the protocol boundary", async () => {
  const data = {
    filters: [
      { id: "all", name: "全部" },
      { id: "7", name: "工程" },
    ],
    selectedFilterId: "7",
    articles: [
      {
        id: 4,
        title: "边界治理",
        summary: "查询层归一",
        updatedAt: "2026-09-07T00:00:00Z",
        terms: [],
      },
    ],
    total: 1,
  };
  const requests: string[] = [];
  const client = createClient({
    request: async <T>({ path }: { path: string }) => {
      requests.push(path);
      return { ok: true, value: data } as { ok: true; value: T };
    },
  });

  const result = await client.tShelf
    .get({ surface: "archive", filterId: "7" })
    .start();

  assert.equal(result.ok, true);
  assert.equal(
    requests[0],
    "/api/public/t-shelf?sceneCode=public.t_shelf&surface=archive&filter_id=7",
  );
  if (result.ok) {
    assert.equal(result.value.selectedFilterId, "7");
    assert.equal(result.value.articles[0]?.title, "边界治理");
  }
});

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

test("browse requests express type, topic and tag as separate AND params", async () => {
  const requests: string[] = [];
  const browsePage = {
    items: [listItem],
    page: 2,
    pageSize: 20,
    total: 25,
    hasMore: true,
  };
  const client = createClient({
    request: async <T>({ path }: { path: string }) => {
      requests.push(path);
      return { ok: true, value: browsePage } as { ok: true; value: T };
    },
  });
  const combined = await client.articleCatalog
    .browseArticles({
      typeId: 2,
      topicId: 4,
      tagId: 7,
      page: 2,
    })
    .start();
  assert.equal(
    requests[0],
    "/api/public/articles?sceneCode=public.article_browse&type_id=2&topic_id=4&tag_id=7&page=2",
  );
  assert.deepEqual(combined, { ok: true, value: browsePage });

  await client.articleCatalog.browseArticles().start();
  assert.equal(
    requests[1],
    "/api/public/articles?sceneCode=public.article_browse",
  );
  await client.articleCatalog.browseArticles({ topicId: 4 }).start();
  assert.equal(
    requests[2],
    "/api/public/articles?sceneCode=public.article_browse&topic_id=4",
  );
});

test("browse decoding keeps the paged envelope and refuses an unpaged body", async () => {
  const unpaged = clientRespondingWith({ items: [listItem], total: 1 });
  const failed = await unpaged.articleCatalog.browseArticles().start();
  assert.equal(failed.ok, false);
  if (failed.ok) assert.fail("browse must require page/pageSize/total");
  assert.equal(failed.error.kind, "protocol");

  const paged = clientRespondingWith({
    items: [listItem],
    page: 1,
    pageSize: 20,
    total: 1,
  });
  const decoded = await paged.articleCatalog.browseArticles().start();
  assert.deepEqual(decoded, {
    ok: true,
    value: { items: [listItem], page: 1, pageSize: 20, total: 1 },
  });
  assert.ok(decoded.ok);
  if (decoded.ok) assert.equal("contentHtml" in decoded.value.items[0], false);
});
