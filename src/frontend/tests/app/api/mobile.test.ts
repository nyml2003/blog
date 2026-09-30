import assert from "node:assert/strict";
import test from "node:test";
import { createMobileApi } from "../../../app/habitat/api/mobile";
import {
  articleIdFromSearch,
  canReturnToSite,
} from "../../../app/bootstrap/mobile/detail-input";
import { ok } from "@fluvient-loom/common";
import {
  type NetworkPort,
  type NetworkRequest,
  type NetworkResponse,
} from "@fluvient-loom/port";

function network(response: NetworkResponse): NetworkPort {
  return {
    request(_request: NetworkRequest) {
      return Promise.resolve(ok(response));
    },
  };
}

function body(data: unknown, code = "OK") {
  return { code, message: code === "OK" ? "" : "remote failure", data };
}

test("mobile API decodes the existing envelope and keeps endpoint ownership in L2", async () => {
  let requestPath = "";
  const client = createMobileApi({
    request(request) {
      requestPath = request.path;
      return Promise.resolve(
        ok({
          status: 200,
          headers: {},
          body: body({
            filters: [{ id: "all", name: "全部" }],
            selectedFilterId: "all",
            articles: [],
            total: 0,
          }),
        }),
      );
    },
  });

  const result = await client.tShelf
    .get({ surface: "recommendation", filterId: "all" })
    .start();
  assert.deepEqual(result, {
    ok: true,
    value: {
      filters: [{ id: "all", name: "全部" }],
      selectedFilterId: "all",
      articles: [],
      total: 0,
    },
  });
  assert.equal(
    requestPath,
    "/api/public/t-shelf?sceneCode=public.t_shelf&surface=recommendation&filter_id=all",
  );
});

test("mobile API turns remote failures into failed Results", async () => {
  const result = await createMobileApi(
    network({
      status: 503,
      headers: {},
      body: body({}, "SERVICE_UNAVAILABLE"),
    }),
  )
    .siteRoutes.get()
    .start();
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, "remote");
  assert.equal(result.error.status, 503);
  assert.equal(result.error.code, "SERVICE_UNAVAILABLE");
});

test("mobile API rejects invalid Zod payloads as protocol failures", async () => {
  const result = await createMobileApi(
    network({
      status: 200,
      headers: {},
      body: body({
        filters: [],
        selectedFilterId: "all",
        articles: [{ id: "not-an-id" }],
        total: 1,
      }),
    }),
  )
    .tShelf.get({ surface: "archive", filterId: "all" })
    .start();
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, "protocol");
  assert.ok(result.error.issues?.some((issue) => issue.includes("articles")));
});

test("mobile API retains the server-owned article href", async () => {
  const result = await createMobileApi(
    network({
      status: 200,
      headers: {},
      body: body({
        filters: [{ id: "all", name: "全部" }],
        selectedFilterId: "all",
        articles: [
          {
            id: 7,
            href: "/m/articles/detail.html?id=7",
            title: "文章",
            summary: "摘要",
            updatedAt: "2026-09-28T00:00:00Z",
            terms: [],
          },
        ],
        total: 1,
      }),
    }),
  )
    .tShelf.get({ surface: "archive", filterId: "all" })
    .start();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.articles[0]?.href, "/m/articles/detail.html?id=7");
});

test("mobile admin preview reads the management article contract", async () => {
  let requestPath = "";
  const result = await createMobileApi({
    request(request) {
      requestPath = request.path;
      return Promise.resolve(
        ok({
          status: 200,
          headers: {},
          body: body({
            id: 7,
            title: "文章",
            summary: "摘要",
            articleTypeId: 2,
            articleType: undefined,
            contentHtml: "<p>正文</p>",
            status: "draft",
            createdAt: "2026-09-28T00:00:00Z",
            updatedAt: "2026-09-28T00:00:00Z",
            publishedAt: undefined,
            termIds: [],
            terms: [],
            htmlInspection: {
              valid: true,
              profileVersion: "article-html/v1",
              diagnostics: [],
            },
          }),
        }),
      );
    },
  })
    .adminArticle.get(7)
    .start();
  assert.equal(result.ok, true);
  assert.equal(
    requestPath,
    "/api/admin/articles?sceneCode=admin.article_detail&id=7",
  );
});

test("detail input rejects invalid IDs and only returns into same-site history", () => {
  assert.equal(articleIdFromSearch("?id=7"), 7);
  for (const search of [
    "",
    "?id=0",
    "?id=-1",
    "?id=1.5",
    "?id=9007199254740992",
  ]) {
    assert.equal(articleIdFromSearch(search), undefined);
  }
  assert.equal(
    canReturnToSite("https://blog.test/m/articles", "https://blog.test", 2),
    true,
  );
  assert.equal(
    canReturnToSite("https://other.test/page", "https://blog.test", 2),
    false,
  );
  assert.equal(
    canReturnToSite("https://blog.test/m/articles", "https://blog.test", 1),
    false,
  );
  assert.equal(canReturnToSite("", "https://blog.test", 2), false);
});
