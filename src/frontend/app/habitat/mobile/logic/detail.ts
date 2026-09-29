import { onMount } from "solid-js";
import type { MobileApi } from "../../api/mobile";
import { useMobileResource } from "../resource";

export interface MobileDetailInput {
  readonly id: number | undefined;
  readonly api: Pick<MobileApi, "article">;
  readonly articleListHref: string;
  readonly onBack: (event: MouseEvent) => void;
}

export function useMobileDetail(input: MobileDetailInput) {
  if (input.id === undefined) {
    return { kind: "invalid" as const, ...input };
  }

  const id = input.id;
  const resource = useMobileResource(() => input.api.article.getPublished(id));
  onMount(() => void resource.start());
  return {
    kind: "ready" as const,
    articleListHref: input.articleListHref,
    onBack: input.onBack,
    state: resource.state,
    retry: () => void resource.refetch(),
  };
}
