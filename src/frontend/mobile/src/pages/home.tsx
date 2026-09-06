import { For, Show } from "solid-js";
import { render } from "solid-js/web";
import { browserClient as client } from "../../../common/client";
import { useDataResource } from "../../../solid/data";
import {
  ArticleRow,
  BottomNav,
  MobileNav,
  pageStyles,
  StateMessage,
} from "../components/ui";
// Fixed Mobile CSS entry order. Keep tokens first and pages last; the atom
// layer stays unimported until the separate atom consumption migration.
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
          <p class="eyebrow">技术知识库</p>
          <h1>推荐阅读</h1>
          <p class="subtle">从最近沉淀的实践中，挑选值得反复阅读的内容。</p>
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
        <a class="primary-action" href="/m/articles/index.html">
          浏览全部文章 <span aria-hidden="true">→</span>
        </a>
      </main>
      <BottomNav active="home" />
    </div>
  );
};
render(() => <App />, document.getElementById("app")!);
