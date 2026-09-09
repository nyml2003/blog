import { z } from "zod";
import type {
  Article,
  ArticleBrowsePage,
  ArticleListItem,
  MobileShelf,
  TShelf,
} from "../domain";
import {
  articleBrowsePageSchema,
  articleListSchema,
  articleSchema,
} from "../domain";
import type { Client } from "../api-client";
import { CLIENT_API_ROUTES } from "../routes-contract";
import {
  getPath,
  shelfSchema,
  tShelfSchema,
  type ClientRequest,
} from "../request-kit";

/** 公开文章领域：目录、检索、详情、首页推荐与两端货架。 */
export const createArticleCatalogApi = (
  request: ClientRequest,
): Pick<Client, "articleCatalog"> => ({
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
});

export const createRecommendationFeedApi = (
  request: ClientRequest,
): Pick<Client, "recommendationFeed"> => ({
  recommendationFeed: {
    getHomeRecommendations: () =>
      request<Article[]>(
        getPath(CLIENT_API_ROUTES.publicRecommendationCurrent, {}),
        z.array(articleSchema) as unknown as z.ZodType<Article[]>,
        CLIENT_API_ROUTES.publicRecommendationCurrent.method,
      ),
  },
});

export const createMobileShelfApi = (
  request: ClientRequest,
): Pick<Client, "mobileShelf"> => ({
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
});

export const createTShelfApi = (
  request: ClientRequest,
): Pick<Client, "tShelf"> => ({
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
});
