import {
  For,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { render } from "solid-js/web";
import {
  MobileNav,
  StateMessage,
  FilterPanel,
  pageStyles,
  BottomNav,
  ShelfIndex,
  ShelfSection,
} from "../components/ui";
import { filterFromSearch, filterSearch } from "../../../common/logic/filter";
import { browserClient as client } from "../../../common/client";
import { useDataResource } from "../../../solid/data";
import { type ArticleFilter } from "../../../common/contracts/domain";
import "../../styles.css";
import "../../filter.css";

const App = () => {
  const [filter, setFilter] = createSignal<ArticleFilter>(
    filterFromSearch(location.search),
  );
  const [open, setOpen] = createSignal(false);
  const shelf = useDataResource(filter, (value) =>
    client.mobileShelf.list({
      ...value,
      termIds: value.termIds.map(Number),
      typeId: Number(value.typeId) || undefined,
    }),
  );
  const terms = useDataResource(
    () => undefined,
    () => client.taxonomy.listTerms(),
  );
  const types = useDataResource(
    () => undefined,
    () => client.taxonomy.listTypes(),
  );
  const [activeSectionId, setActiveSectionId] = createSignal("");
  let programmaticSectionId: string | undefined;
  let programmaticScrollTimer: number | undefined;
  const releaseProgrammaticScroll = () => {
    if (!programmaticSectionId) return;
    const sectionId = programmaticSectionId;
    programmaticSectionId = undefined;
    programmaticScrollTimer = undefined;
    setActiveSectionId(sectionId);
  };
  const scheduleProgrammaticRelease = (delay = 140) => {
    if (programmaticScrollTimer !== undefined)
      clearTimeout(programmaticScrollTimer);
    programmaticScrollTimer = window.setTimeout(
      releaseProgrammaticScroll,
      delay,
    );
  };
  const activeCount = () => {
    const value = filter();
    return (
      value.termIds.length +
      [
        value.typeId,
        value.createdFrom,
        value.createdTo,
        value.updatedFrom,
        value.updatedTo,
      ].filter(Boolean).length
    );
  };
  const apply = (next: ArticleFilter) => {
    setFilter(next);
    const q = filterSearch(next, false);
    history.pushState(
      {},
      "",
      `${location.pathname}${q.toString() ? `?${q}` : ""}`,
    );
    setOpen(false);
  };
  const selectSection = (sectionId: string) => {
    const section = document.getElementById(`shelf-${sectionId}`);
    if (!section) return;
    programmaticSectionId = sectionId;
    setActiveSectionId(sectionId);
    // Keep the selected tab stable while smooth scrolling crosses other sections.
    scheduleProgrammaticRelease(700);
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  createEffect(() => {
    const sections = shelf.snapshot()?.sections ?? [];
    if (sections.length === 0) {
      setActiveSectionId("");
      return;
    }
    setActiveSectionId(sections[0].id);
    const observer = new IntersectionObserver(
      (entries) => {
        if (programmaticSectionId) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (first, second) =>
              first.boundingClientRect.top - second.boundingClientRect.top,
          );
        const nearestSection =
          visible[0]?.target.getAttribute("data-shelf-section");
        if (nearestSection) setActiveSectionId(nearestSection);
      },
      { rootMargin: "-92px 0px -58%", threshold: 0 },
    );
    for (const section of sections) {
      const element = document.getElementById(`shelf-${section.id}`);
      if (element) observer.observe(element);
    }
    onCleanup(() => observer.disconnect());
  });
  onMount(() => {
    const onPop = () => setFilter(filterFromSearch(location.search));
    const onScroll = () => {
      if (programmaticSectionId) scheduleProgrammaticRelease();
    };
    addEventListener("popstate", onPop);
    addEventListener("scroll", onScroll, { passive: true });
    onCleanup(() => {
      removeEventListener("popstate", onPop);
      removeEventListener("scroll", onScroll);
      if (programmaticScrollTimer !== undefined)
        clearTimeout(programmaticScrollTimer);
    });
  });
  return (
    <div class="mobile-shell">
      {pageStyles()}
      <MobileNav active="articles" />
      <main id="main" class="mobile-main">
        <header class="page-heading">
          <p class="eyebrow">文章库</p>
          <h1>全部文章</h1>
          <p class="subtle">
            共 {shelf.snapshot()?.total ?? "--"} 篇已发布记录
          </p>
          <button
            class="filter-trigger"
            onClick={() => setOpen(true)}
            aria-expanded={open()}
          >
            <span>筛选文章</span>
            <span>{activeCount() ? `${activeCount()} 项条件` : "全部"}</span>
          </button>
        </header>
        <Show
          when={!shelf.loading()}
          fallback={<StateMessage kind="loading" text="正在加载文章…" />}
        >
          <Show
            when={!shelf.error()}
            fallback={
              <StateMessage
                kind="error"
                text="文章加载失败，请稍后重试"
                onRetry={() => void shelf.refetch()}
              />
            }
          >
            <Show
              when={(shelf.snapshot()?.sections ?? []).length > 0}
              fallback={<StateMessage kind="empty" text="没有符合条件的文章" />}
            >
              <div class="shelf-layout">
                <ShelfIndex
                  activeSectionId={activeSectionId()}
                  sections={shelf.snapshot()?.sections ?? []}
                  onSelect={selectSection}
                />
                <div class="shelf-content" aria-label="文章分区列表">
                  <For each={shelf.snapshot()?.sections ?? []}>
                    {(section) => <ShelfSection section={section} />}
                  </For>
                </div>
              </div>
            </Show>
          </Show>
        </Show>
      </main>
      <Show when={open()}>
        <FilterPanel
          value={filter()}
          terms={terms.snapshot() ?? []}
          types={types.snapshot() ?? []}
          onApply={apply}
          onClose={() => setOpen(false)}
        />
      </Show>
      <BottomNav active="articles" />
    </div>
  );
};
render(() => <App />, document.getElementById("app")!);
