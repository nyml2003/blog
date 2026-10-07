import type { CategoryShelf, TShelf } from "@blog/mobile-api";
import type { DeepReadonly } from "@fluvient/core";

export interface TShelfModel {
  readonly filters: DeepReadonly<TShelf["filters"]>;
  readonly selectedFilterId: string;
  readonly articles: DeepReadonly<TShelf["articles"]>;
  readonly total: number;
}

export interface FShelfCategory {
  readonly id: number;
  readonly name: string;
  readonly parentId?: number;
  readonly position: number;
}

export interface FShelfRoot extends FShelfCategory {
  readonly children: readonly FShelfCategory[];
}

export interface FShelfModel {
  readonly roots: readonly FShelfRoot[];
  readonly categories: readonly FShelfCategory[];
  readonly selectedCategoryId?: number;
  readonly articles: DeepReadonly<CategoryShelf["articles"]>;
  readonly total: number;
}

export interface FShelfSelection {
  readonly rootId: number;
  readonly childId: number | undefined;
}

export function toTShelfModel(source: DeepReadonly<TShelf>): TShelfModel {
  return {
    filters: source.filters,
    selectedFilterId: source.selectedFilterId,
    articles: source.articles,
    total: source.total,
  };
}

export function toFShelfModel(source: DeepReadonly<CategoryShelf>): FShelfModel {
  const categories = source.taxonomy.categories.map((category) => ({
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    position: category.position,
  }));
  const byParent = new Map<number | undefined, FShelfCategory[]>();
  for (const category of categories) {
    const siblings = byParent.get(category.parentId) ?? [];
    siblings.push(category);
    byParent.set(category.parentId, siblings);
  }
  const ordered = (items: readonly FShelfCategory[]) =>
    [...items].sort((left, right) => left.position - right.position || left.id - right.id);
  const roots = ordered(byParent.get(undefined) ?? []).map((root) => ({
    ...root,
    children: ordered(byParent.get(root.id) ?? []),
  }));
  return {
    roots,
    categories,
    selectedCategoryId: source.selectedCategoryId,
    articles: source.articles,
    total: source.total,
  };
}

export function fshelfSelection(
  model: Pick<FShelfModel, "roots" | "categories">,
  requestedCategoryId: number | undefined,
): FShelfSelection | undefined {
  const first = model.roots[0];
  if (first === undefined) return undefined;
  if (requestedCategoryId === undefined) return { rootId: first.id, childId: undefined };
  const byId = new Map(model.categories.map((category) => [category.id, category]));
  let current = byId.get(requestedCategoryId);
  if (current === undefined) return { rootId: first.id, childId: undefined };
  let childId: number | undefined;
  const visited = new Set<number>();
  while (current.parentId !== undefined && !visited.has(current.id)) {
    visited.add(current.id);
    childId = current.id;
    current = byId.get(current.parentId);
    if (current === undefined) return { rootId: first.id, childId: undefined };
  }
  return current.parentId === undefined
    ? { rootId: current.id, childId }
    : { rootId: first.id, childId: undefined };
}

export function fshelfRequestId(selection: FShelfSelection): number {
  return selection.childId ?? selection.rootId;
}
