import type { Accessor } from "solid-js";
import type {
  AdminSessionLoginInput,
  ContentArticleDetail,
  ContentArticleRemoveInput,
  ContentArticleSaveInput,
  ContentArticleSaveResult,
  ContentSyncStatus,
  ContentTaxonomy,
  ContentWorkspace,
  ContentWorkspaceArticle,
} from "../../common/client";
import type { HtmlInspection } from "../../common/validation/article-html";
import { createDataTask } from "../../common/data/task";
export {
  ADMIN_SESSION_EXPIRED_EVENT,
  adminNextFromSearch,
} from "../../common/client";
export type {
  AdminSessionVerification,
  ContentArticle,
  ContentArticleDetail,
  ContentArticleList,
  ContentArticleSaveResult,
  ContentPreview,
  ContentSyncStatus,
  ContentTaxonomy,
  ContentWorkspace,
  ContentWorkspaceStatus,
} from "../../common/client";
import type { ArticleType, Term } from "../../common/contracts/domain";
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
export type ContentEditorValues = {
  readonly id: number;
  readonly title: string;
  readonly summary: string;
  readonly categoryIds: readonly number[];
  readonly tagIds: readonly number[];
  readonly contentHtml: string;
};

export type ContentArticleWriter = {
  readonly saveArticle: (
    input: ContentArticleSaveInput,
  ) => QueryTask<ContentArticleSaveResult>;
};

export type ContentArticleRemover = {
  readonly removeArticle: (
    input: ContentArticleRemoveInput,
  ) => QueryTask<ContentWorkspace>;
};

export const unicodeScalarLength = (value: string): number =>
  Array.from(value).length;

export const limitUnicodeScalars = (value: string, limit: number): string =>
  Array.from(value).slice(0, limit).join("");

export const contentAnalysisArticleIds = (
  selectedIds: readonly number[],
  articles: readonly ContentWorkspaceArticle[],
): readonly number[] => {
  if (selectedIds.length > 0) return selectedIds;
  return articles.map((article) => article.id);
};

export const useAdminArticle = (rawId: Accessor<string | null | undefined>) =>
  useDataResource(rawId, (value) =>
    taskForArticleId(value, (id) => queryClient.adminArticles.get(id)),
  );

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

export const loginAdminSession = (input: AdminSessionLoginInput) =>
  executeQuery(() => queryClient.adminSession.login(input));

export const logoutAdminSession = () =>
  executeQuery(() => queryClient.adminSession.logout());

export const useContentWorkspace = () =>
  useDataResource(
    () => undefined,
    () => queryClient.contentTaxonomy.getWorkspace(),
  );

export const useContentSyncStatus = () =>
  useDataResource<ContentSyncStatus, undefined>(
    () => undefined,
    () => queryClient.contentTaxonomy.getSyncStatus(),
  );

export const useContentArticles = () =>
  useDataResource(
    () => undefined,
    () => queryClient.contentTaxonomy.listArticles(),
  );

export const useContentArticle = (rawId: Accessor<string | null | undefined>) =>
  useDataResource<ContentArticleDetail | undefined, string | null | undefined>(
    rawId,
    (value) => {
      if (value === null || value === undefined || value === "") {
        return createDataTask(async () => ({ ok: true, value: undefined }));
      }
      return taskForArticleId(value, (id) =>
        queryClient.contentTaxonomy.getArticle(Number(id)),
      );
    },
  );

export const saveContentTaxonomy = (
  expectedVersion: number,
  taxonomy: ContentTaxonomy,
) =>
  executeQuery(() =>
    queryClient.contentTaxonomy.save({ expectedVersion, taxonomy }),
  );

export const analyzeContentTaxonomy = (
  expectedVersion: number,
  articleIds: readonly number[],
) =>
  executeQuery(() =>
    queryClient.contentTaxonomy.analyze({ expectedVersion, articleIds }),
  );

export const reviewContentTaxonomy = (expectedVersion: number) =>
  executeQuery(() => queryClient.contentTaxonomy.review({ expectedVersion }));

