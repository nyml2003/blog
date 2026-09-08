import type {
  Category,
  CategoryShelfArticle,
  ContentTaxonomy,
} from "../../../common/client";

export type CategoryNode = Category;
export type CategoryTree = ContentTaxonomy;
export type CategoryShelfCard = CategoryShelfArticle;

export const allChildCategoriesId = "all";

const categoryOrder = (left: Category, right: Category): number =>
  left.position - right.position || left.id - right.id;

export const rootCategories = (
  taxonomy: ContentTaxonomy,
): readonly Category[] =>
  taxonomy.categories
    .filter((category) => category.parentId === undefined)
    .slice()
    .sort(categoryOrder);

export const childCategories = (
  taxonomy: ContentTaxonomy,
  parentId: number,
): readonly Category[] =>
  taxonomy.categories
    .filter((category) => category.parentId === parentId)
    .slice()
    .sort(categoryOrder);

const categoryById = (
  taxonomy: ContentTaxonomy,
  categoryId: number,
): Category | undefined =>
  taxonomy.categories.find((category) => category.id === categoryId);

export type CategorySelection = {
  readonly rootId: number;
  readonly childId: number | undefined;
};

export const categorySelection = (
  taxonomy: ContentTaxonomy,
  requestedId: number | undefined,
): CategorySelection | undefined => {
  const roots = rootCategories(taxonomy);
  if (roots.length === 0) return undefined;
  if (requestedId === undefined) {
    return { rootId: roots[0].id, childId: undefined };
  }

  let current = categoryById(taxonomy, requestedId);
  if (current === undefined) {
    return { rootId: roots[0].id, childId: undefined };
  }
  let childId: number | undefined;
  const visited = new Set<number>();
  while (current.parentId !== undefined && !visited.has(current.id)) {
    visited.add(current.id);
    childId = current.id;
    const parent = categoryById(taxonomy, current.parentId);
    if (parent === undefined) {
      return { rootId: roots[0].id, childId: undefined };
    }
    current = parent;
  }
  if (current.parentId !== undefined) {
    return { rootId: roots[0].id, childId: undefined };
  }
  return { rootId: current.id, childId };
};

export const categoryRequestId = (selection: CategorySelection): number =>
  selection.childId ?? selection.rootId;

export const categoryIdFromSearch = (search: string): number | undefined => {
  const value = new URLSearchParams(search).get("category_id");
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const categoryId = Number(value);
  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) return undefined;
  return categoryId;
};

export const categorySearch = (categoryId: number): string =>
  `?${new URLSearchParams({ category_id: String(categoryId) })}`;

export type CategoryNavigationPort = {
  readonly persistCurrent: () => void;
  readonly setRequested: (categoryId: number) => void;
  readonly push: (href: string) => void;
  readonly replace: (href: string) => void;
};

export const navigateCategory = (
  pathname: string,
  selection: CategorySelection,
  replace: boolean,
  port: CategoryNavigationPort,
): void => {
  const categoryId = categoryRequestId(selection);
  const href = `${pathname}${categorySearch(categoryId)}`;
  if (replace) {
    port.setRequested(categoryId);
    port.replace(href);
    return;
  }
  port.persistCurrent();
  port.setRequested(categoryId);
  port.push(href);
};

export const mobileArticleShelfStateKey = "mobileArticleShelf";

export type MobileArticleShelfHistory = {
  readonly sectionId: string;
  readonly scrollY: number;
};

export const mobileArticleShelfHistory = (
  state: unknown,
): MobileArticleShelfHistory | undefined => {
  if (typeof state !== "object" || state === null) return undefined;
  const snapshot = Reflect.get(state, mobileArticleShelfStateKey);
  if (typeof snapshot !== "object" || snapshot === null) return undefined;
  const sectionId = Reflect.get(snapshot, "sectionId");
  const scrollY = Reflect.get(snapshot, "scrollY");
  if (typeof sectionId !== "string" || sectionId === "") return undefined;
  if (typeof scrollY !== "number" || !Number.isFinite(scrollY) || scrollY < 0) {
    return undefined;
  }
  return { sectionId, scrollY };
};

export type CategoryPopPort = {
  readonly setPendingHistory: (
    snapshot: MobileArticleShelfHistory | undefined,
  ) => void;
  readonly setRequested: (categoryId: number | undefined) => void;
};

export const restoreCategoryPop = (
  search: string,
  state: unknown,
  port: CategoryPopPort,
): MobileArticleShelfHistory | undefined => {
  const snapshot = mobileArticleShelfHistory(state);
  port.setPendingHistory(snapshot);
  port.setRequested(categoryIdFromSearch(search));
  return snapshot;
};

export const categoryScrollRestoreReady = (
  loading: boolean,
  requestedCategoryId: number | undefined,
  responseCategoryId: number | undefined,
  pending: MobileArticleShelfHistory | undefined,
): boolean => {
  if (loading || pending === undefined || requestedCategoryId === undefined) {
    return false;
  }
  return (
    pending.sectionId === String(requestedCategoryId) &&
    responseCategoryId === requestedCategoryId
  );
};

export type CategoryScrollRestorePort = {
  readonly frame: (callback: () => void) => void;
  readonly task: (callback: () => void) => void;
  readonly scroll: (scrollY: number) => void;
  readonly release: () => void;
};

export const scheduleCategoryScrollRestore = (
  scrollY: number,
  port: CategoryScrollRestorePort,
): void => {
  port.frame(() => {
    port.frame(() => {
      port.scroll(scrollY);
      port.task(() => {
        port.scroll(scrollY);
        port.release();
      });
    });
  });
};
