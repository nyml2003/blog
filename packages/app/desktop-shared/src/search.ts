import type { DesktopApi } from "@blog/desktop-api";
import { useDesktopResource } from "@blog/desktop-api";

export function useDesktopSearch(
  api: Pick<DesktopApi, "search">,
  query: string,
) {
  return useDesktopResource(() => api.search.get(query));
}
