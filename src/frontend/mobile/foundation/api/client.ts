import { err, ok } from "@fluvient/core";
import { createDataTask } from "@fluvient-loom/query";
import { cancellationFailure } from "@fluvient/core";
import {
  type DataTask,
  type NetworkPort,
  type NetworkRequest,
} from "@fluvient-loom/port";
import { type Result } from "@fluvient/core";
import {
  categoryShelfSchema,
  articleSearchSchema,
  adminArticleSchema,
  mobileArticleSchema,
  mobilePageSchema,
  siteRoutesSchema,
  tShelfSchema,
  type MobileApi,
  type MobileApiFailure,
  type TShelfInput,
} from "./types";
import { z } from "zod";

const envelopeSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  data: z.unknown(),
});

const route = {
  siteRoutes: {
    endpoint: "/api/public/site-routes",
    sceneCode: "public.site_routes",
  },
  tShelf: { endpoint: "/api/public/t-shelf", sceneCode: "public.t_shelf" },
  categoryShelf: {
    endpoint: "/api/public/mobile/category-shelf",
    sceneCode: "public.mobile_category_shelf",
  },
  search: {
    endpoint: "/api/public/articles",
    sceneCode: "public.article_search",
  },
  article: {
    endpoint: "/api/public/articles",
    sceneCode: "public.article_detail",
  },
  adminArticle: {
    endpoint: "/api/admin/articles",
    sceneCode: "admin.article_detail",
  },
  page: {
    endpoint: "/api/public/mobile/page",
    sceneCode: "public.mobile_page",
  },
} as const;

function query(parameters: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  return search.toString();
}

function path(
  endpoint: string,
  sceneCode: string,
  parameters: Record<string, string | undefined>,
): string {
  return `${endpoint}?${query({ sceneCode, ...parameters })}`;
}

function failure(
  kind: MobileApiFailure["kind"],
  message: string,
  details: Partial<Omit<MobileApiFailure, "kind" | "message">> = {},
): MobileApiFailure {
  return {
    kind,
    message,
    code: details.code,
    status: details.status,
    issues: details.issues,
  };
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : "请求执行失败";
}

function decode<T>(
  body: unknown,
  status: number,
  schema: z.ZodType<T>,
): Result<T, MobileApiFailure> {
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

function request<T>(
  network: NetworkPort,
  requestInput: Omit<NetworkRequest, "signal">,
  schema: z.ZodType<T>,
): DataTask<T, MobileApiFailure> {
  return createDataTask<T, MobileApiFailure>({
    async execute(signal) {
      const response = await network.request({ ...requestInput, signal });
      if (!response.ok) {
        if (response.error.kind === "cancelled")
          return err(cancellationFailure());
        return err(
          failure(
            response.error.kind === "timeout" ? "timeout" : response.error.kind,
            response.error.message,
            {
              status: undefined,
            },
          ),
        );
      }
      return decode(response.value.body, response.value.status, schema);
    },
    mapRejected(cause) {
      return failure("network", messageFrom(cause));
    },
  });
}

const getRequest = (pathValue: string): Omit<NetworkRequest, "signal"> => ({
  path: pathValue,
  method: "GET",
  headers: {},
  body: undefined,
  timeoutMs: undefined,
});

export function createMobileApi(network: NetworkPort): MobileApi {
  return {
    page: {
      get: (page, parameters = {}) =>
        request(
          network,
          getRequest(
            path(route.page.endpoint, route.page.sceneCode, {
              page,
              ...parameters,
            }),
          ),
          mobilePageSchema,
        ),
    },
    siteRoutes: {
      get: () =>
        request(
          network,
          getRequest(
            path(route.siteRoutes.endpoint, route.siteRoutes.sceneCode, {}),
          ),
          siteRoutesSchema,
        ),
    },
    tShelf: {
      get: (input: TShelfInput) =>
        request(
          network,
          getRequest(
            path(route.tShelf.endpoint, route.tShelf.sceneCode, {
              surface: input.surface,
              filter_id: input.filterId,
            }),
          ),
          tShelfSchema,
        ),
    },
    categoryShelf: {
      get: (categoryId: number | undefined) =>
        request(
          network,
          getRequest(
            path(route.categoryShelf.endpoint, route.categoryShelf.sceneCode, {
              category_id: categoryId?.toString(),
            }),
          ),
          categoryShelfSchema,
        ),
    },
    article: {
      getPublished: (id: number) =>
        request(
          network,
          getRequest(
            path(route.article.endpoint, route.article.sceneCode, {
              id: id.toString(),
            }),
          ),
          mobileArticleSchema,
        ),
    },
    search: {
      get: (query, page = 1) =>
        request(
          network,
          getRequest(
            path(route.search.endpoint, route.search.sceneCode, {
              q: query,
              page: String(page),
            }),
          ),
          articleSearchSchema,
        ),
    },
    adminArticle: {
      get: (id) =>
        request(
          network,
          getRequest(
            path(route.adminArticle.endpoint, route.adminArticle.sceneCode, {
              id: String(id),
            }),
          ),
          adminArticleSchema,
        ),
    },
  };
}

export type {
  AdminArticle,
  ArticleSearch,
  CategoryShelf,
  MobileApi,
  MobileApiFailure,
  MobileArticle,
  MobileModule,
  MobileNavigation,
  MobileNavigationIcon,
  MobilePage,
  SiteRoutes,
  TShelf,
  TShelfInput,
} from "./types";
