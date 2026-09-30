import { createDataTask, err, ok } from "../../../kernel";
import { cancellationFailure } from "../../../kernel/cancellation";
import type {
  DataTask,
  NetworkPort,
  NetworkRequest,
} from "../../../kernel/ports";
import type { Result } from "../../../kernel/result";
import { z } from "zod";
import {
  adminArticleSchema,
  articleSchema,
  siteRoutesSchema,
  tShelfSchema,
  type AdminSessionLoginInput,
  type DesktopApi,
  type DesktopApiFailure,
  type ContentPreview,
  type SyncStatus,
  type Taxonomy,
  type TShelfInput,
  type Workspace,
} from "./types";

const envelopeSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  data: z.unknown(),
});
const routes = {
  siteRoutes: {
    endpoint: "/api/public/site-routes",
    sceneCode: "public.site_routes",
  },
  tShelf: { endpoint: "/api/public/t-shelf", sceneCode: "public.t_shelf" },
  article: {
    endpoint: "/api/public/articles",
    sceneCode: "public.article_detail",
  },
  adminArticle: {
    endpoint: "/api/admin/articles",
    sceneCode: "admin.article_detail",
  },
  adminSession: {
    endpoint: "/api/admin/session",
    sceneCode: "admin.session_create",
  },
  contentArticleList: {
    endpoint: "/api/admin/content/articles",
    sceneCode: "admin.content_article_list",
  },
  contentArticleRemove: {
    endpoint: "/api/admin/content/articles/remove",
    sceneCode: "admin.content_article_remove",
  },
  contentArticleDetail: {
    endpoint: "/api/admin/content/articles",
    sceneCode: "admin.content_article_detail",
  },
  contentArticleSave: {
    endpoint: "/api/admin/content/articles",
    sceneCode: "admin.content_article_save",
  },
  contentWorkspace: {
    endpoint: "/api/admin/content/workspace",
    sceneCode: "admin.content_workspace",
  },
  taxonomySave: {
    endpoint: "/api/admin/content/taxonomy",
    sceneCode: "admin.content_taxonomy_save",
  },
  taxonomyAnalyze: {
    endpoint: "/api/admin/content/taxonomy/analyze",
    sceneCode: "admin.content_taxonomy_analyze",
  },
  taxonomyReview: {
    endpoint: "/api/admin/content/taxonomy/review",
    sceneCode: "admin.content_taxonomy_review",
  },
  contentPreview: {
    endpoint: "/api/admin/content/preview",
    sceneCode: "admin.content_preview",
  },
  contentSubmit: {
    endpoint: "/api/admin/content/submit",
    sceneCode: "admin.content_submit",
  },
  contentAbandon: {
    endpoint: "/api/admin/content/abandon",
    sceneCode: "admin.content_abandon",
  },
  contentSync: {
    endpoint: "/api/admin/content/sync",
    sceneCode: "admin.content_sync",
  },
  contentSyncStatus: {
    endpoint: "/api/admin/content/sync",
    sceneCode: "admin.content_sync_status",
  },
} as const;

function requestPath(
  endpoint: string,
  sceneCode: string,
  parameters: Record<string, string | undefined>,
): string {
  const search = new URLSearchParams({ sceneCode });
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  return `${endpoint}?${search}`;
}

function failure(
  kind: DesktopApiFailure["kind"],
  message: string,
  details: Partial<Omit<DesktopApiFailure, "kind" | "message">> = {},
): DesktopApiFailure {
  return {
    kind,
    message,
    code: details.code,
    status: details.status,
    issues: details.issues,
  };
}

function decode<T>(
  body: unknown,
  status: number,
  schema: z.ZodType<T>,
): Result<T, DesktopApiFailure> {
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) {
    return err(
      failure("protocol", "响应 envelope 不符合协议", {
        status,
        issues: envelope.error.issues.map(
          (issue) => issue.path.join(".") || issue.message,
        ),
      }),
    );
  }
  if (status < 200 || status >= 300 || envelope.data.code !== "OK") {
    return err(
      failure("remote", envelope.data.message ?? "请求失败", {
        status,
        code: envelope.data.code,
      }),
    );
  }
  const payload = schema.safeParse(envelope.data.data);
  if (!payload.success) {
    return err(
      failure("protocol", "响应 data 不符合协议", {
        status,
        code: envelope.data.code,
        issues: payload.error.issues.map(
          (issue) => issue.path.join(".") || issue.message,
        ),
      }),
    );
  }
  return ok(payload.data);
}