export const previewContentTaxonomy = () =>
  executeQuery(() => queryClient.contentTaxonomy.preview());

export const submitContentTaxonomy = (expectedVersion: number) =>
  executeQuery(() => queryClient.contentTaxonomy.submit({ expectedVersion }));

export const abandonContentTaxonomy = (expectedVersion: number) =>
  executeQuery(() => queryClient.contentTaxonomy.abandon({ expectedVersion }));

export const synchronizeContent = () =>
  executeQuery(() => queryClient.contentTaxonomy.synchronize());

export const getContentSyncStatus = () =>
  executeQuery(() => queryClient.contentTaxonomy.getSyncStatus());

const invalidArticleError = (): QueryError => ({
  kind: "protocol",
  message: "请填写文章标题",
});

const invalidSummaryError = (): QueryError => ({
  kind: "protocol",
  message: "摘要不能超过 160 个 Unicode 字符",
});

const pendingInspectionError = (): QueryError => ({
  kind: "protocol",
  message: "正文 HTML 仍在校验，请稍候再保存",
});

const invalidHtmlError = (
  inspection: QueryReadonly<HtmlInspection>,
): QueryError => ({
  kind: "html-validation",
  message: "正文 HTML 校验未通过，请修正后再保存",
  htmlInspection: inspection,
});

export const executeContentArticleSave = async (
  writer: ContentArticleWriter,
  expectedVersion: number,
  values: ContentEditorValues,
  inspection: QueryReadonly<HtmlInspection> | undefined,
): Promise<QueryResult<ContentArticleSaveResult>> => {
  if (values.title.trim() === "") {
    return { ok: false, error: invalidArticleError() };
  }
  if (unicodeScalarLength(values.summary.trim()) > 160) {
    return { ok: false, error: invalidSummaryError() };
  }
  if (inspection === undefined) {
    return { ok: false, error: pendingInspectionError() };
  }
  if (!inspection.valid) {
    return { ok: false, error: invalidHtmlError(inspection) };
  }

  const article = {
    title: values.title.trim(),
    summary: values.summary.trim(),
    categoryIds: values.categoryIds,
    tagIds: values.tagIds,
    contentHtml: values.contentHtml,
  };
  const input: ContentArticleSaveInput =
    values.id > 0
      ? {
          kind: "update",
          expectedVersion,
          article: { ...article, id: values.id },
        }
      : { kind: "create", expectedVersion, article };
  try {
    return await startQuery(writer.saveArticle(input));
  } catch (reason) {
    return { ok: false, error: queryErrorFromUnknown(reason) };
  }
};

export const saveContentArticle = (
  expectedVersion: number,
  values: ContentEditorValues,
  inspection: QueryReadonly<HtmlInspection> | undefined,
) =>
  executeContentArticleSave(
    queryClient.contentTaxonomy,
    expectedVersion,
    values,
    inspection,
  );

export const executeContentArticleRemoval = async (
  remover: ContentArticleRemover,
  expectedVersion: number,
  articleId: number,
  confirmRemoval: () => boolean,
): Promise<QueryResult<ContentWorkspace> | undefined> => {
  if (!confirmRemoval()) return undefined;
  return startQuery(remover.removeArticle({ expectedVersion, articleId }));
};

export const stageContentArticleRemoval = (
  expectedVersion: number,
  articleId: number,
  confirmRemoval: () => boolean,
) =>
  executeContentArticleRemoval(
    queryClient.contentTaxonomy,
    expectedVersion,
    articleId,
    confirmRemoval,
  );

export const adminQueryErrorMessage = (error: QueryError): string => {
  if (error.kind === "remote" && error.code === "WORKSPACE_VERSION_CONFLICT") {
    return "工作区版本已变化。当前输入已保留，请刷新后重新应用修改。";
  }
  return queryErrorMessage(error, "请求未完成，请重试");
};

export const adminTaxonomyErrorMessage = (error: QueryError): string =>
  error.kind;
