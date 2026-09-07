import { z } from "zod";
import type {
  Article,
  ArticleListItem,
  AdminArticle,
  ArticleBrowsePage,
  ArticleId,
  ArticleType,
  MobileShelf,
  TShelf,
  Term,
} from "./domain";
import {
  articleSchema,
  articleListSchema,
  articleBrowsePageSchema,
  adminArticleSchema,
} from "./domain";
import { inspectHtml } from "../validation/wasm";
import type { HtmlInspection } from "../validation/article-html";
import type { DataError } from "../data/errors";
import { err, ok, type Result } from "../data/result";
import { createDataTask, type DataTask } from "../data/task";
import type { Transport } from "../data/transport";

const typeSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
});
const termSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  kind: z.enum(["topic", "tag"]),
});
const shelfSchema = z.object({
  sections: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      // 分区截断前的全量条数（`type-<id>` 分区即该类型的全量计数）。
      total: z.number().int().nonnegative(),
      articles: z.array(
        z.object({
          id: z.number().int().positive(),
          title: z.string(),
          summary: z.string(),
          updatedAt: z.string(),
          terms: z.array(termSchema),
        }),
      ),
    }),
  ),
  total: z.number().int().nonnegative(),
  hasFilters: z.boolean(),
  warnings: z.array(z.string()),
});
const tShelfSchema = z.object({
  filters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
  selectedFilterId: z.string(),
  articles: z.array(
    z.object({
      id: z.number().int().positive(),
      title: z.string(),
      summary: z.string(),
      updatedAt: z.string(),
      terms: z.array(termSchema),
    }),
  ),
  total: z.number().int().nonnegative(),
});
const decode = <T>(
  schema: z.ZodType<T>,
  value: unknown,
): Result<T, DataError> => {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? ok(parsed.data)
    : err({
        kind: "protocol",
        message: "响应数据格式不符合协议",
        issues: parsed.error.issues.map(
          (issue) => issue.path.join(".") || issue.message,
        ),
      });
};

export type ArticleFilterInput = {
  termIds?: readonly number[];
  typeId?: number;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
};
/** `public.article_browse` 入参：维度间 AND 的三级单选；`page` 缺省取后端默认。 */
export type ArticleBrowseInput = {
  typeId?: number;
  topicId?: number;
  tagId?: number;
  page?: number;
};
export type TShelfInput = {
  surface: "recommendation" | "archive";
  filterId: string;
};
export type DraftInput = {
  id?: ArticleId;
  title: string;
  summary?: string;
  articleTypeId: number;
  termIds: readonly number[];
  contentHtml: string;
};

export interface Client {
  articleCatalog: {
    listPublishedArticles(
      input?: ArticleFilterInput,
    ): DataTask<{ items: ArticleListItem[]; total: number }>;
    browseArticles(input?: ArticleBrowseInput): DataTask<ArticleBrowsePage>;
    getPublishedArticle(id: ArticleId): DataTask<Article>;
  };
  recommendationFeed: { getHomeRecommendations(): DataTask<Article[]> };
  mobileShelf: {
    list(input?: ArticleFilterInput): DataTask<MobileShelf>;
  };
  tShelf: {
    get(input: TShelfInput): DataTask<TShelf>;
  };
  taxonomy: {
    listTypes(admin?: boolean): DataTask<ArticleType[]>;
    listTerms(admin?: boolean): DataTask<Term[]>;
    createType(name: string): DataTask<ArticleType>;
    createTerm(name: string, kind: "topic" | "tag"): DataTask<Term>;
    renameType(id: number, name: string): DataTask<ArticleType>;
    renameTerm(id: number, name: string): DataTask<Term>;
  };
  adminArticles: {
    list(
      input?: ArticleFilterInput,
    ): DataTask<{ items: ArticleListItem[]; total: number }>;
    get(id: ArticleId): DataTask<AdminArticle>;
    publish(id: ArticleId): DataTask<AdminArticle>;
    unpublish(id: ArticleId): DataTask<AdminArticle>;
    generateRecommendations(): DataTask<undefined>;
  };
  draftEditor: {
    inspectHtml(source: string): DataTask<HtmlInspection>;
    saveDraft(input: DraftInput): DataTask<AdminArticle>;
    publish(id: ArticleId): DataTask<AdminArticle>;
    unpublish(id: ArticleId): DataTask<AdminArticle>;
  };
}

