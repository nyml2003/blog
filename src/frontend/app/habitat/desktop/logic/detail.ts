import type { DesktopApi } from "../../api/desktop";
import { useDesktopResource } from "../resource";

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
