import { positiveIdFromSearch } from "../route-input";

export function categoryIdFromSearch(search: string): number | undefined {
  return positiveIdFromSearch(search, "category_id");
}
