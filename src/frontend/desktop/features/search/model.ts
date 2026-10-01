import type { DesktopApi } from "../../foundation/api";
import { useDesktopResource } from "../../foundation/resource";

export function searchQuery(search: string): string {
  return new URLSearchParams(search).get("q")?.trim() ?? "";
}

export function useDesktopSearch(
  api: Pick<DesktopApi, "search">,
  query: string,
) {
  return useDesktopResource(() => api.search.get(query));
}
