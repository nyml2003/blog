import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { definePage } from "../../../solid/page";
import { Heading, Text } from "../../../mobile-ui/atoms";
import { BottomNav, StateMessage } from "../../../mobile-ui/molecules";
import {
  useArticleBrowseList,
  usePublicBrowseTaxonomy,
} from "../../../solid/queries";
import { MobileNav, pageStyles } from "../components/ui";
import {
  BrowseCascade,
  BrowseList,
  BrowseMore,
  BrowseTypeRail,
  type BrowseLevelSelect,
} from "../components/browse";
import {
  browseFilterFromSearch,
  browseHref,
  cleanBrowseSearch,
  selectBrowseFilter,
  type BrowseFilter,
} from "../logic/browse-filter";
import { mobileNavigationItems } from "../logic/navigation";
// Keep the shared Mobile foundation first, then page styles.
import "../../styles/app.css";

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

  const taxonomy = usePublicBrowseTaxonomy();
  const browse = useArticleBrowseList(filter);

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
            types={taxonomy.types()}
            filter={filter()}
            onSelect={(levelId) => selectLevel("type", levelId)}
          />
          <div class="browse-content">
            <BrowseCascade
              topics={taxonomy.topics()}
              tags={taxonomy.tags()}
              taxonomyFailed={taxonomy.failed()}
              filter={filter()}
              onSelect={selectLevel}
              onTaxonomyRetry={() => void taxonomy.retry()}
            />
            <Show
              when={!browse.loading()}
              fallback={<StateMessage kind="loading" text="正在加载文章…" />}
            >
              <Show
                when={!browse.error()}
                fallback={
                  <StateMessage
                    kind="error"
                    text="文章加载失败，请稍后重试"
                    onRetry={() => void browse.retry()}
                  />
                }
              >
                <Show
                  when={browse.items().length > 0}
                  fallback={
                    <StateMessage kind="empty" text="没有符合条件的文章" />
                  }
                >
                  <BrowseList articles={browse.items()} />
                  <Show when={browse.hasMore()}>
                    <BrowseMore
                      status={browse.moreStatus()}
                      loadedCount={browse.loadedCount()}
                      total={browse.total()}
                      onLoadMore={() => void browse.loadMore()}
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
