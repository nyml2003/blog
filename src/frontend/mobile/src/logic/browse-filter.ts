/**
 * 平铺页（/m/articles/list.html）三级单选筛选模型。
 *
 * 只负责「URL 字符串 ↔ 模型」与级联规则；`history.pushState` / `replaceState`
 * 由页面层调用。维度之间是 AND，全部单选，term 以 id 表达，「全部」用
 * `undefined` 表达。页码不进 URL：任一选择变化后由页面回到 `firstBrowsePage`。
 */

export type BrowseFilter = {
  readonly typeId?: number;
  readonly topicId?: number;
  readonly tagId?: number;
};

export type BrowseFilterLevel = "type" | "topic" | "tag";

export const browseFilterLevels = [
  "type",
  "topic",
  "tag",
] as const satisfies readonly BrowseFilterLevel[];

/** 「全部」在 TabGroup / ChipGroup 里占用的保留 id。 */
export const browseAllLevelId = "";

/** 任一选择变化后列表回到的第 1 页（页码不进 URL）。 */
export const firstBrowsePage = 1;

/**
 * 「加载更多」要请求的下一页：第 1 页由列表资源加载，其后每追加一页就再往后一页。
 */
export function nextBrowsePage(appendedPageCount: number): number {
  return firstBrowsePage + appendedPageCount + 1;
}

/** 公开端已下线的旧筛选参数：出现在 URL 时剔除（SPEC 场景 005）。 */
const legacyQueryKeys = [
  "created_from",
  "created_to",
  "updated_from",
  "updated_to",
] as const;

const levelQueryKeys: Record<BrowseFilterLevel, string> = {
  type: "type",
  topic: "topic",
  tag: "tag",
};

/** 只有「正整数」形态才算 id，其余（含 `0`、`-2`、`2.5`、`12px`）视为「全部」。 */
const positiveIdPattern = /^[0-9]+$/;

const parseLevelId = (raw: string | null): number | undefined => {
  if (raw === null || !positiveIdPattern.test(raw)) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return parsed > 0 && Number.isSafeInteger(parsed) ? parsed : undefined;
};

const filterLevelId = (
  filter: BrowseFilter,
  level: BrowseFilterLevel,
): number | undefined => {
  if (level === "type") return filter.typeId;
  if (level === "topic") return filter.topicId;
  return filter.tagId;
};

const withLevelId = (
  filter: BrowseFilter,
  level: BrowseFilterLevel,
  id: number | undefined,
): BrowseFilter => {
  if (level === "type")
    return { typeId: id, topicId: filter.topicId, tagId: filter.tagId };
  if (level === "topic")
    return { typeId: filter.typeId, topicId: id, tagId: filter.tagId };
  return { typeId: filter.typeId, topicId: filter.topicId, tagId: id };
};

/**
 * 归一化：省略 `undefined` 字段，并执行级联规则——主题回到「全部」时标签一并
 * 清除（L3 仅在具体主题选中时存在）。
 */
const normalizeFilter = (filter: BrowseFilter): BrowseFilter => {
  const normalized: {
    typeId?: number;
    topicId?: number;
    tagId?: number;
  } = {};
  if (filter.typeId !== undefined) normalized.typeId = filter.typeId;
  if (filter.topicId === undefined) return normalized;
  normalized.topicId = filter.topicId;
  if (filter.tagId !== undefined) normalized.tagId = filter.tagId;
  return normalized;
};

/** 解析 `location.search`（可带或不带前导 `?`）；非法参数按容错处理。 */
export function browseFilterFromSearch(search: string): BrowseFilter {
  const query = new URLSearchParams(search);
  return normalizeFilter({
    typeId: parseLevelId(query.get(levelQueryKeys.type)),
    topicId: parseLevelId(query.get(levelQueryKeys.topic)),
    tagId: parseLevelId(query.get(levelQueryKeys.tag)),
  });
}

/**
 * 以 `filter` 覆盖三个筛选键、剔除旧日期参数后返回 query 字符串（可能为空）。
 * 其余与本页无关的 query（例如 dev 环境注入的调试参数）原样保留。
 */
export function browseSearchWithFilter(
  search: string,
  filter: BrowseFilter,
): string {
  const query = new URLSearchParams(search);
  for (const key of legacyQueryKeys) query.delete(key);
  for (const level of browseFilterLevels) {
    const id = filterLevelId(filter, level);
    if (id === undefined) query.delete(levelQueryKeys[level]);
    else query.set(levelQueryKeys[level], String(id));
  }
  return query.toString();
}

/** 打开页面时的清理：旧日期参数被忽略并产出可直接 `replaceState` 的 query。 */
export function cleanBrowseSearch(search: string): string {
  return browseSearchWithFilter(search, browseFilterFromSearch(search));
}

/** 首帧清理后的入口地址：无参数时不带 `?`，供货架页与平铺页共用。 */
export function cleanBrowseHref(pathname: string, search: string): string {
  const query = cleanBrowseSearch(search);
  return query === "" ? pathname : `${pathname}?${query}`;
}

/**
 * 选择某一级。`levelId` 是 TabGroup / ChipGroup 的条目 id（`browseAllLevelId`
 * 表示「全部」）；未知形态按容错落到「全部」。
 */
export function selectBrowseFilter(
  filter: BrowseFilter,
  level: BrowseFilterLevel,
  levelId: string,
): BrowseFilter {
  const id = levelId === browseAllLevelId ? undefined : parseLevelId(levelId);
  return normalizeFilter(withLevelId(filter, level, id));
}

/** 反向映射：给出某一层在 TabGroup / ChipGroup 中应选中的条目 id。 */
export function browseSelectedLevelId(
  filter: BrowseFilter,
  level: BrowseFilterLevel,
): string {
  const id = filterLevelId(filter, level);
  return id === undefined ? browseAllLevelId : String(id);
}

export function browseFiltersEqual(
  left: BrowseFilter,
  right: BrowseFilter,
): boolean {
  return (
    left.typeId === right.typeId &&
    left.topicId === right.topicId &&
    left.tagId === right.tagId
  );
}

/** 生成可分享 / 可后退的入口地址；`baseSearch` 里的非筛选参数原样保留。 */
export function browseHref(
  pathname: string,
  filter: BrowseFilter,
  baseSearch: string,
): string {
  const search = browseSearchWithFilter(baseSearch, filter);
  return search === "" ? pathname : `${pathname}?${search}`;
}