export type ClientApiRoute = {
  method: "GET" | "POST";
  endpoint: string;
  sceneCode: string;
};

/**
 * 完整、可枚举的浏览器 API 契约。Client 的每次请求都从这里取得 endpoint、method 与
 * sceneCode；golden 测试可直接遍历全集，不依赖手工调用每个 Client 方法。
 */
export const CLIENT_API_ROUTES = {
  publicArticleList: {
    method: "GET",
    endpoint: "/api/public/articles",
    sceneCode: "public.article_list",
  },
  publicArticleBrowse: {
    method: "GET",
    endpoint: "/api/public/articles",
    sceneCode: "public.article_browse",
  },
  publicArticleDetail: {
    method: "GET",
    endpoint: "/api/public/articles",
    sceneCode: "public.article_detail",
  },
  publicArticleTypeList: {
    method: "GET",
    endpoint: "/api/public/article-types",
    sceneCode: "public.article_type_list",
  },
  publicTermList: {
    method: "GET",
    endpoint: "/api/public/terms",
    sceneCode: "public.term_list",
  },
  publicRecommendationCurrent: {
    method: "GET",
    endpoint: "/api/public/recommendations",
    sceneCode: "public.recommendation_current",
  },
  publicMobileArticleShelf: {
    method: "GET",
    endpoint: "/api/public/mobile/article-shelf",
    sceneCode: "public.mobile_article_shelf",
  },
  publicTShelf: {
    method: "GET",
    endpoint: "/api/public/t-shelf",
    sceneCode: "public.t_shelf",
  },
  adminArticleList: {
    method: "GET",
    endpoint: "/api/admin/articles",
    sceneCode: "admin.article_list",
  },
  adminArticleDetail: {
    method: "GET",
    endpoint: "/api/admin/articles",
    sceneCode: "admin.article_detail",
  },
  adminArticleCreate: {
    method: "POST",
    endpoint: "/api/admin/articles",
    sceneCode: "admin.article_create",
  },
  adminArticleUpdate: {
    method: "POST",
    endpoint: "/api/admin/articles",
    sceneCode: "admin.article_update",
  },
  adminArticlePublish: {
    method: "POST",
    endpoint: "/api/admin/articles",
    sceneCode: "admin.article_publish",
  },
  adminArticleUnpublish: {
    method: "POST",
    endpoint: "/api/admin/articles",
    sceneCode: "admin.article_unpublish",
  },
  adminArticleTypeList: {
    method: "GET",
    endpoint: "/api/admin/article-types",
    sceneCode: "admin.article_type_list",
  },
  adminArticleTypeCreate: {
    method: "POST",
    endpoint: "/api/admin/article-types",
    sceneCode: "admin.article_type_create",
  },
  adminArticleTypeUpdate: {
    method: "POST",
    endpoint: "/api/admin/article-types",
    sceneCode: "admin.article_type_update",
  },
  adminTermList: {
    method: "GET",
    endpoint: "/api/admin/terms",
    sceneCode: "admin.term_list",
  },
  adminTermCreate: {
    method: "POST",
    endpoint: "/api/admin/terms",
    sceneCode: "admin.term_create",
  },
  adminTermUpdate: {
    method: "POST",
    endpoint: "/api/admin/terms",
    sceneCode: "admin.term_update",
  },
  adminRecommendationGenerate: {
    method: "POST",
    endpoint: "/api/admin/recommendations",
    sceneCode: "admin.recommendation_generate",
  },
} as const satisfies Record<string, ClientApiRoute>;

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== "") search.set(key, value);
  return search.toString();
};

const getPath = (
  route: ClientApiRoute,
  params: Record<string, string | undefined>,
) => `${route.endpoint}?${query({ sceneCode: route.sceneCode, ...params })}`;

const postBody = (route: ClientApiRoute, fields: Record<string, unknown>) => ({
  sceneCode: route.sceneCode,
  ...fields,
});

