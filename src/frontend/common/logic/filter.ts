import { type ArticleFilter, emptyFilter } from "../contracts/domain";

export function filterFromSearch(search: string): ArticleFilter {
  const query = new URLSearchParams(search);
  const filter = emptyFilter();
  filter.termIds = query.get("term_ids")?.split(",").filter(Boolean) ?? [];
  filter.typeId = query.get("type_id") ?? "";
  filter.createdFrom = query.get("created_from") ?? "";
  filter.createdTo = query.get("created_to") ?? "";
  filter.updatedFrom = query.get("updated_from") ?? "";
  filter.updatedTo = query.get("updated_to") ?? "";
  return filter;
}

export function filterSearch(
  filter: ArticleFilter,
  includeScene = true,
): URLSearchParams {
  const query = new URLSearchParams();
  if (includeScene) {
    query.set("sceneCode", "public.article_list");
    query.set("page", "1");
    query.set("pageSize", "20");
  }
  if (filter.termIds.length) query.set("term_ids", filter.termIds.join(","));
  if (filter.typeId) query.set("type_id", filter.typeId);
  if (filter.createdFrom) query.set("created_from", filter.createdFrom);
  if (filter.createdTo) query.set("created_to", filter.createdTo);
  if (filter.updatedFrom) query.set("updated_from", filter.updatedFrom);
  if (filter.updatedTo) query.set("updated_to", filter.updatedTo);
  return query;
}
