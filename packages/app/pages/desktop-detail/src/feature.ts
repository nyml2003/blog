import type { DesktopApi } from "@blog/desktop-api";
import { useDesktopResource } from "@blog/desktop-api";

export function useDesktopArticle(
  api: Pick<DesktopApi, "article">,
  id: number | undefined,
) {
  if (id === undefined) return { kind: "invalid" as const };
  return {
    kind: "ready" as const,
    resource: useDesktopResource(() => api.article.getPublished(id)),
  };
}
