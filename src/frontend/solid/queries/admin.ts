import type { Accessor } from "solid-js";
import type {
  AdminArticle,
  ArticleId,
  ArticleTypeId,
  DraftInput,
} from "../../common/client";
import type { ArticleType, Term } from "../../common/contracts/domain";
import { createDataTask, type DataTask } from "../../common/data/task";
import {
  queryClient,
  startQuery,
  taskForArticleId,
  useDataResource,
} from "./core";

export type AdminTaxonomyKind = "types" | "terms";
export type AdminTaxonomyItem = ArticleType | Term;
export type AdminDraftValues = {
  readonly id: number;
  readonly title: string;
  readonly summary: string;
  readonly articleTypeId: number;
  readonly termIds: readonly number[];
  readonly contentHtml: string;
};

const emptyAdminArticle = (): AdminArticle => ({
  id: 0 as ArticleId,
  title: "",
  summary: "",
  articleTypeId: 0 as ArticleTypeId,
  contentHtml: "",
  termIds: [],
  terms: [],
  status: "draft",
  createdAt: "",
  updatedAt: "",
  htmlInspection: {
    profileVersion: "article-html/v1",
    valid: true,
    diagnostics: [],
  },
});

const resolvedTask = <T>(value: T): DataTask<T> =>
  createDataTask(async () => ({ ok: true, value }));

export const useAdminArticles = () =>
  useDataResource(
    () => undefined,
    () => queryClient.adminArticles.list(),
  );

export const useAdminArticle = (rawId: Accessor<string | null | undefined>) =>
  useDataResource(rawId, (value) =>
    taskForArticleId(value, (id) => queryClient.adminArticles.get(id)),
  );

export const useAdminEditorArticle = (
  rawId: Accessor<string | null | undefined>,
) =>
  useDataResource(rawId, (value) => {
    if (value === null || value === undefined || value === "") {
      return resolvedTask(emptyAdminArticle());
    }
    return taskForArticleId(value, (id) => queryClient.adminArticles.get(id));
  });

export const useAdminArticleTypes = () =>
  useDataResource(
    () => undefined,
    () => queryClient.taxonomy.listTypes(true),
  );

export const useAdminTerms = () =>
  useDataResource(
    () => undefined,
    () => queryClient.taxonomy.listTerms(true),
  );

export const useAdminTaxonomy = (kind: Accessor<AdminTaxonomyKind>) =>
  useDataResource<AdminTaxonomyItem[], AdminTaxonomyKind>(kind, (value) => {
    if (value === "terms") {
      return queryClient.taxonomy.listTerms(true);
    }
    return queryClient.taxonomy.listTypes(true);
  });

export const createAdminTaxonomyItem = (
  kind: AdminTaxonomyKind,
  name: string,
  termKind: Term["kind"],
) => {
  const normalizedName = name.trim();
  if (kind === "terms") {
    return startQuery(
      queryClient.taxonomy.createTerm(normalizedName, termKind),
    );
  }
  return startQuery(queryClient.taxonomy.createType(normalizedName));
};

export const renameAdminTaxonomyItem = (
  kind: AdminTaxonomyKind,
  item: AdminTaxonomyItem,
  name: string,
) => {
  const normalizedName = name.trim();
  if (kind === "terms") {
    return startQuery(queryClient.taxonomy.renameTerm(item.id, normalizedName));
  }
  return startQuery(queryClient.taxonomy.renameType(item.id, normalizedName));
};

export const generateRecommendations = () =>
  startQuery(queryClient.adminArticles.generateRecommendations());

export const saveDraft = (values: AdminDraftValues) => {
  const input: DraftInput = {
    title: values.title.trim(),
    summary: values.summary.trim(),
    articleTypeId: values.articleTypeId,
    termIds: values.termIds,
    contentHtml: values.contentHtml,
  };
  if (values.id > 0) input.id = values.id as ArticleId;
  return startQuery(queryClient.draftEditor.saveDraft(input));
};

export const publishArticle = (id: number) =>
  startQuery(queryClient.draftEditor.publish(id as ArticleId));

export const unpublishArticle = (id: number) =>
  startQuery(queryClient.draftEditor.unpublish(id as ArticleId));
