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
import type { HtmlInspection } from "../validation/article-html";
import { createDataTask } from "../data/task";
import type { DataTask } from "../data/task";
import type { Transport } from "../data/transport";
import { decode, type ClientRequest } from "./request-kit";
import { createAdminSessionApi } from "./domains/session";
import { createSiteRoutesApi } from "./domains/site-routes";
import {
  createArticleCatalogApi,
  createMobileShelfApi,
  createRecommendationFeedApi,
  createTShelfApi,
} from "./domains/articles";
import { createContentTaxonomyApi } from "./domains/content";
import { createTaxonomyApi } from "./domains/taxonomy";
import { createAdminArticlesApi } from "./domains/admin-articles";
import { createDraftEditorApi } from "./domains/editor";

/**
 * 浏览器 API 客户端组合根（B 形态：单导出 createClient）。
 * 输入/输出类型与 Client 接口在此；各领域实现见 domains/，路由契约见 routes-contract.ts。
 */

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

/** `/api/public/site-routes` 的载荷：页面 id → 路径。 */
export type SiteRoutes = { routes: Record<string, string> };

export interface Client {
  adminSession: {
    login(input: AdminSessionLoginInput): DataTask<undefined>;
    logout(): DataTask<undefined>;
  };
  siteRoutes: {
    get(): DataTask<SiteRoutes>;
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
export function createClient(transport: Transport): Client {
  const request: ClientRequest = <T>(
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
    ...createAdminSessionApi(request),
    ...createSiteRoutesApi(request),
    ...createArticleCatalogApi(request),
    ...createRecommendationFeedApi(request),
    ...createMobileShelfApi(request),
    ...createTShelfApi(request),
    ...createContentTaxonomyApi(request),
    ...createTaxonomyApi(request),
    ...createAdminArticlesApi(request),
    ...createDraftEditorApi(request),
  };
}
