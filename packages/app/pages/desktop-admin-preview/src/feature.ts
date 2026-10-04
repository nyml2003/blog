import type { DesktopApi } from "@blog/desktop-api";
import { useDesktopResource } from "@blog/desktop-api";

export function useDesktopAdminPreview(
  api: Pick<DesktopApi, "adminArticle">,
  id: number | undefined,
) {
  if (id === undefined) return { kind: "invalid" as const };
  const resource = useDesktopResource(() => api.adminArticle.get(id));
  return {
    kind: "ready" as const,
    state: resource.state,
    retry: () => void resource.reload(),
  };
}
