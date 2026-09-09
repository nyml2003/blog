import { createSignal } from "solid-js";
import { definePage } from "../../../solid/page";
import { Heading, Link, Text } from "../../../mobile-ui/atoms";
import { useTShelf, mobileArticlesHref } from "../../../solid/queries";
import { MobileNav, MobileTShelf, pageStyles } from "../components";
import { BottomNav } from "../../../mobile-ui/molecules";
import { mobileNavigationItems } from "../logic/navigation";
import "../../styles/app.css";

const App = () => {
  const [selection, setSelection] = createSignal({
    surface: "recommendation" as const,
    filterId: "all",
  });
  const recommendations = useTShelf(selection);
  return (
    <div class="mobile-shell">
      {pageStyles()}
      <MobileNav active="home" />
      <main id="main" class="mobile-main">
        <header class="page-heading">
          <Text
            content="技术知识库"
            options={{ tone: "accent", size: "meta" }}
          />
          <Heading content="推荐阅读" options={{ as: "h1", size: "page" }} />
          <Text
            content="从最近沉淀的实践中，挑选值得反复阅读的内容。"
            options={{ as: "p", tone: "muted", size: "meta" }}
          />
        </header>
        <MobileTShelf
          filters={recommendations.filters()}
          selectedFilterId={selection().filterId}
          articles={recommendations.snapshot()?.articles ?? []}
          total={recommendations.snapshot()?.total}
          loading={recommendations.loading()}
          error={recommendations.error() !== undefined}
          onSelect={(filterId) =>
            setSelection({ surface: "recommendation", filterId })
          }
          onRetry={() => void recommendations.refetch()}
        />
        <div class="primary-action">
          <Link
            content={
              <>
                <span>浏览全部文章</span>
                <span aria-hidden="true">→</span>
              </>
            }
            href={mobileArticlesHref()}
            options={{ variant: "cta" }}
          />
        </div>
      </main>
      <BottomNav
        items={mobileNavigationItems()}
        activeId="home"
        ariaLabel="页面导航"
      />
    </div>
  );
};
definePage(App);
