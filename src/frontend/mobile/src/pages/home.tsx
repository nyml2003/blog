import { For, Show } from "solid-js";
import { render } from "solid-js/web";
import { Heading, Link, Text } from "../../../mobile-ui/atoms";
import { browserClient as client } from "../../../common/client";
import { useDataResource } from "../../../solid/data";
import {
  ArticleRow,
  MobileNav,
  pageStyles,
  StateMessage,
} from "../components/ui";
import { BottomNav } from "../../../mobile-ui/molecules";
import { mobileNavigationItems } from "../logic/navigation";
// Keep the shared Mobile foundation first, then component-library styles.
import "../../styles/tokens.css";
import "../../styles/base.css";
import "../../styles/shell.css";
import "../../styles/layout.css";
import "../../styles/components.css";
import "../../styles/shelf.css";
import "../../styles/filter.css";
import "../../styles/detail.css";
import "../../styles/article-body.css";
import "../../styles/pages.css";
import "../../../mobile-ui/styles/themes.css";
import "../../../mobile-ui/styles/atoms.css";
import "../../../mobile-ui/styles/molecules.css";

const App = () => {
  const recommendations = useDataResource(
    () => undefined,
    () => client.recommendationFeed.getHomeRecommendations(),
  );
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
        <Show
          when={recommendations.status() !== "loading"}
          fallback={<StateMessage kind="loading" text="正在加载推荐内容…" />}
        >
          <Show
            when={recommendations.status() !== "error"}
            fallback={
              <StateMessage
                kind="error"
                text="推荐内容加载失败"
                onRetry={() => void recommendations.refetch()}
              />
            }
          >
            <Show
              when={(recommendations.snapshot() ?? []).length > 0}
              fallback={<StateMessage kind="empty" text="暂时还没有推荐文章" />}
            >
              <section class="article-list" aria-label="推荐文章">
                <For each={recommendations.snapshot() ?? []}>
                  {(article) => <ArticleRow article={article} />}
                </For>
              </section>
            </Show>
          </Show>
        </Show>
        <div class="primary-action">
          <Link
            content={
              <>
                <span>浏览全部文章</span>
                <span aria-hidden="true">→</span>
              </>
            }
            href="/m/articles/index.html"
            options={{ variant: "cta" }}
          />
        </div>
      </main>
      <BottomNav
        items={mobileNavigationItems}
        activeId="home"
        ariaLabel="页面导航"
      />
    </div>
  );
};
render(() => <App />, document.getElementById("app")!);