function getRequest(path: string): Omit<NetworkRequest, "signal"> {
  return {
    path,
    method: "GET",
    headers: {},
    body: undefined,
    timeoutMs: undefined,
  };
}

function postRequest(
  path: string,
  body: unknown,
): Omit<NetworkRequest, "signal"> {
  return {
    path,
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    timeoutMs: undefined,
  };
}

function contentRequestPath(
  route: { endpoint: string; sceneCode: string },
  parameters: Record<string, string | undefined>,
): string {
  return requestPath(route.endpoint, route.sceneCode, parameters);
}

const taxonomySchema: z.ZodType<Taxonomy> = z
  .object({
    version: z.number().int().nonnegative(),
    nextCategoryId: z.number().int().positive(),
    nextTagId: z.number().int().positive(),
    categories: z.array(
      z.object({
        id: z.number().int().positive(),
        name: z.string(),
        parentId: z.number().int().positive().nullish(),
        position: z.number().int().nonnegative(),
      }),
    ),
    tags: z.array(
      z.object({ id: z.number().int().positive(), name: z.string() }),
    ),
  })
  .transform((value) => ({
    ...value,
    categories: value.categories.map((category) => ({
      ...category,
      parentId: category.parentId ?? undefined,
    })),
  }));
const workspaceSchema: z.ZodType<Workspace> = z
  .object({
    version: z.number().int().nonnegative(),
    status: z.string(),
    taxonomy: taxonomySchema,
    articles: z.array(
      z.object({
        id: z.number().int().positive(),
        title: z.string(),
        categoryIds: z.array(z.number().int().positive()),
        tagIds: z.array(z.number().int().positive()),
      }),
    ),
    pullRequest: z.unknown(),
    lastError: z.string().nullish(),
  })
  .transform((value) => ({
    ...value,
    lastError: value.lastError ?? undefined,
  }));
const previewSchema: z.ZodType<ContentPreview> = z.object({
  version: z.number().int().nonnegative(),
  changedArticles: z.array(z.number().int().positive()),
  diff: z.string(),
  warnings: z.array(z.string()),
});
const syncSchema: z.ZodType<SyncStatus> = z.object({
  status: z.enum(["idle", "running", "succeeded", "failed"]),
  commit: z.string().optional(),
  articleCount: z.number().int().nonnegative().optional(),
  message: z.string().optional(),
  lastSuccessCommit: z.string().optional(),
});
const contentArticleSchema = z
  .object({
    id: z.number().int().positive(),
    title: z.string(),
    summary: z.string(),
    categoryIds: z.array(z.number().int().positive()),
    tagIds: z.array(z.number().int().positive()),
    contentHtml: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    publishedAt: z.string().nullish(),
  })
  .transform((value) => ({
    ...value,
    publishedAt: value.publishedAt ?? undefined,
  }));
const contentArticleDetailSchema = z.object({
  version: z.number().int().nonnegative(),
  article: contentArticleSchema,
});
const contentArticleSaveResultSchema = z.object({
  workspace: workspaceSchema,
  article: contentArticleSchema,
});

function request<T>(
  network: NetworkPort,
  input: Omit<NetworkRequest, "signal">,
  schema: z.ZodType<T>,
): DataTask<T, DesktopApiFailure> {
  return createDataTask<T, DesktopApiFailure>({
    async execute(signal) {
      const response = await network.request({ ...input, signal });
      if (!response.ok) {
        if (response.error.kind === "cancelled")
          return err(cancellationFailure());
        return err(
          failure(
            response.error.kind === "timeout" ? "timeout" : response.error.kind,
            response.error.message,
          ),
        );
      }
      return decode(response.value.body, response.value.status, schema);
    },
    mapRejected(cause) {
      return failure(
        "network",
        cause instanceof Error ? cause.message : "请求执行失败",
      );
    },
  });
}

