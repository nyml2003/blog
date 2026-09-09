import {
  createRenderEffect,
  createSignal,
  onCleanup,
  type Accessor,
} from "solid-js";
import type {
  CategoryShelf,
  CategoryShelfInput,
  TShelf,
  TShelfFilter,
  TShelfInput,
} from "../../common/client";
import {
  createDataResource,
  type DataResource,
} from "../../common/data/resource";
import {
  queryClient,
  type QueryResult,
  type QueryTask,
  useDataResource,
} from "./core";

/**
 * 货架领域查询（A 形态：多导出、成员彼此独立）：
 * Desktop T 型货架、Mobile 文章货架与分类货架。
 */

export type { TShelf, TShelfArticle, TShelfFilter } from "../../common/client";
export type { CategoryShelf } from "../../common/client";

export type TShelfSelection = TShelfInput;
export type TShelfLoader = (selection: TShelfSelection) => QueryTask<TShelf>;

export type TShelfResource = {
  readonly getSnapshot: DataResource<TShelf>["getSnapshot"];
  readonly subscribe: DataResource<TShelf>["subscribe"];
  readonly filters: () => readonly TShelfFilter[];
  readonly start: () => Promise<QueryResult<TShelf>>;
  readonly select: (selection: TShelfSelection) => Promise<QueryResult<TShelf>>;
  readonly refetch: () => Promise<QueryResult<TShelf>>;
  readonly cancel: () => void;
};

export const createTShelfResource = (
  load: TShelfLoader,
  initialSelection: TShelfSelection,
): TShelfResource => {
  let selection = initialSelection;
  const resource = createDataResource(() => load(selection));
  return {
    getSnapshot: resource.getSnapshot,
    subscribe: resource.subscribe,
    filters: () =>
      resource.getSnapshot().snapshot?.filters ??
      resource.getSnapshot().latest?.filters ??
      [],
    start: resource.start,
    select: (nextSelection) => {
      selection = nextSelection;
      return resource.refetch();
    },
    refetch: resource.refetch,
    cancel: resource.cancel,
  };
};

export type CategoryShelfLoader = (
  selection: CategoryShelfInput,
) => QueryTask<CategoryShelf>;

export const createCategoryShelfResource = (load: CategoryShelfLoader) => {
  let selection: CategoryShelfInput = {};
  const resource = createDataResource(() => load(selection));
  return {
    getSnapshot: resource.getSnapshot,
    subscribe: resource.subscribe,
    start: resource.start,
    select: (nextSelection: CategoryShelfInput) => {
      selection = nextSelection;
      return resource.refetch();
    },
    refetch: resource.refetch,
    cancel: resource.cancel,
  };
};

export const tShelfFilterFromSearch = (search: string): string => {
  const rawId = new URLSearchParams(search).get("type_id");
  if (rawId === null || !/^\d+$/.test(rawId)) return "all";
  const id = Number(rawId);
  return Number.isSafeInteger(id) && id > 0 ? String(id) : "all";
};

export const tShelfSearch = (filterId: string): string => {
  if (filterId === "all") return "";
  const search = new URLSearchParams({ type_id: filterId });
  return `?${search}`;
};

export const createTShelfQuery = (load: TShelfLoader) =>
  function useTShelfQuery(selection: Accessor<TShelfSelection>) {
    const resource = createTShelfResource(load, selection());
    const [state, setState] = createSignal(resource.getSnapshot());
    const unsubscribe = resource.subscribe(() =>
      setState(resource.getSnapshot()),
    );
    let started = false;
    createRenderEffect(() => {
      const nextSelection = selection();
      if (!started) {
        started = true;
        void resource.start();
        return;
      }
      void resource.select(nextSelection);
    });
    onCleanup(() => {
      unsubscribe();
      resource.cancel();
    });
    return {
      state,
      status: () => state().status,
      snapshot: () => state().snapshot,
      latest: () => state().latest,
      loading: () => state().status === "loading",
      error: () => state().error,
      filters: () => state().snapshot?.filters ?? state().latest?.filters ?? [],
      start: resource.start,
      refetch: resource.refetch,
      cancel: resource.cancel,
    };
  };

export const useTShelf = createTShelfQuery((selection) =>
  queryClient.tShelf.get(selection),
);

export const useMobileArticleShelf = () =>
  useDataResource(
    () => undefined,
    () => queryClient.mobileShelf.list(),
  );

export const useMobileCategoryShelf = (
  categoryId: Accessor<number | undefined>,
) => {
  const resource = createCategoryShelfResource((selection) =>
    queryClient.contentTaxonomy.getCategoryShelf(selection),
  );
  const [state, setState] = createSignal(resource.getSnapshot());
  const unsubscribe = resource.subscribe(() =>
    setState(resource.getSnapshot()),
  );
  let started = false;
  createRenderEffect(() => {
    const categoryIdValue = categoryId();
    const selection: CategoryShelfInput = { categoryId: categoryIdValue };
    if (!started) {
      started = true;
      void resource.select(selection);
      return;
    }
    void resource.select(selection);
  });
  onCleanup(() => {
    unsubscribe();
    resource.cancel();
  });
  return {
    state,
    snapshot: () => state().snapshot,
    latest: () => state().latest,
    loading: () => state().status === "loading",
    error: () => state().error,
    refetch: resource.refetch,
    cancel: resource.cancel,
  };
};
