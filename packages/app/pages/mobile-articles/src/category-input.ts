import { positiveIdFromSearch } from "@blog/route-input";

export function categoryIdFromSearch(search: string): number | undefined {
  return positiveIdFromSearch(search, "category_id");
}
