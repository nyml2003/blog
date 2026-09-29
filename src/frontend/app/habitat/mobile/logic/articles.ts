import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { MobileApi, CategoryShelf } from "../../api/mobile";
import type { DeepReadonly, NavigationPort } from "../../../kernel";
import type { MobileRouteContext } from "../context";
import { useMobileResource } from "../resource";
import {
  categoryHref,
  categoryIdFromSearch,
  categoryRequestId,
  categorySelection,
  type CategorySelection,
} from "./category";

export interface MobileArticlesLogicInput extends MobileRouteContext {
  readonly api: Pick<MobileApi, "categoryShelf">;
  readonly navigation: NavigationPort;
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
    categoryIdFromSearch(input.navigation.current().search),
  );
  const resource = useMobileResource(() =>
    input.api.categoryShelf.get(requestedId()),
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
    () => resource.state().snapshot ?? resource.state().latest,
  );
  const selection = createMemo(() => {
    const model = current();
    return model === undefined
      ? undefined
      : categorySelection(model, requestedId());
  });
  const onPopState = () =>
    setRequestedId(categoryIdFromSearch(input.navigation.current().search));
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
