import type { MobileApi } from "@blog/mobile-api";
import { useMobileResource } from "@blog/mobile-api";

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
