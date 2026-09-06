import {
  Show,
  createEffect,
  createSignal,
  on,
  onCleanup,
  onMount,
} from "solid-js";
import { definePage } from "../../../common/page";
import { Heading, Text } from "../../../mobile-ui/atoms";
import { BottomNav, StateMessage } from "../../../mobile-ui/molecules";
import { browserClient as client } from "../../../common/client";
import type { ArticleBrowsePage } from "../../../common/client/domain";
import type { ArticleListItem, Term } from "../../../common/contracts/domain";
import type { DataTask } from "../../../common/data/task";
import { useDataResource } from "../../../solid/data";
import { MobileNav, pageStyles } from "../components/ui";
import {
  BrowseCascade,
  BrowseList,
  BrowseMore,
  BrowseTypeRail,
  type BrowseLevelSelect,
  type BrowseMoreStatus,
} from "../components/browse";
import {
  browseFilterFromSearch,
  browseFiltersEqual,
  browseHref,
  cleanBrowseSearch,
  nextBrowsePage,
  selectBrowseFilter,
  type BrowseFilter,
} from "../logic/browse-filter";
import { mobileNavigationItems } from "../logic/navigation";
// Keep the shared Mobile foundation first, then page styles.
import "../../styles/app.css";

type BrowseArticle = ArticleListItem;

type BrowseAppendedPage = {
  readonly page: number;
  readonly items: readonly BrowseArticle[];
};

/** 平铺页请求参数：三维单选，页码由分页状态补齐，pageSize 交给后端默认。 */
const browseInput = (filter: BrowseFilter) => ({
  typeId: filter.typeId,
  topicId: filter.topicId,
  tagId: filter.tagId,
});

const termsOfKind = (terms: readonly Term[], kind: Term["kind"]) =>
  terms.filter((term) => term.kind === kind);

