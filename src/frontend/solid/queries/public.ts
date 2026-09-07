import {
  createRenderEffect,
  createSignal,
  onCleanup,
  type Accessor,
} from "solid-js";
import type {
  ArticleBrowsePage,
  ArticleBrowseInput,
  ArticleListItem,
  Term,
  TShelf,
  TShelfFilter,
  TShelfInput,
} from "../../common/client";

export type { TShelf, TShelfArticle, TShelfFilter } from "../../common/client";
import type { ArticleFilter } from "../../common/contracts/domain";
import {
  createDataResource,
  type DataResource,
} from "../../common/data/resource";
import {
  articleFilterInput,
  queryClient,
  type QueryReadonly,
  type QueryResult,
  startQuery,
  taskForArticleId,
  type QueryTask,
  useDataResource,
} from "./core";

export type ArticleBrowseSelection = {
  readonly typeId?: number;
  readonly topicId?: number;
  readonly tagId?: number;
};

export type ArticleBrowseMoreStatus = "idle" | "loading" | "error";

type ArticleBrowseAppendedPage = {
  readonly page: number;
  readonly items: readonly QueryReadonly<ArticleListItem>[];
};

export type ArticleBrowsePaginationState = {
  readonly appended: readonly ArticleBrowseAppendedPage[];
  readonly moreStatus: ArticleBrowseMoreStatus;
};

export type ArticleBrowsePageLoader = (
  selection: ArticleBrowseSelection,
  page: number,
) => QueryTask<ArticleBrowsePage>;

export type ArticleBrowsePagination = {
  readonly getSnapshot: () => ArticleBrowsePaginationState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly reset: (selection: ArticleBrowseSelection) => void;
  readonly loadMore: (
    firstPage: QueryReadonly<ArticleBrowsePage> | undefined,
  ) => Promise<void>;
  readonly cancel: () => void;
};

export const articleBrowseItems = (
  firstPage: QueryReadonly<ArticleBrowsePage> | undefined,
  pagination: ArticleBrowsePaginationState,
): readonly QueryReadonly<ArticleListItem>[] => [
  ...(firstPage?.items ?? []),
  ...pagination.appended.flatMap((page) => page.items),
];

export const articleBrowseHasMore = (
  firstPage: QueryReadonly<ArticleBrowsePage> | undefined,
  pagination: ArticleBrowsePaginationState,
): boolean => {
  if (firstPage === undefined) return false;
  const lastPageEmpty = pagination.appended.at(-1)?.items.length === 0;
  return (
    articleBrowseItems(firstPage, pagination).length < firstPage.total &&
    !lastPageEmpty
  );
};

const articleBrowseSelectionsEqual = (
  left: ArticleBrowseSelection,
  right: ArticleBrowseSelection,
): boolean =>
  left.typeId === right.typeId &&
  left.topicId === right.topicId &&
  left.tagId === right.tagId;

const nextArticleBrowsePage = (appendedPageCount: number): number =>
  appendedPageCount + 2;

