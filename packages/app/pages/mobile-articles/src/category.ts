import type { CategoryShelf } from "@blog/mobile-api";
import { type DeepReadonly } from "@fluvient/core";

export interface CategorySelection {
  readonly rootId: number;
  readonly childId: number | undefined;
}

export function categorySelection(
  model: DeepReadonly<CategoryShelf>,
  requestedId: number | undefined,
): CategorySelection | undefined {
  // The API validates field shapes, but does not yet certify the taxonomy as
  // a rooted forest. Keep these fallbacks until that boundary invariant exists.
  const roots = model.taxonomy.categories
    .filter((category) => category.parentId === undefined)
    .sort(
      (left, right) => left.position - right.position || left.id - right.id,
    );
  if (roots.length === 0) return undefined;
  if (requestedId === undefined)
    return { rootId: roots[0].id, childId: undefined };
  const byId = new Map(
    model.taxonomy.categories.map((category) => [category.id, category]),
  );
  let current = byId.get(requestedId);
  if (current === undefined) return { rootId: roots[0].id, childId: undefined };
  let childId: number | undefined;
  const visited = new Set<number>();
  while (current.parentId !== undefined && !visited.has(current.id)) {
    visited.add(current.id);
    childId = current.id;
    const parent = byId.get(current.parentId);
    if (parent === undefined)
      return { rootId: roots[0].id, childId: undefined };
    current = parent;
  }
  if (current.parentId !== undefined)
    return { rootId: roots[0].id, childId: undefined };
  return { rootId: current.id, childId };
}

export function categoryRequestId(selection: CategorySelection): number {
  return selection.childId ?? selection.rootId;
}

export function categoryHref(
  pathname: string,
  selection: CategorySelection,
): string {
  const params = new URLSearchParams({
    category_id: String(categoryRequestId(selection)),
  });
  return `${pathname}?${params}`;
}
