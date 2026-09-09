import { z } from "zod";
import type { AdminArticle, ArticleListItem } from "../domain";
import { adminArticleSchema, articleListSchema } from "../domain";
import type { Client } from "../api-client";
import { CLIENT_API_ROUTES } from "../routes-contract";
import { getPath, postBody, type ClientRequest } from "../request-kit";

/** 管理端文章领域：列表、详情、发布与推荐生成。 */
export const createAdminArticlesApi = (
  request: ClientRequest,
): Pick<Client, "adminArticles"> => ({
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
});
