import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { err } from "@fluvient/core";
import { createDataTask } from "@fluvient-loom/query";
import type { TaskFailure } from "@fluvient-loom/port";
import {
  categoryShelfFromPageModule,
  navigationFromPage,
  type MobileApi,
  type CategoryShelf,
  type MobileApiFailure,
  type MobileNavigation,
} from "@blog/mobile-api";
import { type DeepReadonly } from "@fluvient/core";
import { type NavigationPort } from "@fluvient-loom/port";
import type { MobileRouteContext } from "@blog/mobile-shared";
import { useMobileResource } from "@blog/mobile-api";
import {
  categoryHref,
  categoryRequestId,
  categorySelection,
  type CategorySelection,
} from "./category.ts";
import { mobileArticlesPage } from "./definition.ts";

/**
 * 从当前 URL 读取分类筛选 id；缺失/非法 → undefined（无过滤，回退首个根分类）。
 */
function readCategoryId(search: string): number | undefined {
  const params = mobileArticlesPage.parseParams(search);
  return params.ok ? params.value.category_id : undefined;
}

export interface MobileArticlesLogicInput extends MobileRouteContext {
  readonly api: Pick<MobileApi, "page">;
  readonly navigation: NavigationPort;
}

interface MobileArticlesPayload {
  readonly data: CategoryShelf;
  readonly navigation: MobileNavigation | undefined;
}

function navigateToCategory(
  input: MobileArticlesLogicInput,
  selection: CategorySelection,
): void {
  const current = input.navigation.current();
  input.navigation.push(categoryHref(current.pathname, selection), {
    ...(typeof current.state === "object" && current.state !== null
      ? current.state
      : {}),
  });
}

export function useMobileArticles(input: MobileArticlesLogicInput) {
  const [requestedId, setRequestedId] = createSignal(
    readCategoryId(input.navigation.current().search),
  );
  const resource = useMobileResource(() =>
    createDataTask<MobileArticlesPayload, MobileApiFailure | TaskFailure>({
      async execute() {
        const categoryId = requestedId();
        const result = await input.api.page
          .get(
            "article-list",
            categoryId === undefined
              ? {}
              : { category_id: categoryId.toString() },
          )
          .start();
        if (!result.ok)
          return err({
            kind: "network" as const,
            message: "请求执行失败",
            code: undefined,
            status: undefined,
            issues: undefined,
          });
        const data = categoryShelfFromPageModule(result.value);
        if (data === undefined)
          return err({
            kind: "protocol" as const,
            message: "分类模块缺失或不符合协议",
            code: undefined,
            status: undefined,
            issues: ["modules.mobile.category-shelf"],
          });
        return {
          ok: true as const,
          value: { data, navigation: navigationFromPage(result.value) },
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
    requestedId();
    if (!started) {
      started = true;
      void resource.start();
      return;
    }
    void resource.refetch();
  });

  const current = createMemo(
    () => resource.state().snapshot?.data ?? resource.state().latest?.data,
  );
  const selection = createMemo(() => {
    const model = current();
    return model === undefined
      ? undefined
      : categorySelection(model, requestedId());
  });
  const onPopState = () =>
    setRequestedId(readCategoryId(input.navigation.current().search));
  const popHandle = input.navigation.subscribePopState(onPopState);
  onCleanup(() => popHandle.release());

  return {
    current,
    requestedId,
    resource,
    selection,
    select(next: CategorySelection) {
      setRequestedId(categoryRequestId(next));
      navigateToCategory(input, next);
    },
    retry: () => void resource.refetch(),
    navigation: () =>
      resource.state().snapshot?.navigation ??
      resource.state().latest?.navigation,
  };
}

export function rootCategoryName(
  model: DeepReadonly<CategoryShelf>,
  categoryId: number | undefined,
): string | undefined {
  if (categoryId === undefined) return undefined;
  let current = model.taxonomy.categories.find(
    (category) => category.id === categoryId,
  );
  while (current !== undefined && current.parentId !== undefined) {
    const parentId = current.parentId;
    current = model.taxonomy.categories.find(
      (category) => category.id === parentId,
    );
  }
  return current?.name;
}
