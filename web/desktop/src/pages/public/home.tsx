import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { emptyFilter } from "../../../../common/contracts/domain";
import { browserClient as client } from "../../../../common/client";
import { useDataResource } from "../../../../solid/data";
import { Filters, Header, Shelf } from "../../app";

const App = () => {
  const [filter, setFilter] = createSignal(emptyFilter());
  const recommendations = useDataResource(
    () => undefined,
    () => client.recommendationFeed.getHomeRecommendations(),
  );
  const articles = useDataResource(filter, (value) =>
    client.articleCatalog.listPublishedArticles({
      termIds: value.termIds.map(Number),
      typeId: Number(value.typeId) || undefined,
      createdFrom: value.createdFrom || undefined,
      createdTo: value.createdTo || undefined,
      updatedFrom: value.updatedFrom || undefined,
      updatedTo: value.updatedTo || undefined,
    }),
  );
  return (
    <div class="shell">
      <Header />
      <main id="main">
        <section class="intro">
          <div>
            <p class="eyebrow">FIELD NOTES · 技术实践档案</p>
            <h1>
              把排查过程，
              <br />
              沉淀成可复用的方法。
            </h1>
            <p class="intro-copy">
              面向真实工程现场的技术知识库，记录问题、判断依据与经过验证的解决方案。
            </p>
          </div>
          <dl class="library-stats">
            <div>
              <dt>已收录</dt>
              <dd>
                {articles.snapshot()?.total ?? "--"}
                <small> 篇</small>
              </dd>
            </div>
            <div>
              <dt>当前栏目</dt>
              <dd>
                实践<small> 档案</small>
              </dd>
            </div>
          </dl>
        </section>
        <section class="section recommendation-section">
          <div class="section-heading">
            <div>
              <p class="eyebrow">RECENT PICKS</p>
              <h2>近期推荐</h2>
            </div>
            <p>最近更新的实践记录</p>
          </div>
          <Show
            when={recommendations.status() !== "loading"}
            fallback={<div class="state">加载中...</div>}
          >
            <Show
              when={recommendations.status() !== "error"}
              fallback={<div class="error">推荐加载失败，请稍后重试。</div>}
            >
              <Show
                when={(recommendations.snapshot()?.length ?? 0) > 0}
                fallback={<div class="state">暂时还没有推荐文章</div>}
              >
                <Shelf
                  items={recommendations.snapshot() ?? []}
                  variant="recommended"
                />
              </Show>
            </Show>
          </Show>
        </section>
        <section class="section archive-section">
          <div class="section-heading">
            <div>
              <p class="eyebrow">ARCHIVE</p>
              <h2>文章档案</h2>
            </div>
            <p>共 {articles.snapshot()?.total ?? "--"} 篇已发布文章</p>
          </div>
          <Filters value={filter()} onChange={setFilter} />
          <Show
            when={articles.status() !== "loading"}
            fallback={<div class="state">加载中...</div>}
          >
            <Show
              when={articles.status() !== "error"}
              fallback={<div class="error">文章加载失败，请稍后重试。</div>}
            >
              <Show
                when={(articles.snapshot()?.items.length ?? 0) > 0}
                fallback={<div class="state">没有符合条件的文章</div>}
              >
                <Shelf
                  items={articles.snapshot()?.items ?? []}
                  variant="archive"
                />
              </Show>
            </Show>
          </Show>
        </section>
      </main>
    </div>
  );
};
render(() => <App />, document.getElementById("app")!);
