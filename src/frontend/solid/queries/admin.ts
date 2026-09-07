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
  executeQuery,
  queryClient,
  queryErrorFromUnknown,
  queryErrorMessage,
  type QueryError,
  type QueryReadonly,
  type QueryResult,
  type QueryTask,
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

export type AdminEditorSaveOutcome =
  | {
      readonly kind: "completed";
      readonly savedArticle: QueryReadonly<AdminArticle>;
      readonly article: QueryReadonly<AdminArticle>;
    }
  | {
      readonly kind: "save-failed";
      readonly error: QueryError;
    }
  | {
      readonly kind: "publish-failed";
      readonly savedArticle: QueryReadonly<AdminArticle>;
      readonly error: QueryError;
    };

export type AdminEditorArticle = QueryReadonly<AdminArticle>;

export type AdminEditorWriter = {
  readonly saveDraft: (input: DraftInput) => QueryTask<AdminArticle>;
  readonly publish: (id: ArticleId) => QueryTask<AdminArticle>;
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

export const refreshAfterSuccessfulQuery = async <T>(
  operation: Promise<QueryResult<T>>,
  refresh: () => Promise<unknown>,
): Promise<QueryResult<T>> => {
  const result = await operation;
  if (result.ok) void refresh();
  return result;
};

export const useAdminTaxonomy = (kind: Accessor<AdminTaxonomyKind>) => {
  const resource = useDataResource<AdminTaxonomyItem[], AdminTaxonomyKind>(
    kind,
    (value) => {
      if (value === "terms") {
        return queryClient.taxonomy.listTerms(true);
      }
      return queryClient.taxonomy.listTypes(true);
    },
  );
  return {
    ...resource,
    createItem: (name: string, termKind: Term["kind"]) =>
      refreshAfterSuccessfulQuery(
        createAdminTaxonomyItem(kind(), name, termKind),
        resource.refetch,
      ),
    renameItem: (item: AdminTaxonomyItem, name: string) =>
      refreshAfterSuccessfulQuery(
        renameAdminTaxonomyItem(kind(), item, name),
        resource.refetch,
      ),
  };
};

export const createAdminTaxonomyItem = (
  kind: AdminTaxonomyKind,
  name: string,
  termKind: Term["kind"],
): Promise<QueryResult<AdminTaxonomyItem>> => {
  const normalizedName = name.trim();
  if (kind === "terms") {
    return executeQuery(() =>
      queryClient.taxonomy.createTerm(normalizedName, termKind),
    );
  }
  return executeQuery(() => queryClient.taxonomy.createType(normalizedName));
};

export const renameAdminTaxonomyItem = (
  kind: AdminTaxonomyKind,
  item: AdminTaxonomyItem,
  name: string,
): Promise<QueryResult<AdminTaxonomyItem>> => {
  const normalizedName = name.trim();
  if (kind === "terms") {
    return executeQuery(() =>
      queryClient.taxonomy.renameTerm(item.id, normalizedName),
    );
  }
  return executeQuery(() =>
    queryClient.taxonomy.renameType(item.id, normalizedName),
  );
};

export const generateRecommendations = () =>
  executeQuery(() => queryClient.adminArticles.generateRecommendations());

const invalidDraftError = (): QueryError => ({
  kind: "protocol",
  message: "请填写标题并选择文章类型",
});

export const executeAdminEditorSave = async (
  writer: AdminEditorWriter,
  values: AdminDraftValues,
  shouldPublish: boolean,
): Promise<AdminEditorSaveOutcome> => {
  if (values.title.trim() === "" || values.articleTypeId <= 0) {
    return { kind: "save-failed", error: invalidDraftError() };
  }

  const input: DraftInput = {
    title: values.title.trim(),
    summary: values.summary.trim(),
    articleTypeId: values.articleTypeId,
    termIds: values.termIds,
    contentHtml: values.contentHtml,
  };
  if (values.id > 0) input.id = values.id as ArticleId;

  let saved: QueryResult<AdminArticle>;
  try {
    saved = await startQuery(writer.saveDraft(input));
  } catch (reason) {
    return {
      kind: "save-failed",
      error: queryErrorFromUnknown(reason),
    };
  }
  if (!saved.ok) return { kind: "save-failed", error: saved.error };
  if (!shouldPublish || saved.value.status !== "draft") {
    return {
      kind: "completed",
      savedArticle: saved.value,
      article: saved.value,
    };
  }

  let published: QueryResult<AdminArticle>;
  try {
    published = await startQuery(writer.publish(saved.value.id));
  } catch (reason) {
    return {
      kind: "publish-failed",
      savedArticle: saved.value,
      error: queryErrorFromUnknown(reason),
    };
  }
  if (!published.ok) {
    return {
      kind: "publish-failed",
      savedArticle: saved.value,
      error: published.error,
    };
  }
  return {
    kind: "completed",
    savedArticle: saved.value,
    article: published.value,
  };
};

export const saveAdminEditorArticle = (
  values: AdminDraftValues,
  shouldPublish: boolean,
) => executeAdminEditorSave(queryClient.draftEditor, values, shouldPublish);

export const unpublishArticle = (id: number) =>
  executeQuery(() => queryClient.draftEditor.unpublish(id as ArticleId));

export const adminQueryErrorMessage = (error: QueryError): string =>
  queryErrorMessage(error, "请求未完成，请重试");

export const adminTaxonomyErrorMessage = (error: QueryError): string =>
  error.kind;
