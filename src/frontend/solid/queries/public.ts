import type { Accessor } from "solid-js";
import type { ArticleBrowseInput, TShelfInput } from "../../common/client";
import type { ArticleFilter } from "../../common/contracts/domain";
import {
  articleFilterInput,
  queryClient,
  taskForArticleId,
  useDataResource,
} from "./core";

export type ArticleBrowseSelection = {
  readonly typeId: number | undefined;
  readonly topicId: number | undefined;
  readonly tagId: number | undefined;
};

export type TShelfSelection = TShelfInput;

export const articleBrowseInput = (
  selection: ArticleBrowseSelection,
  page?: number,
): ArticleBrowseInput => ({
  typeId: selection.typeId,
  topicId: selection.topicId,
  tagId: selection.tagId,
  page,
});

export const usePublishedArticles = (filter: Accessor<ArticleFilter>) =>
  useDataResource(filter, (value) =>
    queryClient.articleCatalog.listPublishedArticles(articleFilterInput(value)),
  );

export const usePublishedArticle = (
  rawId: Accessor<string | null | undefined>,
) =>
  useDataResource(rawId, (value) =>
    taskForArticleId(value, (id) =>
      queryClient.articleCatalog.getPublishedArticle(id),
    ),
  );

export const useHomeRecommendations = () =>
  useDataResource(
    () => undefined,
    () => queryClient.recommendationFeed.getHomeRecommendations(),
  );

export const useTShelf = (selection: Accessor<TShelfSelection>) =>
  useDataResource(selection, (value) => queryClient.tShelf.get(value));

export const useMobileArticleShelf = () =>
  useDataResource(
    () => undefined,
    () => queryClient.mobileShelf.list(),
  );

export const usePublicArticleTypes = () =>
  useDataResource(
    () => undefined,
    () => queryClient.taxonomy.listTypes(),
  );

export const usePublicTerms = () =>
  useDataResource(
    () => undefined,
    () => queryClient.taxonomy.listTerms(),
  );

export const useArticleBrowse = (selection: Accessor<ArticleBrowseSelection>) =>
  useDataResource(selection, (value) =>
    queryClient.articleCatalog.browseArticles(articleBrowseInput(value)),
  );

export const loadArticleBrowsePage = (
  selection: ArticleBrowseSelection,
  page: number,
) =>
  queryClient.articleCatalog.browseArticles(
    articleBrowseInput(selection, page),
  );
