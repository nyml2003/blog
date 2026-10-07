import { createEffect, createSignal } from "solid-js";
import { err } from "@fluvient/core";
import { createDataTask } from "@fluvient-loom/query";
import {
  tShelfFromPageModule,
  navigationFromPage,
  type MobileApi,
  type MobileApiFailure,
  type MobileNavigation,
  type TShelfInput,
} from "@blog/mobile-api";
import type { TaskFailure } from "@fluvient-loom/port";
import { useMobileResource } from "@blog/mobile-resource";
import { toTShelfModel, type TShelfModel } from "@fluvient-loom/mobile-foundation";

export interface MobileHomeLogicInput {
  readonly api: Pick<MobileApi, "page">;
}
interface MobileHomePayload {
  readonly data: TShelfModel;
  readonly navigation: MobileNavigation | undefined;
}

export function useMobileHome(input: MobileHomeLogicInput) {
  const [selection, setSelection] = createSignal<TShelfInput>({
    surface: "recommendation",
    filterId: "all",
  });
  const resource = useMobileResource(() =>
    createDataTask<MobileHomePayload, MobileApiFailure | TaskFailure>({
      async execute() {
        const result = await input.api.page
          .get("home", {
            surface: selection().surface,
            filter_id: selection().filterId,
          })
          .start();
        if (!result.ok)
          return err({
            kind: "network" as const,
            message: "请求执行失败",
            code: undefined,
            status: undefined,
            issues: undefined,
          });
        const data = tShelfFromPageModule(result.value);
        if (data === undefined)
          return err({
            kind: "protocol" as const,
            message: "推荐模块缺失或不符合协议",
            code: undefined,
            status: undefined,
            issues: ["modules.mobile.t-shelf"],
          });
        return {
          ok: true as const,
          value: { data: toTShelfModel(data), navigation: navigationFromPage(result.value) },
        };
      },
      mapRejected() {
        return {
          kind: "network" as const,
          message: "请求执行失败",
          code: undefined,
          status: undefined,
          issues: undefined,
        };
      },
    }),
  );
  let started = false;

  createEffect(() => {
    selection();
    if (!started) {
      started = true;
      void resource.start();
      return;
    }
    void resource.refetch();
  });

  return {
    selection,
    selectFilter(filterId: string) {
      setSelection({ surface: "recommendation", filterId });
    },
    resource,
    snapshot: () =>
      resource.state().snapshot?.data ?? resource.state().latest?.data,
    navigation: () =>
      resource.state().snapshot?.navigation ??
      resource.state().latest?.navigation,
    retry: () => void resource.refetch(),
  };
}
