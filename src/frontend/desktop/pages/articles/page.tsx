import { For, Show, type Component } from "solid-js";
import type { DesktopPageContext } from "../../foundation/context";
import { route, routeWithQuery } from "../../foundation/context";
import { useDesktopArticles } from "../../features/articles/model";
import type { TShelf } from "../../foundation/api";
import { type DeepReadonly } from "@fluvient/core";
import { positiveFilterIdFromSearch } from "../../../validation/route-input";
import { searchQuery, useDesktopSearch } from "../../features/search/model";

export function createDesktopArticlesPage(input: DesktopPageContext): Component {
  return function DesktopArticlesPage() {
    const page = useDesktopArticles(input.api, positiveFilterIdFromSearch(input.navigation.current().search, "type_id"));
    const query = searchQuery(input.navigation.current().search);
    const search = useDesktopSearch(input.api, query);
    const archiveHref = route(input.routes, "desktop-public-articles");
    const homeHref = route(input.routes, "desktop-public-home");
    const data = () => page.resource.state().snapshot as DeepReadonly<TShelf> | undefined;
    const select = (id: string) => {
      page.selectFilter(id);
      input.navigation.replace(id === "all" ? archiveHref : routeWithQuery(input.routes, "desktop-public-articles", { type_id: id }), {});
    };
    const detailHref = (id: number) => routeWithQuery(input.routes, "desktop-public-detail", { id });
    return (
      <div class="desktop-home">
        <a class="skip" href="#main">跳到主内容</a>
        <header class="topbar">
          <a class="brand" href={homeHref}><span class="brand-kicker">FIELD NOTES</span><strong>技术知识库</strong></a>
          <nav class="nav" aria-label="主导航"><a href={homeHref}>首页</a><a aria-current="page" href={archiveHref}>全部文章</a></nav>
        </header>
        <main id="main">
          <header class="page-title">
            <p class="eyebrow">ARCHIVE</p><h1>全部文章</h1><p>按文章类型浏览已经发布的技术记录。</p>
            <form class="article-search" method="get"><label for="article-search-query">搜索文章</label><input id="article-search-query" name="q" type="search" value={query} placeholder="标题、摘要或正文" /><button type="submit">搜索</button></form>
          </header>
          {query !== "" ? (
            <div class="search-results" aria-live="polite">
              {search.state().status === "loading" ? <p>正在搜索...</p> : null}
              {search.state().status === "error" ? <p role="alert">搜索失败，请重试。</p> : null}
              <Show when={search.state().snapshot?.data !== undefined}>{(snapshot) => <><p>找到 {snapshot().data.total} 篇文章</p><For each={snapshot().data.items}>{(article) => <a class="article-search-result" href={routeWithQuery(input.routes, "desktop-public-detail", { id: article.id, q: query })}><strong>{article.title}</strong><span>{article.summary}</span></a>}</For></>}</Show>
            </div>
          ) : (
            <div class="t-shelf">
              <nav class="t-shelf-filters" aria-label="文章类型筛选"><For each={data()?.filters ?? []}>{(item) => <button type="button" aria-pressed={page.selection().filterId === item.id} onClick={() => select(item.id)}>{item.name}</button>}</For></nav>
              <div class="t-shelf-content" aria-live="polite" aria-busy={page.resource.state().status === "loading"}>
                <Show when={page.resource.state().status !== "loading"} fallback={<p>加载中...</p>}>
                  <Show when={page.resource.state().status !== "error"} fallback={<p role="alert">文章加载失败，请重试。</p>}>
                    <Show when={(data()?.articles.length ?? 0) > 0} fallback={<p>当前分类还没有文章</p>}>
                      <p>共 {data()?.total ?? 0} 篇</p>
                      <For each={data()?.articles ?? []}>{(article) => <a class="archive-row" href={detailHref(article.id)}><time>{article.updatedAt.slice(0, 10)}</time><div><h3>{article.title || "未命名文章"}</h3><div class="tag-line"><For each={article.terms.slice(0, 3)}>{(term) => <span class="tag">{term.name}</span>}</For></div></div><span>{article.articleType?.name ?? "阅读全文"} →</span></a>}</For>
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
