import type { CategoryShelf } from "@blog/mobile-api";
import type { DeepReadonly } from "@fluvient/core";
import { fshelfSelection, toFShelfModel, type FShelfModel } from "./shelf.ts";

export interface CategorySelection { readonly rootId: number; readonly childId: number | undefined; }

export function categorySelection(model: DeepReadonly<CategoryShelf> | FShelfModel, requestedId: number | undefined): CategorySelection | undefined {
  const normalized = "taxonomy" in model ? toFShelfModel(model) : model;
  return fshelfSelection(normalized, requestedId);
}

export function categoryRequestId(selection: CategorySelection): number { return selection.childId ?? selection.rootId; }

export function categoryHref(pathname: string, selection: CategorySelection): string {
  return `${pathname}?category_id=${encodeURIComponent(String(categoryRequestId(selection)))}`;
}
