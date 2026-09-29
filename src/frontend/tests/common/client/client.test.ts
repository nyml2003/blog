import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createClient } from "../../../common/client/api-client";
import { CLIENT_API_ROUTES } from "../../../common/client/routes-contract";
import {
  createAdminAuthFetch,
  adminLoginPath,
  adminNextFromSearch,
  safeAdminNext,
} from "../../../common/client/admin-session-browser";
import {
  createJsonTransport,
  type TransportRequest,
} from "../../../common/data/transport";
import { parseArticle } from "../../../common/client/domain";

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
  method: "GET" | "POST" | "DELETE";
  endpoint: string;
  sceneCode: string;
};

const routeKey = (route: GoldenRoute) =>
  `${route.method} ${route.endpoint} ${route.sceneCode}`;

test("the enumerable client route registry matches the API golden list", () => {
  const golden = JSON.parse(
    readFileSync(
      new URL("../../../../../docs/api/routes.json", import.meta.url),
      "utf8",
    ),
  ) as GoldenRoute[];
  assert.deepEqual(
    [...new Set(Object.values(CLIENT_API_ROUTES).map(routeKey))].sort(),
    [...new Set(golden.map(routeKey))].sort(),
  );
});

test("client request code keeps API literals inside the route registry", () => {
  // PLAN-CODE-LAYOUT-001：客户端拆分后，路由字面量只允许出现在 routes-contract.ts。
  const sources = [
    "../../../common/client/api-client.ts",
    "../../../common/client/request-kit.ts",
    "../../../common/client/domains/session.ts",
    "../../../common/client/domains/site-routes.ts",
    "../../../common/client/domains/articles.ts",
    "../../../common/client/domains/content.ts",
    "../../../common/client/domains/taxonomy.ts",
    "../../../common/client/domains/admin-articles.ts",
    "../../../common/client/domains/editor.ts",
  ]
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
    .map((source) => source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ""));
  for (const implementation of sources) {
    assert.doesNotMatch(implementation, /["'`]\/api\//);
    assert.doesNotMatch(implementation, /["'`](?:public|admin)\.[a-z_]+["'`]/);
  }
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

test("category shelf and workspace commands keep taxonomy workflow fields at the client boundary", async () => {
  const taxonomy = {
    version: 1,
    nextCategoryId: 3,
    nextTagId: 2,
    categories: [
      { id: 1, name: "工程", parentId: null, position: 10 },
      { id: 2, name: "Rust", parentId: 1, position: 10 },
    ],
    tags: [{ id: 1, name: "性能" }],
  };
  const workspace = {
    version: 4,
    status: "saved",
    taxonomy,
    articles: [{ id: 8, title: "边界", categoryIds: [2], tagIds: [1] }],
    pullRequest: null,
  };
  const shelf = {
    taxonomy,
    selectedCategoryId: 1,
    articles: [
      {
        id: 8,
        href: "/m/articles/detail.html?id=8",
        title: "边界",
        summary: "分类",
        updatedAt: "2026-09-08T00:00:00Z",
        categoryIds: [2],
        tagIds: [1],
      },
    ],
    total: 1,
  };
  const requests: Array<{
    path: string;
    method: string;
    body: unknown;
  }> = [];
  const client = createClient({
    request: async <T>(request: {
      path: string;
      method: "GET" | "POST" | "DELETE";
      body?: unknown;
    }) => {
      requests.push({
        path: request.path,
        method: request.method,
        body: request.body,
      });
      const value = request.path.includes("category-shelf") ? shelf : workspace;
      return { ok: true, value } as { ok: true; value: T };
    },
  });

  const shelfResult = await client.contentTaxonomy
    .getCategoryShelf({ categoryId: 1 })
    .start();
  assert.equal(shelfResult.ok, true);
  assert.equal(
    requests[0]?.path,
    "/api/public/mobile/category-shelf?sceneCode=public.mobile_category_shelf&category_id=1",
  );

  if (!shelfResult.ok) assert.fail("category shelf must decode");
  assert.equal(
    shelfResult.value.articles[0]?.href,
    "/m/articles/detail.html?id=8",
  );
  const normalizedTaxonomy = shelfResult.value.taxonomy;
  await client.contentTaxonomy
    .save({ expectedVersion: 4, taxonomy: normalizedTaxonomy })
    .start();
  assert.deepEqual(requests[1]?.body, {
    sceneCode: "admin.content_taxonomy_save",
    expectedVersion: 4,
    taxonomy,
  });
  await client.contentTaxonomy
    .analyze({ expectedVersion: 5, articleIds: [8] })
    .start();
  assert.deepEqual(requests[2]?.body, {
    sceneCode: "admin.content_taxonomy_analyze",
    expectedVersion: 5,
    articleIds: [8],
  });

  const workspaceResult = await client.contentTaxonomy.getWorkspace().start();
  assert.equal(workspaceResult.ok, true);
  if (!workspaceResult.ok) assert.fail("workspace must decode");
  assert.equal(workspaceResult.value.pullRequest, undefined);
});

test("admin session requests keep credentials only in the login body", async () => {
  const requests: TransportRequest[] = [];
  const client = createClient({
    request: async <T>(request: TransportRequest) => {
      requests.push(request);
      return { ok: true, value: null as T };
    },
  });

  assert.deepEqual(
    await client.adminSession
      .login({
        password: "correct horse battery staple",
        verification: { kind: "totp", code: "123456" },
      })
      .start(),
    { ok: true, value: undefined },
  );
  assert.deepEqual(
    {
      path: requests[0]?.path,
      method: requests[0]?.method,
      body: requests[0]?.body,
    },
    {
      path: "/api/admin/session",
      method: "POST",
      body: {
        sceneCode: "admin.session.create",
        password: "correct horse battery staple",
        verification: { kind: "totp", code: "123456" },
      },
    },
  );

  assert.deepEqual(await client.adminSession.logout().start(), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(
    {
      path: requests[1]?.path,
      method: requests[1]?.method,
      body: requests[1]?.body,
    },
    {
      path: "/api/admin/session?sceneCode=admin.session.delete",
      method: "DELETE",
      body: undefined,
    },
  );
});

test("content abandon and sync commands use the versioned runtime routes", async () => {
  const requests: TransportRequest[] = [];
  const workspace = {
    version: 5,
    status: "clean",
    taxonomy: {
      version: 1,
      nextCategoryId: 2,
      nextTagId: 1,
      categories: [{ id: 1, name: "工程", parentId: null, position: 10 }],
      tags: [],
    },
    articles: [],
    pullRequest: null,
  };
  const client = createClient({
    request: async <T>(request: TransportRequest) => {
      requests.push(request);
      if (request.path === "/api/admin/content/abandon") {
        return { ok: true, value: workspace as T };
      }
      if (request.method === "POST") {
        return {
          ok: true,
          value: {
            status: "succeeded",
            commit: "abc123",
            articleCount: 4,
          } as T,
        };
      }
      return {
        ok: true,
        value: {
          status: "failed",
          commit: "def456",
          message: "invalid snapshot",
          lastSuccessCommit: null,
        } as T,
      };
    },
  });

  const abandoned = await client.contentTaxonomy
    .abandon({ expectedVersion: 5 })
    .start();
  assert.equal(abandoned.ok, true);
  assert.deepEqual(requests[0]?.body, {
    sceneCode: "admin.content_abandon",
    expectedVersion: 5,
  });

  const synchronized = await client.contentTaxonomy.synchronize().start();
  assert.deepEqual(synchronized, {
    ok: true,
    value: { status: "succeeded", commit: "abc123", articleCount: 4 },
  });
  assert.deepEqual(
    {
      path: requests[1]?.path,
      method: requests[1]?.method,
      body: requests[1]?.body,
    },
    {
      path: "/api/admin/content/sync",
      method: "POST",
      body: { sceneCode: "admin.content_sync" },
    },
  );

  const status = await client.contentTaxonomy.getSyncStatus().start();
  assert.deepEqual(status, {
    ok: true,
    value: {
      status: "failed",
      commit: "def456",
      message: "invalid snapshot",
      lastSuccessCommit: undefined,
    },
  });
  assert.equal(
    requests[2]?.path,
    "/api/admin/content/sync?sceneCode=admin.content_sync_status",
  );
  assert.equal(requests[2]?.method, "GET");
});

test("workspace article routes keep versioned writes and authoritative save data", async () => {
  const requests: TransportRequest[] = [];
  const taxonomy = {
    version: 1,
    nextCategoryId: 3,
    nextTagId: 2,
    categories: [
      { id: 1, name: "工程", parentId: null, position: 10 },
      { id: 2, name: "Rust", parentId: 1, position: 10 },
    ],
    tags: [{ id: 1, name: "性能" }],
  };
  const article = {
    id: 17,
    title: "边界治理",
    summary: "工作区写入",
    categoryIds: [2],
    tagIds: [1],
    contentHtml: "<p>正文</p>",
    createdAt: "2026-09-08T00:00:00Z",
    updatedAt: "2026-09-08T01:00:00Z",
    publishedAt: null,
  };
  const workspace = {
    version: 6,
    status: "saved",
    taxonomy,
    articles: [{ id: 17, title: "边界治理", categoryIds: [2], tagIds: [1] }],
    pullRequest: null,
  };
  const client = createClient({
    request: async <T>(request: TransportRequest) => {
      requests.push(request);
      const sceneCode =
        request.body !== undefined &&
        request.body !== null &&
        typeof request.body === "object" &&
        "sceneCode" in request.body
          ? request.body.sceneCode
          : undefined;
      if (sceneCode === "admin.content_article_save") {
        return { ok: true, value: { workspace, article } as T };
      }
      if (sceneCode === "admin.content_article_remove") {
        return { ok: true, value: workspace as T };
      }
      if (request.path.includes("admin.content_article_detail")) {
        return { ok: true, value: { version: 5, article } as T };
      }
      return { ok: true, value: { version: 5, articles: [article] } as T };
    },
  });

  const listed = await client.contentTaxonomy.listArticles().start();
  assert.equal(listed.ok, true);
  assert.equal(
    requests[0]?.path,
    "/api/admin/content/articles?sceneCode=admin.content_article_list",
  );
  if (!listed.ok) assert.fail("article list must decode");
  assert.equal(listed.value.articles[0]?.publishedAt, undefined);

  const detailed = await client.contentTaxonomy.getArticle(17).start();
  assert.equal(detailed.ok, true);
  assert.equal(
    requests[1]?.path,
    "/api/admin/content/articles?sceneCode=admin.content_article_detail&id=17",
  );

  const saved = await client.contentTaxonomy
    .saveArticle({
      kind: "create",
      expectedVersion: 5,
      article: {
        title: "边界治理",
        summary: "工作区写入",
        categoryIds: [2],
        tagIds: [1],
        contentHtml: "<p>正文</p>",
      },
    })
    .start();
  assert.equal(saved.ok, true);
  if (!saved.ok) assert.fail("saved article must decode");
  assert.equal(saved.value.article.id, 17);
  assert.equal(saved.value.workspace.version, 6);
  assert.deepEqual(requests[2]?.body, {
    sceneCode: "admin.content_article_save",
    expectedVersion: 5,
    article: {
      title: "边界治理",
      summary: "工作区写入",
      categoryIds: [2],
      tagIds: [1],
      contentHtml: "<p>正文</p>",
    },
  });

  const removed = await client.contentTaxonomy
    .removeArticle({ expectedVersion: 6, articleId: 17 })
    .start();
  assert.equal(removed.ok, true);
  assert.deepEqual(
    {
      path: requests[3]?.path,
      method: requests[3]?.method,
      body: requests[3]?.body,
    },
    {
      path: "/api/admin/content/articles/remove",
      method: "POST",
      body: {
        sceneCode: "admin.content_article_remove",
        expectedVersion: 6,
        articleId: 17,
      },
    },
  );
});

test("admin next paths stay within admin and do not loop through login", () => {
  const origin = "https://notes.example";
  const paths = {
    loginPath: "/admin/login.html",
    homePath: "/admin/index.html",
  };
  assert.equal(
    safeAdminNext("/admin/articles/edit.html?id=7", origin, paths),
    "/admin/articles/edit.html?id=7",
  );
  assert.equal(
    adminNextFromSearch(
      `?next=${encodeURIComponent("/admin/terms/index.html?kind=tag")}`,
      origin,
      paths,
    ),
    "/admin/terms/index.html?kind=tag",
  );
  for (const unsafe of [
    null,
    "/",
    "//attacker.example/admin/",
    "/admin/../articles/index.html",
    "/admin/%5c%5cattacker.example",
    "/admin/login.html?next=%2Fadmin%2Findex.html",
    "https://notes.example/admin/index.html",
  ]) {
    assert.equal(safeAdminNext(unsafe, origin, paths), "/admin/index.html");
  }
});

test("admin API 401 redirects to login while session and public failures stay local", async () => {
  const redirects: string[] = [];
  const location = {
    origin: "https://notes.example",
    pathname: "/admin/articles/edit.html",
    search: "?id=7",
  };
  const fetcher: typeof fetch = async () =>
    new Response(
      JSON.stringify({ code: "UNAUTHORIZED", message: "请登录", data: null }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  const adminFetch = createAdminAuthFetch({
    fetcher,
    readLocation: () => location,
    beforeRedirect: () => redirects.push("before-redirect"),
    replaceLocation: (path) => redirects.push(path),
    routes: () => ({
      loginPath: "/admin/login.html",
      homePath: "/admin/index.html",
    }),
  });

  await adminFetch("/api/admin/articles?sceneCode=admin.article_list");
  assert.equal(redirects.length, 2);
  assert.equal(redirects[0], "before-redirect");
  const redirect = new URL(redirects[1], location.origin);
  assert.equal(redirect.pathname, "/admin/login.html");
  assert.equal(
    redirect.searchParams.get("next"),
    "/admin/articles/edit.html?id=7",
  );
  assert.equal(
    adminLoginPath(location, {
      loginPath: "/admin/login.html",
      homePath: "/admin/index.html",
    }),
    redirects[1],
  );

  await adminFetch("/api/admin/session");
  await adminFetch("/api/public/articles");
  await adminFetch("https://other.example/api/admin/articles");
  assert.equal(redirects.length, 2);
});

test("admin login source does not persist or log credentials", () => {
  const source = readFileSync(
    new URL("../../../desktop/src/pages/admin/login.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\./);
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
