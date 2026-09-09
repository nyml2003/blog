import { z } from "zod";
import type {
  CategoryShelf,
  ContentArticleDetail,
  ContentArticleList,
  ContentArticleSaveResult,
  ContentPreview,
  ContentSyncStatus,
  ContentTaxonomy,
  ContentWorkspace,
} from "../domain";
import {
  categoryShelfSchema,
  contentArticleDetailSchema,
  contentArticleListSchema,
  contentArticleSaveResultSchema,
  contentPreviewSchema,
  contentSyncStatusSchema,
  contentTaxonomySchema,
  contentWorkspaceSchema,
} from "../domain";
import type { Client } from "../api-client";
import { CLIENT_API_ROUTES } from "../routes-contract";
import {
  contentTaxonomyBody,
  getPath,
  postBody,
  type ClientRequest,
} from "../request-kit";

/** 内容工作区领域：taxonomy 工作流与工作区文章。 */
export const createContentTaxonomyApi = (
  request: ClientRequest,
): Pick<Client, "contentTaxonomy"> => ({
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
});
