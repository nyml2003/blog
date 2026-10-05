import { type DeepReadonly } from "@fluvient/core";
import { findTextMatches } from "@fluvient-loom/text-highlight";
import { type Component, For, Show } from "solid-js";
import type { DesktopApi, SiteRoutes, TShelf } from "@blog/desktop-api";
import { useDesktopSearch } from "@blog/desktop-shared";
import { siteRoute, siteRouteWithQuery } from "@fluvient-loom/page-kit";
import type { NavigationPort } from "@fluvient-loom/port";
import { useDesktopArticles } from "./feature.ts";
import { desktopArticlesPage } from "./definition.ts";

export interface DesktopArticlesInput {
  readonly api: DesktopApi;
  readonly routes: SiteRoutes;
  readonly navigation: NavigationPort;
}

export function createDesktopArticlesPage(
  input: DesktopArticlesInput,
): Component {
  return function DesktopArticlesPage() {
    const params = desktopArticlesPage.parseParams(
      input.navigation.current().search,
    );
    const page = useDesktopArticles(
      input.api,
      params.ok ? params.value.type_id : "all",
    );
    const query = params.ok ? params.value.q : "";
    const search = useDesktopSearch(input.api, query);
    const archiveHref = siteRoute(input.routes, "desktop-public-articles");
    const homeHref = siteRoute(input.routes, "desktop-public-home");
    const data = () =>
      page.resource.state().snapshot as DeepReadonly<TShelf> | undefined;
    const select = (id: string) => {
      page.selectFilter(id);
      input.navigation.replace(
        id === "all"
          ? archiveHref
          : siteRouteWithQuery(input.routes, "desktop-public-articles", {
              type_id: id,
            }),
        {},
      );
    };
    const detailHref = (id: number) =>
      siteRouteWithQuery(input.routes, "desktop-public-detail", { id });
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
            <a href={homeHref}>首页</a>
            <a aria-current="page" href={archiveHref}>
              全部文章
            </a>
            <Show when={__BLOG_ADMIN_ENTRY__}>
              <a href={siteRoute(input.routes, "desktop-admin-home")}>工作台</a>
            </Show>
          </nav>
        </header>
        <main id="main">
          <header class="page-title">
            <p class="eyebrow">ARCHIVE</p>
            <h1>全部文章</h1>
            <p>按文章类型浏览已经发布的技术记录。</p>
            <form class="article-search" method="get">
              <label for="article-search-query">搜索文章</label>
              <input
                id="article-search-query"
                name="q"
                type="search"
                value={query}
                placeholder="标题、摘要或正文"
              />
              <button type="submit">搜索</button>
            </form>
          </header>
          {query !== "" ? (
            <div class="search-results" aria-live="polite">
              {search.state().status === "loading" ? <p>正在搜索...</p> : null}
              {search.state().status === "error" ? (
                <p role="alert">搜索失败，请重试。</p>
              ) : null}
              <Show when={search.state().snapshot !== undefined}>
                <p>找到 {search.state().snapshot?.total ?? 0} 篇文章</p>
                <For each={search.state().snapshot?.items ?? []}>
                  {(article) => (
                    <a
                      class="article-search-result"
                      href={siteRouteWithQuery(
                        input.routes,
                        "desktop-public-detail",
                        { id: article.id, q: query },
                      )}
                    >
                      <strong>
                        <HighlightedText text={article.title} query={query} />
                      </strong>
                      <span>
                        <HighlightedText text={article.summary} query={query} />
                      </span>
                    </a>
                  )}
                </For>
              </Show>
            </div>
          ) : (
            <div class="t-shelf">
              <nav class="t-shelf-filters" aria-label="文章类型筛选">
                <For each={data()?.filters ?? []}>
                  {(item) => (
                    <button
                      type="button"
                      aria-pressed={page.selection().filterId === item.id}
                      onClick={() => select(item.id)}
                    >
                      {item.name}
                    </button>
                  )}
                </For>
              </nav>
              <div
                class="t-shelf-content"
                aria-live="polite"
                aria-busy={page.resource.state().status === "loading"}
              >
                <Show
                  when={page.resource.state().status !== "loading"}
                  fallback={<p>加载中...</p>}
                >
                  <Show
                    when={page.resource.state().status !== "error"}
                    fallback={<p role="alert">文章加载失败，请重试。</p>}
                  >
                    <Show
                      when={(data()?.articles.length ?? 0) > 0}
                      fallback={<p>当前分类还没有文章</p>}
                    >
                      <p>共 {data()?.total ?? 0} 篇</p>
                      <For each={data()?.articles ?? []}>
                        {(article) => (
                          <a class="archive-row" href={detailHref(article.id)}>
                            <time>{article.updatedAt.slice(0, 10)}</time>
                            <div>
                              <h3>{article.title || "未命名文章"}</h3>
                              <div class="tag-line">
                                <For each={article.terms.slice(0, 3)}>
                                  {(term) => (
                                    <span class="tag">{term.name}</span>
                                  )}
                                </For>
                              </div>
                            </div>
                            <span>
                              {article.articleType?.name ?? "阅读全文"} →
                            </span>
                          </a>
                        )}
                      </For>
                    </Show>
                  </Show>
                </Show>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  };
}

function HighlightedText(props: {
  readonly text: string;
  readonly query: string;
}) {
  const matches = findTextMatches(props.text, props.query).matches;
  const parts: Array<{ readonly value: string; readonly hit: boolean }> = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor)
      parts.push({ value: props.text.slice(cursor, match.start), hit: false });
    parts.push({ value: props.text.slice(match.start, match.end), hit: true });
    cursor = match.end;
  }
  if (cursor < props.text.length)
    parts.push({ value: props.text.slice(cursor), hit: false });
  return (
    <>
      {parts.map((part) => (part.hit ? <mark>{part.value}</mark> : part.value))}
    </>
  );
}
