import { err } from "@fluvient/core";
import type {
  DocumentPort,
  NavigationPort,
  PersistencePort,
  TaskFailure,
} from "@fluvient-loom/port";
import { createDataTask } from "@fluvient-loom/query";
import { onMount } from "solid-js";
import type {
  MobileApiFailure,
  MobileArticle,
  MobileNavigation,
} from "../../foundation/api";
import {
  articleFromPageModule,
  type MobileApi,
  navigationFromModule,
} from "../../foundation/api";
import type { MobileRouteContext } from "../../foundation/context";
import { useMobileResource } from "../../foundation/resource";

export interface MobileDetailInput {
  readonly id: number | undefined;
  readonly api: Pick<MobileApi, "page">;
  readonly articleListHref: string;
  readonly onBack: () => void;
  readonly context: MobileRouteContext;
  readonly navigation: NavigationPort;
  readonly persistence: PersistencePort;
  readonly document: DocumentPort;
  readonly share: (url: string) => Promise<void>;
  readonly onAppShellReady: () => void;
}

export interface MobileDetailPayload {
  readonly article: MobileArticle;
  readonly navigation: MobileNavigation | undefined;
}

export function useMobileDetail(input: MobileDetailInput) {
  if (input.id === undefined) {
    return { kind: "invalid" as const, ...input };
  }

  const id = input.id;
  const resource = useMobileResource(() =>
    createDataTask<MobileDetailPayload, MobileApiFailure | TaskFailure>({
      async execute() {
        const result = await input.api.page
          .get("article-detail", { id: id.toString() })
          .start();
        if (!result.ok) {
          return err({
            kind: "network" as const,
            message: "请求执行失败",
            code: undefined,
            status: undefined,
            issues: undefined,
          });
        }
        const article = articleFromPageModule(result.value);
        if (article === undefined) {
          return err({
            kind: "protocol" as const,
            message: "文章详情模块缺失或不符合协议",
            code: undefined,
            status: undefined,
            issues: ["modules.mobile.article-detail"],
          });
        }
        return {
          ok: true as const,
          value: {
            article,
            navigation: navigationFromModule(
              result.value.modules.find(
                (module) => module.moduleKey === "mobile.navigation",
              ),
            ),
          },
        };
      },
      mapRejected(cause) {
        return {
          kind: "network" as const,
          message: cause instanceof Error ? cause.message : "请求执行失败",
          code: undefined,
          status: undefined,
          issues: undefined,
        };
      },
    }),
  );
  onMount(() => void resource.start());
  return {
    kind: "ready" as const,
    articleListHref: input.articleListHref,
    onBack: input.onBack,
    state: resource.state,
    retry: () => void resource.refetch(),
  };
}
