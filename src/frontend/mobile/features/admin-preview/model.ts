import type { MobileApi } from "../../foundation/api";
import { useMobileResource } from "../../foundation/resource";

export function useMobileAdminPreview(
  api: Pick<MobileApi, "adminArticle">,
  id: number | undefined,
) {
  if (id === undefined) return { kind: "invalid" as const };
  const resource = useMobileResource(() => api.adminArticle.get(id));
  return {
    kind: "ready" as const,
    state: resource.state,
    retry: () => void resource.refetch(),
  };
}
