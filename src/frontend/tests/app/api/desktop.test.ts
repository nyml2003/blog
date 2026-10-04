import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopApi } from "@blog/desktop-api";
import { routeWithQuery } from "@blog/desktop-shared/context";
import { ok } from "@fluvient/core";
import { type NetworkPort } from "@fluvient-loom/port";

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

test("desktop API keeps admin credentials in the login body", async () => {
  let requestPath = "";
  let requestBody: unknown;
  const result = await createDesktopApi({
    request(request) {
      requestPath = request.path;
      requestBody = request.body;
      return Promise.resolve(ok({ status: 200, headers: {}, body: body({}) }));
    },
  })
    .adminSession.login({
      password: "secret",
      verification: { kind: "totp", code: "123456" },
    })
    .start();
  assert.equal(result.ok, true);
  assert.equal(
    requestPath,
    "/api/admin/session?sceneCode=admin.session.create",
  );
  assert.deepEqual(requestBody, {
    sceneCode: "admin.session.create",
    password: "secret",
    verification: { kind: "totp", code: "123456" },
  });
});

test("desktop content API lists workspace articles and sends versioned removal", async () => {
  const paths: string[] = [];
  const bodies: unknown[] = [];
  const client = createDesktopApi({
    request(request) {
      paths.push(request.path);
      bodies.push(request.body);
      return Promise.resolve(
        ok({
          status: 200,
          headers: {},
          body: body({ version: 3, articles: [] }),
        }),
      );
    },
  });
  assert.equal((await client.content.listArticles().start()).ok, true);
  assert.equal(
    (
      await client.content
        .removeArticle({ expectedVersion: 3, articleId: 7 })
        .start()
    ).ok,
    true,
  );
  assert.deepEqual(paths, [
    "/api/admin/content/articles?sceneCode=admin.content_article_list",
    "/api/admin/content/articles/remove",
  ]);
  assert.deepEqual(bodies[1], { expectedVersion: 3, articleId: 7 });
});

test("desktop editor API keeps detail query and versioned save body", async () => {
  const paths: string[] = [];
  const bodies: unknown[] = [];
  const client = createDesktopApi({
    request(request) {
      paths.push(request.path);
      bodies.push(request.body);
      return Promise.resolve(
        ok({
          status: 200,
          headers: {},
          body: body({
            version: 4,
            workspace: {
              version: 5,
              status: "saved",
              taxonomy: {
                version: 1,
                nextCategoryId: 4,
                nextTagId: 5,
                categories: [],
                tags: [],
              },
              articles: [],
              pullRequest: null,
              lastError: null,
            },
            article: {
              id: 7,
              title: "文章",
              summary: "摘要",
              categoryIds: [2],
              tagIds: [3],
              contentHtml: "<p>正文</p>",
              createdAt: "2026-09-28",
              updatedAt: "2026-09-28",
              publishedAt: undefined,
            },
          }),
        }),
      );
    },
  });
  assert.equal((await client.content.getArticle(7).start()).ok, true);
  assert.equal(
    (
      await client.content
        .saveArticle({
          expectedVersion: 4,
          article: {
            id: 7,
            title: "文章",
            summary: "摘要",
            categoryIds: [2],
            tagIds: [3],
            contentHtml: "<p>正文</p>",
          },
        })
        .start()
    ).ok,
    true,
  );
  assert.deepEqual(paths, [
    "/api/admin/content/articles?sceneCode=admin.content_article_detail&id=7",
    "/api/admin/content/articles?sceneCode=admin.content_article_save",
  ]);
  assert.deepEqual(bodies[1], {
    expectedVersion: 4,
    article: {
      id: 7,
      title: "文章",
      summary: "摘要",
      categoryIds: [2],
      tagIds: [3],
      contentHtml: "<p>正文</p>",
    },
  });
});

test("desktop API reports invalid payloads as protocol failures", async () => {
  const result = await createDesktopApi(
    network({
      status: 200,
      body: body({
        filters: [],
        selectedFilterId: "all",
        articles: [{ id: "bad" }],
        total: 1,
      }),
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
      return Promise.resolve(
        ok({
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
        }),
      );
    },
  })
    .article.getPublished(7)
    .start();
  assert.equal(result.ok, true);
  assert.equal(
    requestPath,
    "/api/public/articles?sceneCode=public.article_detail&id=7",
  );
  if (!result.ok) return;
  assert.equal(result.value.articleType, undefined);
  assert.equal(result.value.terms, undefined);
});

test("desktop API reads a management article with HTML inspection", async () => {
  let requestPath = "";
  const result = await createDesktopApi({
    request(request) {
      requestPath = request.path;
      return Promise.resolve(
        ok({
          status: 200,
          headers: {},
          body: body({
            id: 7,
            title: "文章",
            summary: "",
            articleTypeId: 2,
            articleType: undefined,
            contentHtml: "<p>正文</p>",
            status: "draft",
            createdAt: "2026-09-28",
            updatedAt: "2026-09-28",
            publishedAt: undefined,
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

test("desktop navigation adapter owns query composition", () => {
  assert.equal(
    routeWithQuery(
      { routes: { article: "/articles/detail.html" } },
      "article",
      { id: 7 },
    ),
    "/articles/detail.html?id=7",
  );
  assert.equal(
    routeWithQuery({ routes: { archive: "/articles/index.html" } }, "archive", {
      type_id: "2",
    }),
    "/articles/index.html?type_id=2",
  );
});
