import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopApi } from "../../../app/habitat/api/desktop";
import { ok } from "../../../app/kernel/result";
import type { NetworkPort } from "../../../app/kernel/ports";

function body(data: unknown, code = "OK") {
  return { code, message: code === "OK" ? "" : "remote failure", data };
}

function network(response: { status: number; body: unknown }): NetworkPort {
  return {
    request() {
      return Promise.resolve(ok({ ...response, headers: {} }));
    },
  };
}

test("desktop API keeps the server route and shelf contracts", async () => {
  let requestPath = "";
  const client = createDesktopApi({
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
  assert.equal(result.ok, true);
  assert.equal(
    requestPath,
    "/api/public/t-shelf?sceneCode=public.t_shelf&surface=recommendation&filter_id=all",
  );
});

test("desktop API reports invalid payloads as protocol failures", async () => {
  const result = await createDesktopApi(
    network({
      status: 200,
      body: body({ filters: [], selectedFilterId: "all", articles: [{ id: "bad" }], total: 1 }),
    }),
  )
    .tShelf.get({ surface: "archive", filterId: "all" })
    .start();
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, "protocol");
});

test("desktop API requests a published article by id and normalizes optional fields", async () => {
  let requestPath = "";
  const result = await createDesktopApi({
    request(request) {
      requestPath = request.path;
      return Promise.resolve(ok({
        status: 200,
        headers: {},
        body: body({
          id: 7,
          title: "文章",
          summary: "摘要",
          articleTypeId: 2,
          articleType: null,
          contentHtml: "<p>正文</p>",
          status: "published",
          createdAt: "2026-09-28T00:00:00Z",
          updatedAt: "2026-09-28T00:00:00Z",
          publishedAt: null,
          terms: null,
        }),
      }));
    },
  }).article.getPublished(7).start();
  assert.equal(result.ok, true);
  assert.equal(requestPath, "/api/public/articles?sceneCode=public.article_detail&id=7");
  if (!result.ok) return;
  assert.equal(result.value.articleType, undefined);
  assert.equal(result.value.terms, undefined);
});
