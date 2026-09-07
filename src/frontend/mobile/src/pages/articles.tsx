import {
  For,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { definePage } from "../../../solid/page";
import { Heading, Text } from "../../../mobile-ui/atoms";
import {
  MobileNav,
  pageStyles,
  ShelfIndex,
  ShelfSection,
  StateMessage,
} from "../components/ui";
import { BottomNav } from "../../../mobile-ui/molecules";
import { mobileNavigationItems } from "../logic/navigation";
import { cleanBrowseHref } from "../logic/browse-filter";
import { useMobileArticleShelf } from "../../../solid/queries";
import "../../styles/app.css";

const App = () => {
  // 货架页是纯快照：首帧忽略并清理遗留的旧日期参数（SPEC 场景 005）。
  if (location.search !== "") {
    history.replaceState(
      {},
      "",
      cleanBrowseHref(location.pathname, location.search),
    );
  }
  const shelf = useMobileArticleShelf();
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
    const onScroll = () => {
      if (programmaticSectionId) scheduleProgrammaticRelease();
    };
    addEventListener("scroll", onScroll, { passive: true });
    onCleanup(() => removeEventListener("scroll", onScroll));
    onCleanup(() => {
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
          <Text content="文章库" options={{ tone: "accent", size: "meta" }} />
          <Heading content="全部文章" options={{ as: "h1", size: "page" }} />
          {/* 原子内容只在挂载时取值：总数到位后按 keyed 重建这一行。 */}
          <Show when={shelf.snapshot()} keyed>
            {(snapshot) => (
              <Text
                content={`共 ${snapshot.total} 篇已发布记录`}
                options={{ as: "p", tone: "muted", size: "meta" }}
              />
            )}
          </Show>
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
              fallback={<StateMessage kind="empty" text="暂无已发布文章" />}
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
      <BottomNav
        items={mobileNavigationItems}
        activeId="articles"
        ariaLabel="页面导航"
      />
    </div>
  );
};
definePage(App);