export const createArticleBrowsePagination = (
  load: ArticleBrowsePageLoader,
  initialSelection: ArticleBrowseSelection,
): ArticleBrowsePagination => {
  let selection = initialSelection;
  let activeTask: QueryTask<ArticleBrowsePage> | undefined;
  let generation = 0;
  let state: ArticleBrowsePaginationState = {
    appended: [],
    moreStatus: "idle",
  };
  const listeners = new Set<() => void>();
  const replace = (next: ArticleBrowsePaginationState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const cancelActive = () => {
    generation += 1;
    activeTask?.cancel();
    activeTask = undefined;
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset(nextSelection) {
      cancelActive();
      selection = nextSelection;
      replace({ appended: [], moreStatus: "idle" });
    },
    async loadMore(firstPage) {
      if (
        state.moreStatus === "loading" ||
        !articleBrowseHasMore(firstPage, state)
      ) {
        return;
      }

      const requestedSelection = selection;
      const requestedPage = nextArticleBrowsePage(state.appended.length);
      let task: QueryTask<ArticleBrowsePage>;
      try {
        task = load(requestedSelection, requestedPage);
      } catch {
        replace({ ...state, moreStatus: "error" });
        return;
      }
      const requestGeneration = ++generation;
      activeTask = task;
      replace({ ...state, moreStatus: "loading" });
      const result = await startQuery(task);
      const requestIsCurrent =
        requestGeneration === generation &&
        activeTask === task &&
        articleBrowseSelectionsEqual(requestedSelection, selection);
      if (!requestIsCurrent) return;

      activeTask = undefined;
      if (!result.ok) {
        replace({ ...state, moreStatus: "error" });
        return;
      }
      replace({
        moreStatus: "idle",
        appended: [
          ...state.appended,
          { page: requestedPage, items: result.value.items },
        ],
      });
    },
    cancel() {
      cancelActive();
    },
  };
};

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

export const articleBrowseInput = (
  selection: ArticleBrowseSelection,
  page?: number,
): ArticleBrowseInput => ({
  typeId: selection.typeId,
  topicId: selection.topicId,
  tagId: selection.tagId,
  page,
});

export const usePublishedArticles = (filter: Accessor<ArticleFilter>) =>
  useDataResource(filter, (value) =>
    queryClient.articleCatalog.listPublishedArticles(articleFilterInput(value)),
  );

export const usePublishedArticle = (
  rawId: Accessor<string | null | undefined>,
) =>
  useDataResource(rawId, (value) =>
    taskForArticleId(value, (id) =>
      queryClient.articleCatalog.getPublishedArticle(id),
    ),
  );

export const useHomeRecommendations = () =>
  useDataResource(
    () => undefined,
    () => queryClient.recommendationFeed.getHomeRecommendations(),
  );

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

export const usePublicArticleTypes = () =>
  useDataResource(
    () => undefined,
    () => queryClient.taxonomy.listTypes(),
  );

export const usePublicTerms = () =>
  useDataResource(
    () => undefined,
    () => queryClient.taxonomy.listTerms(),
  );

export const usePublicBrowseTaxonomy = () => {
  const types = usePublicArticleTypes();
  const terms = usePublicTerms();
  const termsOfKind = (kind: Term["kind"]) =>
    (terms.snapshot() ?? []).filter((term) => term.kind === kind);
  return {
    types: () => types.snapshot() ?? [],
    topics: () => termsOfKind("topic"),
    tags: () => termsOfKind("tag"),
    failed: () => types.error() !== undefined || terms.error() !== undefined,
    retry: () => Promise.all([types.refetch(), terms.refetch()]),
  };
};

export const useArticleBrowse = (selection: Accessor<ArticleBrowseSelection>) =>
  useDataResource(selection, (value) =>
    queryClient.articleCatalog.browseArticles(articleBrowseInput(value)),
  );

export const loadArticleBrowsePage = (
  selection: ArticleBrowseSelection,
  page: number,
) =>
  queryClient.articleCatalog.browseArticles(
    articleBrowseInput(selection, page),
  );

export const useArticleBrowseList = (
  selection: Accessor<ArticleBrowseSelection>,
) => {
  const firstPage = useArticleBrowse(selection);
  const pagination = createArticleBrowsePagination(
    loadArticleBrowsePage,
    selection(),
  );
  const [paginationState, setPaginationState] = createSignal(
    pagination.getSnapshot(),
  );
  const unsubscribe = pagination.subscribe(() =>
    setPaginationState(pagination.getSnapshot()),
  );
  createRenderEffect(() => pagination.reset(selection()));
  onCleanup(() => {
    unsubscribe();
    pagination.cancel();
  });

  const items = (): readonly QueryReadonly<ArticleListItem>[] =>
    articleBrowseItems(firstPage.snapshot(), paginationState());
  const total = () => firstPage.snapshot()?.total ?? 0;
  const hasMore = () =>
    articleBrowseHasMore(firstPage.snapshot(), paginationState());

  return {
    items,
    total,
    loadedCount: () => items().length,
    hasMore,
    moreStatus: () => paginationState().moreStatus,
    loading: firstPage.loading,
    error: firstPage.error,
    retry: firstPage.refetch,
    loadMore: () => pagination.loadMore(firstPage.snapshot()),
  };
};
