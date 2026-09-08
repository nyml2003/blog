import { z } from "zod";
import type {
  Article,
  ArticleListItem,
  AdminArticle,
  ArticleBrowsePage,
  ArticleId,
  ArticleType,
  CategoryShelf,
  ContentArticleDetail,
  ContentArticleList,
  ContentArticleSaveResult,
  ContentPreview,
  ContentSyncStatus,
  ContentTaxonomy,
  ContentWorkspace,
  MobileShelf,
  TShelf,
  Term,
} from "./domain";
import {
  articleSchema,
  articleListSchema,
  articleBrowsePageSchema,
  adminArticleSchema,
  categoryShelfSchema,
  contentArticleDetailSchema,
  contentArticleListSchema,
  contentArticleSaveResultSchema,
  contentPreviewSchema,
  contentSyncStatusSchema,
  contentTaxonomySchema,
  contentWorkspaceSchema,
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
export type CategoryShelfInput = Partial<{
  categoryId: number;
}>;
export type ContentWorkspaceVersionInput = {
  readonly expectedVersion: number;
};
export type ContentTaxonomySaveInput = {
  readonly expectedVersion: number;
  readonly taxonomy: ContentTaxonomy;
};
export type ContentTaxonomyAnalyzeInput = {
  readonly expectedVersion: number;
  readonly articleIds: readonly number[];
};
export type ContentArticleFields = {
  readonly title: string;
  readonly summary: string;
  readonly categoryIds: readonly number[];
  readonly tagIds: readonly number[];
  readonly contentHtml: string;
};
export type ContentArticleCreateInput = {
  readonly kind: "create";
  readonly expectedVersion: number;
  readonly article: ContentArticleFields;
};
export type ContentArticleUpdateInput = {
  readonly kind: "update";
  readonly expectedVersion: number;
  readonly article: ContentArticleFields & { readonly id: number };
};
export type ContentArticleSaveInput =
  | ContentArticleCreateInput
  | ContentArticleUpdateInput;
export type ContentArticleRemoveInput = {
  readonly expectedVersion: number;
  readonly articleId: number;
};
export type DraftInput = {
  id?: ArticleId;
  title: string;
  summary?: string;
  articleTypeId: number;
  termIds: readonly number[];
  contentHtml: string;
};

export type AdminSessionVerification =
  | { readonly kind: "totp"; readonly code: string }
  | { readonly kind: "recovery"; readonly code: string };

export type AdminSessionLoginInput = {
  readonly password: string;
  readonly verification: AdminSessionVerification;
};

export interface Client {
  adminSession: {
    login(input: AdminSessionLoginInput): DataTask<undefined>;
    logout(): DataTask<undefined>;
  };
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
  contentTaxonomy: {
    getPublic(): DataTask<ContentTaxonomy>;
    getCategoryShelf(input?: CategoryShelfInput): DataTask<CategoryShelf>;
    getWorkspace(): DataTask<ContentWorkspace>;
    save(input: ContentTaxonomySaveInput): DataTask<ContentWorkspace>;
    analyze(input: ContentTaxonomyAnalyzeInput): DataTask<ContentWorkspace>;
    review(input: ContentWorkspaceVersionInput): DataTask<ContentWorkspace>;
    preview(): DataTask<ContentPreview>;
    submit(input: ContentWorkspaceVersionInput): DataTask<ContentWorkspace>;
    abandon(input: ContentWorkspaceVersionInput): DataTask<ContentWorkspace>;
    synchronize(): DataTask<ContentSyncStatus>;
    getSyncStatus(): DataTask<ContentSyncStatus>;
    listArticles(): DataTask<ContentArticleList>;
    getArticle(id: number): DataTask<ContentArticleDetail>;
    saveArticle(
      input: ContentArticleSaveInput,
    ): DataTask<ContentArticleSaveResult>;
    removeArticle(input: ContentArticleRemoveInput): DataTask<ContentWorkspace>;
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
  method: "GET" | "POST" | "DELETE";
  endpoint: string;
  sceneCode: string;
};

/**
 * 完整、可枚举的浏览器 API 契约。Client 的每次请求都从这里取得 endpoint、method 与
 * sceneCode；golden 测试可直接遍历全集，不依赖手工调用每个 Client 方法。
 */
export const CLIENT_API_ROUTES = {
  adminSessionCreate: {
    method: "POST",
    endpoint: "/api/admin/session",
    sceneCode: "admin.session.create",
  },
  adminSessionDelete: {
    method: "DELETE",
    endpoint: "/api/admin/session",
    sceneCode: "admin.session.delete",
  },
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
  publicTaxonomyTree: {
    method: "GET",
    endpoint: "/api/public/taxonomy",
    sceneCode: "public.taxonomy_tree",
  },
  publicMobileCategoryShelf: {
    method: "GET",
    endpoint: "/api/public/mobile/category-shelf",
    sceneCode: "public.mobile_category_shelf",
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
  adminContentWorkspace: {
    method: "GET",
    endpoint: "/api/admin/content/workspace",
    sceneCode: "admin.content_workspace",
  },
  adminContentArticleList: {
    method: "GET",
    endpoint: "/api/admin/content/articles",
    sceneCode: "admin.content_article_list",
  },
  adminContentArticleDetail: {
    method: "GET",
    endpoint: "/api/admin/content/articles",
    sceneCode: "admin.content_article_detail",
  },
  adminContentArticleSave: {
    method: "POST",
    endpoint: "/api/admin/content/articles",
    sceneCode: "admin.content_article_save",
  },
  adminContentArticleRemove: {
    method: "POST",
    endpoint: "/api/admin/content/articles/remove",
    sceneCode: "admin.content_article_remove",
  },
  adminContentTaxonomySave: {
    method: "POST",
    endpoint: "/api/admin/content/taxonomy",
    sceneCode: "admin.content_taxonomy_save",
  },
  adminContentTaxonomyAnalyze: {
    method: "POST",
    endpoint: "/api/admin/content/taxonomy/analyze",
    sceneCode: "admin.content_taxonomy_analyze",
  },
  adminContentTaxonomyReview: {
    method: "POST",
    endpoint: "/api/admin/content/taxonomy/review",
    sceneCode: "admin.content_taxonomy_review",
  },
  adminContentPreview: {
    method: "GET",
    endpoint: "/api/admin/content/preview",
    sceneCode: "admin.content_preview",
  },
  adminContentSubmit: {
    method: "POST",
    endpoint: "/api/admin/content/submit",
    sceneCode: "admin.content_submit",
  },
  adminContentAbandon: {
    method: "POST",
    endpoint: "/api/admin/content/abandon",
    sceneCode: "admin.content_abandon",
  },
  adminContentSync: {
    method: "POST",
    endpoint: "/api/admin/content/sync",
    sceneCode: "admin.content_sync",
  },
  adminContentSyncStatus: {
    method: "GET",
    endpoint: "/api/admin/content/sync",
    sceneCode: "admin.content_sync_status",
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

const contentTaxonomyBody = (taxonomy: ContentTaxonomy) => ({
  ...taxonomy,
  categories: taxonomy.categories.map((category) => ({
    ...category,
    parentId: category.parentId ?? null,
  })),
});

export function createClient(transport: Transport): Client {
  const request = <T>(
    path: string,
    schema: z.ZodType<T>,
    method: "GET" | "POST" | "DELETE" = "GET",
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
    adminSession: {
      login: (input) =>
        request<undefined>(
          CLIENT_API_ROUTES.adminSessionCreate.endpoint,
          z.unknown().transform(() => undefined),
          CLIENT_API_ROUTES.adminSessionCreate.method,
          postBody(CLIENT_API_ROUTES.adminSessionCreate, input),
        ),
      logout: () =>
        request<undefined>(
          getPath(CLIENT_API_ROUTES.adminSessionDelete, {}),
          z.unknown().transform(() => undefined),
          CLIENT_API_ROUTES.adminSessionDelete.method,
        ),
    },
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
    contentTaxonomy: {
      getPublic: () =>
        request<ContentTaxonomy>(
          getPath(CLIENT_API_ROUTES.publicTaxonomyTree, {}),
          contentTaxonomySchema as z.ZodType<ContentTaxonomy>,
          CLIENT_API_ROUTES.publicTaxonomyTree.method,
        ),
      getCategoryShelf: (input = {}) =>
        request<CategoryShelf>(
          getPath(CLIENT_API_ROUTES.publicMobileCategoryShelf, {
            category_id: input.categoryId?.toString(),
          }),
          categoryShelfSchema as z.ZodType<CategoryShelf>,
          CLIENT_API_ROUTES.publicMobileCategoryShelf.method,
        ),
      getWorkspace: () =>
        request<ContentWorkspace>(
          getPath(CLIENT_API_ROUTES.adminContentWorkspace, {}),
          contentWorkspaceSchema as z.ZodType<ContentWorkspace>,
          CLIENT_API_ROUTES.adminContentWorkspace.method,
        ),
      save: (input) =>
        request<ContentWorkspace>(
          CLIENT_API_ROUTES.adminContentTaxonomySave.endpoint,
          contentWorkspaceSchema as z.ZodType<ContentWorkspace>,
          CLIENT_API_ROUTES.adminContentTaxonomySave.method,
          postBody(CLIENT_API_ROUTES.adminContentTaxonomySave, {
            ...input,
            taxonomy: contentTaxonomyBody(input.taxonomy),
          }),
        ),
      analyze: (input) =>
        request<ContentWorkspace>(
          CLIENT_API_ROUTES.adminContentTaxonomyAnalyze.endpoint,
          contentWorkspaceSchema as z.ZodType<ContentWorkspace>,
          CLIENT_API_ROUTES.adminContentTaxonomyAnalyze.method,
          postBody(CLIENT_API_ROUTES.adminContentTaxonomyAnalyze, input),
        ),
      review: (input) =>
        request<ContentWorkspace>(
          CLIENT_API_ROUTES.adminContentTaxonomyReview.endpoint,
          contentWorkspaceSchema as z.ZodType<ContentWorkspace>,
          CLIENT_API_ROUTES.adminContentTaxonomyReview.method,
          postBody(CLIENT_API_ROUTES.adminContentTaxonomyReview, input),
        ),
      preview: () =>
        request<ContentPreview>(
          getPath(CLIENT_API_ROUTES.adminContentPreview, {}),
          contentPreviewSchema as z.ZodType<ContentPreview>,
          CLIENT_API_ROUTES.adminContentPreview.method,
        ),
      submit: (input) =>
        request<ContentWorkspace>(
          CLIENT_API_ROUTES.adminContentSubmit.endpoint,
          contentWorkspaceSchema as z.ZodType<ContentWorkspace>,
          CLIENT_API_ROUTES.adminContentSubmit.method,
          postBody(CLIENT_API_ROUTES.adminContentSubmit, input),
        ),
      abandon: (input) =>
        request<ContentWorkspace>(
          CLIENT_API_ROUTES.adminContentAbandon.endpoint,
          contentWorkspaceSchema as z.ZodType<ContentWorkspace>,
          CLIENT_API_ROUTES.adminContentAbandon.method,
          postBody(CLIENT_API_ROUTES.adminContentAbandon, input),
        ),
      synchronize: () =>
        request<ContentSyncStatus>(
          CLIENT_API_ROUTES.adminContentSync.endpoint,
          contentSyncStatusSchema as z.ZodType<ContentSyncStatus>,
          CLIENT_API_ROUTES.adminContentSync.method,
          postBody(CLIENT_API_ROUTES.adminContentSync, {}),
        ),
      getSyncStatus: () =>
        request<ContentSyncStatus>(
          getPath(CLIENT_API_ROUTES.adminContentSyncStatus, {}),
          contentSyncStatusSchema as z.ZodType<ContentSyncStatus>,
          CLIENT_API_ROUTES.adminContentSyncStatus.method,
        ),
      listArticles: () =>
        request<ContentArticleList>(
          getPath(CLIENT_API_ROUTES.adminContentArticleList, {}),
          contentArticleListSchema as z.ZodType<ContentArticleList>,
          CLIENT_API_ROUTES.adminContentArticleList.method,
        ),
      getArticle: (id) =>
        request<ContentArticleDetail>(
          getPath(CLIENT_API_ROUTES.adminContentArticleDetail, {
            id: String(id),
          }),
          contentArticleDetailSchema as z.ZodType<ContentArticleDetail>,
          CLIENT_API_ROUTES.adminContentArticleDetail.method,
        ),
      saveArticle: (input) =>
        request<ContentArticleSaveResult>(
          CLIENT_API_ROUTES.adminContentArticleSave.endpoint,
          contentArticleSaveResultSchema as z.ZodType<ContentArticleSaveResult>,
          CLIENT_API_ROUTES.adminContentArticleSave.method,
          postBody(CLIENT_API_ROUTES.adminContentArticleSave, {
            expectedVersion: input.expectedVersion,
            article: input.article,
          }),
        ),
      removeArticle: (input) =>
        request<ContentWorkspace>(
          CLIENT_API_ROUTES.adminContentArticleRemove.endpoint,
          contentWorkspaceSchema as z.ZodType<ContentWorkspace>,
          CLIENT_API_ROUTES.adminContentArticleRemove.method,
          postBody(CLIENT_API_ROUTES.adminContentArticleRemove, input),
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
