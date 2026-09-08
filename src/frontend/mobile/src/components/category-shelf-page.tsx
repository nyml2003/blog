import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { Heading, Text } from "../../../mobile-ui/atoms";
import { BottomNav, StateMessage } from "../../../mobile-ui/molecules";
import { useMobileCategoryShelf } from "../../../solid/queries";
import {
  categoryIdFromSearch,
  categoryRequestId,
  categoryScrollRestoreReady,
  categorySelection,
  mobileArticleShelfHistory,
  mobileArticleShelfStateKey,
  navigateCategory,
  restoreCategoryPop,
  scheduleCategoryScrollRestore,
  type CategorySelection,
} from "../logic/category-browser";
import { mobileNavigationItems } from "../logic/navigation";
import { CategoryShelfView } from "./category-shelf";
import { MobileNav, pageStyles } from "./ui";

export function CategoryShelfPage(p: { title: string }) {
  const savedHistory = mobileArticleShelfHistory(history.state);
  const [pendingHistory, setPendingHistory] = createSignal(savedHistory);
  const [requestedCategoryId, setRequestedCategoryId] = createSignal(
    categoryIdFromSearch(location.search),
  );
  const shelf = useMobileCategoryShelf(requestedCategoryId);
  const current = () => shelf.snapshot() ?? shelf.latest();
  const selection = createMemo(() => {
    const value = current();
    if (value === undefined) return undefined;
    return categorySelection(value.taxonomy, requestedCategoryId());
  });
  let programmaticSectionId: string | undefined;

  const historyRecord = (): Record<string, unknown> =>
    typeof history.state === "object" && history.state !== null
      ? history.state
      : {};
  const persistHistoryEntry = () => {
    const sectionId =
      programmaticSectionId ?? String(requestedCategoryId() ?? "");
    history.replaceState(
      {
        ...historyRecord(),
        [mobileArticleShelfStateKey]: {
          sectionId,
          scrollY: window.scrollY,
        },
      },
      "",
    );
  };

  const select = (next: CategorySelection, replace = false) => {
    navigateCategory(location.pathname, next, replace, {
      persistCurrent: persistHistoryEntry,
      setRequested: setRequestedCategoryId,
      push: (href) => history.pushState({}, "", href),
      replace: (href) => history.replaceState(historyRecord(), "", href),
    });
  };
  createEffect(() => {
    const next = selection();
    if (next === undefined) return;
    const normalizedId = categoryRequestId(next);
    if (normalizedId === requestedCategoryId()) return;
    select(next, true);
  });
  createEffect(() => {
    const saved = pendingHistory();
    const model = shelf.snapshot();
    if (model === undefined || selection() === undefined) return;
    if (
      !categoryScrollRestoreReady(
        shelf.loading(),
        requestedCategoryId(),
        model.selectedCategoryId,
        saved,
      )
    ) {
      return;
    }
    const savedCategoryId = categoryIdFromSearch(
      `?category_id=${saved?.sectionId ?? ""}`,
    );
    if (savedCategoryId !== undefined) {
      const restoredSelection = categorySelection(
        model.taxonomy,
        savedCategoryId,
      );
      if (restoredSelection !== undefined) {
        const normalizedId = categoryRequestId(restoredSelection);
        programmaticSectionId = String(normalizedId);
        if (normalizedId !== requestedCategoryId()) {
          select(restoredSelection, true);
        }
      }
    }
    setPendingHistory(undefined);
    scheduleCategoryScrollRestore(saved?.scrollY ?? 0, {
      frame: (callback) => requestAnimationFrame(callback),
      task: (callback) => window.setTimeout(callback, 0),
      scroll: (scrollY) => window.scrollTo(0, scrollY),
      release: () => {
        programmaticSectionId = undefined;
      },
    });
  });
  onMount(() => {
    history.scrollRestoration = "manual";
    const onPopState = (event: PopStateEvent) => {
      const snapshot = restoreCategoryPop(location.search, event.state, {
        setPendingHistory,
        setRequested: setRequestedCategoryId,
      });
      if (snapshot === undefined) setPendingHistory(undefined);
    };
    const onPageHide = () => persistHistoryEntry();
    addEventListener("popstate", onPopState);
    addEventListener("pagehide", onPageHide);
    onCleanup(() => {
      removeEventListener("popstate", onPopState);
      removeEventListener("pagehide", onPageHide);
    });
  });

  return (
    <div class="mobile-shell">
      {pageStyles()}
      <MobileNav active="articles" />
      <main id="main" class="mobile-main">
        <header class="page-heading category-page-heading">
          <Text content="文章库" options={{ tone: "accent", size: "meta" }} />
          <Heading content={p.title} options={{ as: "h1", size: "page" }} />
          <Text
            content="从一级领域进入，再用二级分类收窄文章。"
            options={{ as: "p", tone: "muted", size: "meta" }}
          />
        </header>
        <Show
          when={current()}
          fallback={
            <Show
              when={shelf.loading()}
              fallback={
                <StateMessage
                  kind="error"
                  text="分类加载失败，请稍后重试"
                  onRetry={() => void shelf.refetch()}
                />
              }
            >
              <StateMessage kind="loading" text="正在加载分类…" />
            </Show>
          }
        >
          {(model) => (
            <Show
              when={selection()}
              fallback={<StateMessage kind="empty" text="暂无可浏览分类" />}
            >
              {(selected) => (
                <CategoryShelfView
                  taxonomy={model().taxonomy}
                  selection={selected()}
                  articles={model().articles}
                  total={model().total}
                  loading={shelf.loading()}
                  error={shelf.error() !== undefined}
                  onSelectRoot={(rootId) =>
                    select({ rootId, childId: undefined })
                  }
                  onSelectChild={(childId) =>
                    select({ rootId: selected().rootId, childId })
                  }
                  onRetry={() => void shelf.refetch()}
                />
              )}
            </Show>
          )}
        </Show>
      </main>
      <BottomNav
        items={mobileNavigationItems}
        activeId="articles"
        ariaLabel="页面导航"
      />
    </div>
  );
}
