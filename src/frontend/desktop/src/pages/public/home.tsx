import { createSignal } from "solid-js";
import { definePage } from "../../../../solid/page";
import { useTShelf } from "../../../../solid/queries";
import { Header, TShelf } from "../../app";

const App = () => {
  const [recommendationSelection, setRecommendationSelection] = createSignal({
    surface: "recommendation" as const,
    filterId: "all",
  });
  const [archiveSelection, setArchiveSelection] = createSignal({
    surface: "archive" as const,
    filterId: "all",
  });
  const recommendations = useTShelf(recommendationSelection);
  const articles = useTShelf(archiveSelection);
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
          <TShelf
            filters={recommendations.filters()}
            selectedFilterId={recommendationSelection().filterId}
            articles={recommendations.snapshot()?.articles ?? []}
            total={recommendations.snapshot()?.total}
            loading={recommendations.loading()}
            error={recommendations.error() !== undefined}
            variant="recommended"
            onSelect={(filterId) =>
              setRecommendationSelection({
                surface: "recommendation",
                filterId,
              })
            }
            onRetry={() => void recommendations.refetch()}
          />
        </section>
        <section class="section archive-section">
          <div class="section-heading">
            <div>
              <p class="eyebrow">ARCHIVE</p>
              <h2>文章档案</h2>
            </div>
            <p>共 {articles.snapshot()?.total ?? "--"} 篇已发布文章</p>
          </div>
          <TShelf
            filters={articles.filters()}
            selectedFilterId={archiveSelection().filterId}
            articles={articles.snapshot()?.articles ?? []}
            total={articles.snapshot()?.total}
            loading={articles.loading()}
            error={articles.error() !== undefined}
            variant="archive"
            onSelect={(filterId) =>
              setArchiveSelection({ surface: "archive", filterId })
            }
            onRetry={() => void articles.refetch()}
          />
        </section>
      </main>
    </div>
  );
};
definePage(App);