export function createDesktopApi(network: NetworkPort): DesktopApi {
  return {
    adminSession: {
      login: (input: AdminSessionLoginInput) =>
        request(
          network,
          {
            path: requestPath(
              routes.adminSession.endpoint,
              routes.adminSession.sceneCode,
              {},
            ),
            method: "POST",
            headers: { "content-type": "application/json" },
            body: input,
            timeoutMs: undefined,
          },
          z.unknown().transform(() => undefined),
        ),
    },
    content: {
      listArticles: () =>
        request(
          network,
          getRequest(
            requestPath(
              routes.contentArticleList.endpoint,
              routes.contentArticleList.sceneCode,
              {},
            ),
          ),
          z.object({
            version: z.number().int().nonnegative(),
            articles: z.array(
              z
                .object({
                  id: z.number().int().positive(),
                  title: z.string(),
                  summary: z.string(),
                  categoryIds: z.array(z.number().int().positive()),
                  tagIds: z.array(z.number().int().positive()),
                  contentHtml: z.string(),
                  createdAt: z.string(),
                  updatedAt: z.string(),
                  publishedAt: z.string().nullish(),
                })
                .transform((value) => ({
                  ...value,
                  publishedAt: value.publishedAt ?? undefined,
                })),
            ),
          }),
        ),
      removeArticle: (input) =>
        request(
          network,
          {
            path: routes.contentArticleRemove.endpoint,
            method: "POST",
            headers: { "content-type": "application/json" },
            body: input,
            timeoutMs: undefined,
          },
          z.unknown().transform(() => undefined),
        ),
      getArticle: (id) =>
        request(
          network,
          getRequest(
            contentRequestPath(routes.contentArticleDetail, { id: String(id) }),
          ),
          contentArticleDetailSchema,
        ),
      saveArticle: (input) =>
        request(
          network,
          postRequest(contentRequestPath(routes.contentArticleSave, {}), input),
          contentArticleSaveResultSchema,
        ),
      workspace: () =>
        request(
          network,
          getRequest(contentRequestPath(routes.contentWorkspace, {})),
          workspaceSchema,
        ),
      saveTaxonomy: (input) =>
        request(
          network,
          postRequest(contentRequestPath(routes.taxonomySave, {}), input),
          workspaceSchema,
        ),
      analyze: (input) =>
        request(
          network,
          postRequest(contentRequestPath(routes.taxonomyAnalyze, {}), input),
          workspaceSchema,
        ),
      review: (input) =>
        request(
          network,
          postRequest(contentRequestPath(routes.taxonomyReview, {}), input),
          workspaceSchema,
        ),
      preview: () =>
        request(
          network,
          getRequest(contentRequestPath(routes.contentPreview, {})),
          previewSchema,
        ),
      submit: (input) =>
        request(
          network,
          postRequest(contentRequestPath(routes.contentSubmit, {}), input),
          workspaceSchema,
        ),
      abandon: (input) =>
        request(
          network,
          postRequest(contentRequestPath(routes.contentAbandon, {}), input),
          workspaceSchema,
        ),
      sync: () =>
        request(
          network,
          postRequest(contentRequestPath(routes.contentSync, {}), {}),
          syncSchema,
        ),
      syncStatus: () =>
        request(
          network,
          getRequest(contentRequestPath(routes.contentSyncStatus, {})),
          syncSchema,
        ),
    },
    siteRoutes: {
      get: () =>
        request(
          network,
          getRequest(
            requestPath(
              routes.siteRoutes.endpoint,
              routes.siteRoutes.sceneCode,
              {},
            ),
          ),
          siteRoutesSchema,
        ),
    },
    tShelf: {
      get: (input: TShelfInput) =>
        request(
          network,
          getRequest(
            requestPath(routes.tShelf.endpoint, routes.tShelf.sceneCode, {
              surface: input.surface,
              filter_id: input.filterId,
            }),
          ),
          tShelfSchema,
        ),
    },
    article: {
      getPublished: (id) =>
        request(
          network,
          getRequest(
            requestPath(routes.article.endpoint, routes.article.sceneCode, {
              id: String(id),
            }),
          ),
          articleSchema,
        ),
    },
    adminArticle: {
      get: (id) =>
        request(
          network,
          getRequest(
            requestPath(
              routes.adminArticle.endpoint,
              routes.adminArticle.sceneCode,
              { id: String(id) },
            ),
          ),
          adminArticleSchema,
        ),
    },
  };
}
