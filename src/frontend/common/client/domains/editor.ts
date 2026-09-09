import { z } from "zod";
import { inspectHtml } from "../../validation/wasm";
import type { AdminArticle } from "../domain";
import { adminArticleSchema } from "../domain";
import type { Client } from "../api-client";
import { CLIENT_API_ROUTES } from "../routes-contract";
import { postBody, type ClientRequest } from "../request-kit";

/** 编辑器领域：本地 HTML 校验与草稿保存/发布。 */
export const createDraftEditorApi = (
  request: ClientRequest,
): Pick<Client, "draftEditor"> => ({
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
});