const App = () => {
  // 首帧：从 URL 恢复筛选，并剔除遗留的旧日期参数（SPEC 场景 005）。
  const initialQuery = location.search.replace(/^\?/, "");
  const restoredFilter = browseFilterFromSearch(location.search);
  const cleanedQuery = cleanBrowseSearch(initialQuery);
  if (cleanedQuery !== initialQuery) {
    history.replaceState(
      {},
      "",
      browseHref(location.pathname, restoredFilter, initialQuery),
    );
  }
  const [filter, setFilter] = createSignal<BrowseFilter>(restoredFilter);

  const types = useDataResource(
    () => undefined,
    () => client.taxonomy.listTypes(),
  );
  const terms = useDataResource(
    () => undefined,
    () => client.taxonomy.listTerms(),
  );
  const taxonomyFailed = () =>
    types.error() !== undefined || terms.error() !== undefined;
  const retryTaxonomy = () => {
    void types.refetch();
    void terms.refetch();
  };

  // 第 1 页随筛选重建；后续页只在本地累积（页码不进 URL）。
  const firstPage = useDataResource(filter, (value) =>
    client.articleCatalog.browseArticles(browseInput(value)),
  );
  const [appended, setAppended] = createSignal<readonly BrowseAppendedPage[]>(
    [],
  );
  const [moreStatus, setMoreStatus] = createSignal<BrowseMoreStatus>("idle");
  let moreTask: DataTask<ArticleBrowsePage> | undefined;

  // 任一筛选变化：清掉已追加的页（回到第 1 页），并作废在途的「加载更多」。
  createEffect(
    on(filter, () => {
      moreTask?.cancel();
      moreTask = undefined;
      setAppended([]);
      setMoreStatus("idle");
    }),
  );
  onCleanup(() => {
    moreTask?.cancel();
    moreTask = undefined;
  });

  const items = (): readonly BrowseArticle[] => [
    ...(firstPage.snapshot()?.items ?? []),
    ...appended().flatMap((page) => page.items),
  ];
  const total = () => firstPage.snapshot()?.total ?? 0;
  const loadedCount = () => items().length;
  // 除「已载满 total」外，空页（后端 total 与实际条数漂移）也视为没有下一页。
  const lastPageEmpty = () => {
    const pages = appended();
    return pages.length > 0 && pages[pages.length - 1].items.length === 0;
  };
  const hasMoreToLoad = () => loadedCount() < total() && !lastPageEmpty();

  const applyFilter = (next: BrowseFilter) => {
    setFilter(next);
    history.pushState(
      {},
      "",
      browseHref(location.pathname, next, location.search),
    );
  };
  const selectLevel: BrowseLevelSelect = (level, levelId) =>
    applyFilter(selectBrowseFilter(filter(), level, levelId));

  const loadMore = () => {
    const requestedFilter = filter();
    const first = firstPage.snapshot();
    if (moreStatus() === "loading" || !first) return;
    const requestedPage = nextBrowsePage(appended().length);
    const task = client.articleCatalog.browseArticles({
      ...browseInput(requestedFilter),
      page: requestedPage,
    });
    moreTask = task;
    setMoreStatus("loading");
    void task.start().then((result) => {
      if (moreTask !== task) return;
      moreTask = undefined;
      // 筛选已变的结果不追加：列表归属由当前筛选决定。
      if (!browseFiltersEqual(requestedFilter, filter())) return;
      if (result.ok) {
        setAppended((current) => [
          ...current,
          { page: requestedPage, items: result.value.items },
        ]);
        setMoreStatus("idle");
      } else {
        setMoreStatus("error");
      }
    });
  };

  onMount(() => {
    const onPopState = () => setFilter(browseFilterFromSearch(location.search));
    addEventListener("popstate", onPopState);
    onCleanup(() => removeEventListener("popstate", onPopState));
  });

  return (
    <div class="mobile-shell">
      {pageStyles()}
      <MobileNav active="articles" />
      <main id="main" class="mobile-main">
        <header class="page-heading">
          <Text content="文章库" options={{ tone: "accent", size: "meta" }} />
          <Heading content="文章检索" options={{ as: "h1", size: "page" }} />
          <Text
            content="按类型、主题、标签逐级收窄，或直接浏览全部文章。"
            options={{ as: "p", tone: "muted", size: "meta" }}
          />
        </header>
        <div class="browse-layout">
          <BrowseTypeRail
            types={types.snapshot() ?? []}
            filter={filter()}
            onSelect={(levelId) => selectLevel("type", levelId)}
          />
          <div class="browse-content">
            <BrowseCascade
              topics={termsOfKind(terms.snapshot() ?? [], "topic")}
              tags={termsOfKind(terms.snapshot() ?? [], "tag")}
              taxonomyFailed={taxonomyFailed()}
              filter={filter()}
              onSelect={selectLevel}
              onTaxonomyRetry={retryTaxonomy}
            />
            <Show
              when={!firstPage.loading()}
              fallback={<StateMessage kind="loading" text="正在加载文章…" />}
            >
              <Show
                when={!firstPage.error()}
                fallback={
                  <StateMessage
                    kind="error"
                    text="文章加载失败，请稍后重试"
                    onRetry={() => void firstPage.refetch()}
                  />
                }
              >
                <Show
                  when={items().length > 0}
                  fallback={
                    <StateMessage kind="empty" text="没有符合条件的文章" />
                  }
                >
                  <BrowseList articles={items()} />
                  <Show when={hasMoreToLoad()}>
                    <BrowseMore
                      status={moreStatus()}
                      loadedCount={loadedCount()}
                      total={total()}
                      onLoadMore={loadMore}
                    />
                  </Show>
                </Show>
              </Show>
            </Show>
          </div>
        </div>
      </main>
      <BottomNav
        items={mobileNavigationItems}
        activeId="articles"
        ariaLabel="页面导航"
      />
    </div>
  );
};
definePage(App);