export function createClient(transport: Transport): Client {
  const request = <T>(
    path: string,
    schema: z.ZodType<T>,
    method: "GET" | "POST" = "GET",
    body?: unknown,
  ) =>
    createDataTask(async (signal) => {
      const response = await transport.request<unknown>({
        path,
        method,
        body,
        signal,
      });
      return response.ok ? decode(schema, response.value) : response;
    });
  return {
    articleCatalog: {
      listPublishedArticles: (input = {}) =>
        request<{ items: ArticleListItem[]; total: number }>(
          getPath(CLIENT_API_ROUTES.publicArticleList, {
            term_ids: input.termIds?.join(","),
            type_id: input.typeId?.toString(),
            created_from: input.createdFrom,
            created_to: input.createdTo,
            updated_from: input.updatedFrom,
            updated_to: input.updatedTo,
          }),
          articleListSchema as unknown as z.ZodType<{
            items: ArticleListItem[];
            total: number;
          }>,
          CLIENT_API_ROUTES.publicArticleList.method,
        ),
      browseArticles: (input = {}) =>
        request<ArticleBrowsePage>(
          getPath(CLIENT_API_ROUTES.publicArticleBrowse, {
            type_id: input.typeId?.toString(),
            topic_id: input.topicId?.toString(),
            tag_id: input.tagId?.toString(),
            page: input.page?.toString(),
          }),
          articleBrowsePageSchema as unknown as z.ZodType<ArticleBrowsePage>,
          CLIENT_API_ROUTES.publicArticleBrowse.method,
        ),
      getPublishedArticle: (id) =>
        request<Article>(
          getPath(CLIENT_API_ROUTES.publicArticleDetail, {
            id: String(id),
          }),
          articleSchema as unknown as z.ZodType<Article>,
          CLIENT_API_ROUTES.publicArticleDetail.method,
        ),
    },
    recommendationFeed: {
      getHomeRecommendations: () =>
        request<Article[]>(
          getPath(CLIENT_API_ROUTES.publicRecommendationCurrent, {}),
          z.array(articleSchema) as unknown as z.ZodType<Article[]>,
          CLIENT_API_ROUTES.publicRecommendationCurrent.method,
        ),
    },
    mobileShelf: {
      list: (input = {}) =>
        request<MobileShelf>(
          getPath(CLIENT_API_ROUTES.publicMobileArticleShelf, {
            term_ids: input.termIds?.join(","),
            type_id: input.typeId?.toString(),
            created_from: input.createdFrom,
            created_to: input.createdTo,
            updated_from: input.updatedFrom,
            updated_to: input.updatedTo,
          }),
          shelfSchema as unknown as z.ZodType<MobileShelf>,
          CLIENT_API_ROUTES.publicMobileArticleShelf.method,
        ),
    },
    tShelf: {
      get: (input) =>
        request<TShelf>(
          getPath(CLIENT_API_ROUTES.publicTShelf, {
            surface: input.surface,
            filter_id: input.filterId,
          }),
          tShelfSchema as unknown as z.ZodType<TShelf>,
          CLIENT_API_ROUTES.publicTShelf.method,
        ),
    },
    taxonomy: {
      listTypes: (admin = false) => {
        const route = admin
          ? CLIENT_API_ROUTES.adminArticleTypeList
          : CLIENT_API_ROUTES.publicArticleTypeList;
        return request<ArticleType[]>(
          getPath(route, {}),
          z.array(typeSchema) as unknown as z.ZodType<ArticleType[]>,
          route.method,
        );
      },
      listTerms: (admin = false) => {
        const route = admin
          ? CLIENT_API_ROUTES.adminTermList
          : CLIENT_API_ROUTES.publicTermList;
        return request<Term[]>(
          getPath(route, {}),
          z.array(termSchema) as unknown as z.ZodType<Term[]>,
          route.method,
        );
      },
      createType: (name) =>
        request<ArticleType>(
          CLIENT_API_ROUTES.adminArticleTypeCreate.endpoint,
          typeSchema as unknown as z.ZodType<ArticleType>,
          CLIENT_API_ROUTES.adminArticleTypeCreate.method,
          postBody(CLIENT_API_ROUTES.adminArticleTypeCreate, { name }),
        ),
      createTerm: (name, kind) =>
        request<Term>(
          CLIENT_API_ROUTES.adminTermCreate.endpoint,
          termSchema as unknown as z.ZodType<Term>,
          CLIENT_API_ROUTES.adminTermCreate.method,
          postBody(CLIENT_API_ROUTES.adminTermCreate, { name, kind }),
        ),
      renameType: (id, name) =>
        request<ArticleType>(
          CLIENT_API_ROUTES.adminArticleTypeUpdate.endpoint,
          typeSchema as unknown as z.ZodType<ArticleType>,
          CLIENT_API_ROUTES.adminArticleTypeUpdate.method,
          postBody(CLIENT_API_ROUTES.adminArticleTypeUpdate, { id, name }),
        ),
      renameTerm: (id, name) =>
        request<Term>(
          CLIENT_API_ROUTES.adminTermUpdate.endpoint,
          termSchema as unknown as z.ZodType<Term>,
          CLIENT_API_ROUTES.adminTermUpdate.method,
          postBody(CLIENT_API_ROUTES.adminTermUpdate, { id, name }),
        ),
    },
    adminArticles: {
      list: (input = {}) =>
        request<{ items: ArticleListItem[]; total: number }>(
          getPath(CLIENT_API_ROUTES.adminArticleList, {
            term_ids: input.termIds?.join(","),
            type_id: input.typeId?.toString(),
            created_from: input.createdFrom,
            created_to: input.createdTo,
            updated_from: input.updatedFrom,
            updated_to: input.updatedTo,
          }),
          articleListSchema as unknown as z.ZodType<{
            items: ArticleListItem[];
            total: number;
          }>,
          CLIENT_API_ROUTES.adminArticleList.method,
        ),
      get: (id) =>
        request<AdminArticle>(
          getPath(CLIENT_API_ROUTES.adminArticleDetail, { id: String(id) }),
          adminArticleSchema as unknown as z.ZodType<AdminArticle>,
          CLIENT_API_ROUTES.adminArticleDetail.method,
        ),
      publish: (id) =>
        request<AdminArticle>(
          CLIENT_API_ROUTES.adminArticlePublish.endpoint,
          adminArticleSchema as unknown as z.ZodType<AdminArticle>,
          CLIENT_API_ROUTES.adminArticlePublish.method,
          postBody(CLIENT_API_ROUTES.adminArticlePublish, { id }),
        ),
      unpublish: (id) =>
        request<AdminArticle>(
          CLIENT_API_ROUTES.adminArticleUnpublish.endpoint,
          adminArticleSchema as unknown as z.ZodType<AdminArticle>,
          CLIENT_API_ROUTES.adminArticleUnpublish.method,
          postBody(CLIENT_API_ROUTES.adminArticleUnpublish, { id }),
        ),
      generateRecommendations: () =>
        request<undefined>(
          CLIENT_API_ROUTES.adminRecommendationGenerate.endpoint,
          z.undefined(),
          CLIENT_API_ROUTES.adminRecommendationGenerate.method,
          postBody(CLIENT_API_ROUTES.adminRecommendationGenerate, {}),
        ),
    },
    draftEditor: {
      inspectHtml,
      saveDraft: (input) => {
        const route = input.id
          ? CLIENT_API_ROUTES.adminArticleUpdate
          : CLIENT_API_ROUTES.adminArticleCreate;
        return request<AdminArticle>(
          route.endpoint,
          adminArticleSchema as unknown as z.ZodType<AdminArticle>,
          route.method,
          {
            sceneCode: route.sceneCode,
            ...(input.id ? { id: input.id } : {}),
            title: input.title,
            summary: input.summary ?? "",
            articleTypeId: input.articleTypeId,
            termIds: input.termIds,
            contentHtml: input.contentHtml,
          },
        );
      },
      publish: (id) =>
        request<AdminArticle>(
          CLIENT_API_ROUTES.adminArticlePublish.endpoint,
          adminArticleSchema as unknown as z.ZodType<AdminArticle>,
          CLIENT_API_ROUTES.adminArticlePublish.method,
          postBody(CLIENT_API_ROUTES.adminArticlePublish, { id }),
        ),
      unpublish: (id) =>
        request<AdminArticle>(
          CLIENT_API_ROUTES.adminArticleUnpublish.endpoint,
          adminArticleSchema as unknown as z.ZodType<AdminArticle>,
          CLIENT_API_ROUTES.adminArticleUnpublish.method,
          postBody(CLIENT_API_ROUTES.adminArticleUnpublish, { id }),
        ),
    },
  };
}
