import type { Term } from "../../common/client";
import { queryClient, useDataResource } from "./core";

/**
 * 公开分类数据查询（A 形态：多导出、成员彼此独立）：
 * 文章类型、标签，以及浏览页的组合视图。
 */

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

export const usePublicBrowseTaxonomy = () => {
  const types = usePublicArticleTypes();
  const terms = usePublicTerms();
  const termsOfKind = (kind: Term["kind"]) =>
    (terms.snapshot() ?? []).filter((term) => term.kind === kind);
  return {
    types: () => types.snapshot() ?? [],
    topics: () => termsOfKind("topic"),
    tags: () => termsOfKind("tag"),
    failed: () => types.error() !== undefined || terms.error() !== undefined,
    retry: () => Promise.all([types.refetch(), terms.refetch()]),
  };
};
