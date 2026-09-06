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

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== "") search.set(key, value);
  return search.toString();
};

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
          `/api/public/articles?${query({ sceneCode: "public.article_list", term_ids: input.termIds?.join(","), type_id: input.typeId?.toString(), created_from: input.createdFrom, created_to: input.createdTo, updated_from: input.updatedFrom, updated_to: input.updatedTo })}`,
          articleListSchema as unknown as z.ZodType<{
            items: ArticleListItem[];
            total: number;
          }>,
        ),
      browseArticles: (input = {}) =>
        request<ArticleBrowsePage>(
          `/api/public/articles?${query({
            sceneCode: "public.article_browse",
            type_id: input.typeId?.toString(),
            topic_id: input.topicId?.toString(),
            tag_id: input.tagId?.toString(),
            page: input.page?.toString(),
          })}`,
          articleBrowsePageSchema as unknown as z.ZodType<ArticleBrowsePage>,
        ),
      getPublishedArticle: (id) =>
        request<Article>(
          `/api/public/articles?sceneCode=public.article_detail&id=${encodeURIComponent(String(id))}`,
          articleSchema as unknown as z.ZodType<Article>,
        ),
    },
    recommendationFeed: {
      getHomeRecommendations: () =>
        request<Article[]>(
          "/api/public/recommendations?sceneCode=public.recommendation_current",
          z.array(articleSchema) as unknown as z.ZodType<Article[]>,
        ),
    },
    mobileShelf: {
      list: (input = {}) =>
        request<MobileShelf>(
          `/api/public/mobile/article-shelf?${query({
            sceneCode: "public.mobile_article_shelf",
            term_ids: input.termIds?.join(","),
            type_id: input.typeId?.toString(),
            created_from: input.createdFrom,
            created_to: input.createdTo,
            updated_from: input.updatedFrom,
            updated_to: input.updatedTo,
          })}`,
          shelfSchema as unknown as z.ZodType<MobileShelf>,
      ),
    },
    tShelf: {
      get: (input) =>
        request<TShelf>(
          `/api/public/t-shelf?${query({
            sceneCode: "public.t_shelf",
            surface: input.surface,
            filter_id: input.filterId,
          })}`,
          tShelfSchema as unknown as z.ZodType<TShelf>,
        ),
    },
    taxonomy: {
      listTypes: (admin = false) =>
        request<ArticleType[]>(
          `${admin ? "/api/admin" : "/api/public"}/article-types?sceneCode=${admin ? "admin" : "public"}.article_type_list`,
          z.array(typeSchema) as unknown as z.ZodType<ArticleType[]>,
        ),
      listTerms: (admin = false) =>
        request<Term[]>(
          `${admin ? "/api/admin" : "/api/public"}/terms?sceneCode=${admin ? "admin" : "public"}.term_list`,
          z.array(termSchema) as unknown as z.ZodType<Term[]>,
        ),
      createType: (name) =>
        request<ArticleType>(
          "/api/admin/article-types",
          typeSchema as unknown as z.ZodType<ArticleType>,
          "POST",
          { sceneCode: "admin.article_type_create", name },
        ),
      createTerm: (name, kind) =>
        request<Term>(
          "/api/admin/terms",
          termSchema as unknown as z.ZodType<Term>,
          "POST",
          { sceneCode: "admin.term_create", name, kind },
        ),
      renameType: (id, name) =>
        request<ArticleType>(
          "/api/admin/article-types",
          typeSchema as unknown as z.ZodType<ArticleType>,
          "POST",
          { sceneCode: "admin.article_type_update", id, name },
        ),
      renameTerm: (id, name) =>
        request<Term>(
          "/api/admin/terms",
          termSchema as unknown as z.ZodType<Term>,
          "POST",
          { sceneCode: "admin.term_update", id, name },
        ),
    },
    adminArticles: {
      list: (input = {}) =>
        request<{ items: ArticleListItem[]; total: number }>(
          `/api/admin/articles?${query({ sceneCode: "admin.article_list", term_ids: input.termIds?.join(","), type_id: input.typeId?.toString(), created_from: input.createdFrom, created_to: input.createdTo, updated_from: input.updatedFrom, updated_to: input.updatedTo })}`,
          articleListSchema as unknown as z.ZodType<{
            items: ArticleListItem[];
            total: number;
          }>,
        ),
      get: (id) =>
        request<AdminArticle>(
          `/api/admin/articles?sceneCode=admin.article_detail&id=${encodeURIComponent(String(id))}`,
          adminArticleSchema as unknown as z.ZodType<AdminArticle>,
        ),
      publish: (id) =>
        request<AdminArticle>(
          "/api/admin/articles",
          adminArticleSchema as unknown as z.ZodType<AdminArticle>,
          "POST",
          { sceneCode: "admin.article_publish", id },
        ),
      unpublish: (id) =>
        request<AdminArticle>(
          "/api/admin/articles",
          adminArticleSchema as unknown as z.ZodType<AdminArticle>,
          "POST",
          { sceneCode: "admin.article_unpublish", id },
        ),
      generateRecommendations: () =>
        request<undefined>(
          "/api/admin/recommendations",
          z.undefined(),
          "POST",
          { sceneCode: "admin.recommendation_generate" },
        ),
    },
    draftEditor: {
      inspectHtml,
      saveDraft: (input) =>
        request<AdminArticle>(
          "/api/admin/articles",
          adminArticleSchema as unknown as z.ZodType<AdminArticle>,
          "POST",
          {
            sceneCode: input.id
              ? "admin.article_update"
              : "admin.article_create",
            ...(input.id ? { id: input.id } : {}),
            title: input.title,
            summary: input.summary ?? "",
            articleTypeId: input.articleTypeId,
            termIds: input.termIds,
            contentHtml: input.contentHtml,
          },
        ),
      publish: (id) =>
        request<AdminArticle>(
          "/api/admin/articles",
          adminArticleSchema as unknown as z.ZodType<AdminArticle>,
          "POST",
          { sceneCode: "admin.article_publish", id },
        ),
      unpublish: (id) =>
        request<AdminArticle>(
          "/api/admin/articles",
          adminArticleSchema as unknown as z.ZodType<AdminArticle>,
          "POST",
          { sceneCode: "admin.article_unpublish", id },
        ),
    },
  };
}
