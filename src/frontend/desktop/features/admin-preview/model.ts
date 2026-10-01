import type { DesktopApi } from "../../foundation/api";
import { useDesktopResource } from "../../foundation/resource";

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
