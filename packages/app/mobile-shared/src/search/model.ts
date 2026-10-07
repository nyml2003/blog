import { onMount } from "solid-js";
import { createDataTask } from "@fluvient-loom/query";
import type { TaskFailure } from "@fluvient-loom/port";
import { err } from "@fluvient/core";
import type {
  MobileApi,
  MobileApiFailure,
  ArticleSearch,
} from "@blog/mobile-api";
import { useMobileResource } from "@blog/mobile-resource";

export function useMobileSearch(input: {
  readonly api: Pick<MobileApi, "search">;
  readonly query: string;
}) {
  const resource = useMobileResource(() =>
    createDataTask<ArticleSearch, MobileApiFailure | TaskFailure>({
      async execute() {
        const result = await input.api.search.get(input.query).start();
        if (!result.ok)
          return err({
            kind: "network" as const,
            message: "搜索请求失败",
            code: undefined,
            status: undefined,
            issues: undefined,
          });
        return {
          ok: true as const,
          value: {
            ...result.value,
            items: result.value.items.map((item) => ({
              ...item,
              termIds: [...item.termIds],
              terms: [...item.terms],
            })),
          },
        };
      },
      mapRejected() {
        return {
          kind: "network" as const,
          message: "搜索请求失败",
          code: undefined,
          status: undefined,
          issues: undefined,
        };
      },
    }),
  );
  onMount(() => {
    if (input.query !== "") void resource.start();
  });
  return resource;
}
