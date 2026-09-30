import { For, Show, type Component } from "solid-js";
import type { DesktopPageContext } from "../context";
import { route } from "../context";
import { useDesktopHome } from "../logic/home";
import type { TShelf } from "../../api/desktop";
import type { DeepReadonly } from "../../../kernel";

function Shelf(props: {
  data: DeepReadonly<TShelf> | undefined;
  loading: boolean;
  error: boolean;
  filterId: string;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <div class="t-shelf">
      <nav class="t-shelf-filters" aria-label="文章类型筛选">
        <For each={props.data?.filters ?? []}>
          {(filter) => (
            <button
              type="button"
              aria-pressed={props.filterId === filter.id}
              onClick={() => props.onSelect(filter.id)}
            >
              {filter.name}
            </button>
          )}
        </For>
      </nav>
      <div class="t-shelf-content" aria-live="polite" aria-busy={props.loading}>
        <Show when={!props.loading} fallback={<p>加载中...</p>}>
          <Show
            when={!props.error}
            fallback={
              <p role="alert">
                文章加载失败，请{" "}
                <button type="button" onClick={props.onRetry}>
                  重试
                </button>
                。
              </p>
            }
          >
            <Show
              when={(props.data?.articles.length ?? 0) > 0}
              fallback={<p>当前分类还没有文章</p>}
            >
              <p>共 {props.data?.total ?? 0} 篇</p>
              <div class="archive-list">
                <For each={props.data?.articles ?? []}>
                  {(article, index) => (
                    <a class="archive-row" href={article.href || "#"}>
                      <div>
                        <strong>{String(index() + 1).padStart(2, "0")}</strong>
                        <time>{article.updatedAt.slice(0, 10)}</time>
                      </div>
                      <div>
                        <h3>{article.title || "未命名文章"}</h3>
                        <div class="tag-line">
                          <For each={article.terms.slice(0, 3)}>
                            {(term) => <span class="tag">{term.name}</span>}
                          </For>
                        </div>
                      </div>
                      <span>{article.articleType?.name ?? "阅读全文"} →</span>
                    </a>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  );
}

export function createDesktopHomePage(input: DesktopPageContext): Component {
  return function DesktopHomePage() {
    const home = useDesktopHome(input.api);
    const homeHref = route(input.routes, "desktop-public-home");
    const archiveHref = route(input.routes, "desktop-public-articles");
    return (
      <div class="desktop-home">
        <a class="skip" href="#main">
          跳到主内容
        </a>
        <header class="topbar">
          <a class="brand" href={homeHref}>
            <span class="brand-kicker">FIELD NOTES</span>
            <strong>技术知识库</strong>
          </a>
          <nav class="nav" aria-label="主导航">
            <a aria-current="page" href={homeHref}>
              首页
            </a>
            <a href={archiveHref}>全部文章</a>
          </nav>
        </header>
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
                  {home.archive.state().snapshot?.total ?? "--"}
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
          <section class="section">
            <div class="section-heading">
              <div>
                <p class="eyebrow">RECENT PICKS</p>
                <h2>近期推荐</h2>
              </div>
              <p>最近更新的实践记录</p>
            </div>
            <Shelf
              data={home.recommendations.state().snapshot}
              loading={home.recommendations.state().status === "loading"}
              error={home.recommendations.state().status === "error"}
              filterId={home.recommendationSelection().filterId}
              onSelect={home.selectRecommendation}
              onRetry={home.recommendations.reload}
            />
          </section>
          <section class="section">
            <div class="section-heading">
              <div>
                <p class="eyebrow">ARCHIVE</p>
                <h2>文章档案</h2>
              </div>
              <p>
                共 {home.archive.state().snapshot?.total ?? "--"} 篇已发布文章
              </p>
            </div>
            <Shelf
              data={home.archive.state().snapshot}
              loading={home.archive.state().status === "loading"}
              error={home.archive.state().status === "error"}
              filterId={home.archiveSelection().filterId}
              onSelect={home.selectArchive}
              onRetry={home.archive.reload}
            />
          </section>
        </main>
      </div>
    );
  };
}
