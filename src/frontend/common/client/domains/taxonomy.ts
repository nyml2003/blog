import { z } from "zod";
import type { ArticleType, Term } from "../domain";
import type { Client } from "../api-client";
import { CLIENT_API_ROUTES } from "../routes-contract";
import {
  getPath,
  postBody,
  termSchema,
  typeSchema,
  type ClientRequest,
} from "../request-kit";

/** 分类领域：文章类型与标签（topic/tag）。 */
export const createTaxonomyApi = (
  request: ClientRequest,
): Pick<Client, "taxonomy"> => ({
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
});
