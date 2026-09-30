import { ArrowLeft } from "lucide-solid";
import { For, Show, type Component } from "solid-js";
import type { DesktopPageContext } from "../context";
import { route } from "../context";
import { useDesktopArticle } from "../logic/detail";
import { ArticleBody } from "../components/article-body";

function articleId(search: string): number | undefined {
  const raw = new URLSearchParams(search).get("id");
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function createDesktopDetailPage(input: DesktopPageContext): Component {
  return function DesktopDetailPage() {
    const page = useDesktopArticle(
      input.api,
      articleId(input.navigation.current().search),
    );
    const archiveHref = route(input.routes, "desktop-public-articles");
    const homeHref = route(input.routes, "desktop-public-home");
    if (page.kind === "invalid")
      return (
        <div class="desktop-home">
          <main id="main">
            <p role="alert">文章编号无效。</p>
            <a class="back-link" href={archiveHref}>
              返回文章档案
            </a>
          </main>
        </div>
      );
    const article = () => page.resource.state().snapshot;
    return (
      <div class="desktop-home">
        <header class="topbar">
          <a class="brand" href={homeHref}>
            <span class="brand-kicker">FIELD NOTES</span>
            <strong>技术知识库</strong>
          </a>
          <nav class="nav" aria-label="主导航">
            <a href={homeHref}>首页</a>
            <a href={archiveHref}>全部文章</a>
          </nav>
        </header>
        <main id="main">
          <Show
            when={article()}
            fallback={<p role="alert">文章加载中或不存在。</p>}
          >
            {(value) => (
              <article class="article">
                <a class="back-link" href={archiveHref}>
                  <ArrowLeft size={18} aria-hidden="true" />
                  <span>返回文章档案</span>
                </a>
                <p class="eyebrow">
                  {value().articleType?.name ??
                    `类型 #${value().articleTypeId}`}
                </p>
                <h1>{value().title}</h1>
                <div class="meta">
                  <span>
                    发布于 {value().publishedAt?.slice(0, 10) ?? "未知日期"}
                  </span>
                  <For each={value().terms ?? []}>
                    {(term) => <span class="tag">{term.name}</span>}
                  </For>
                </div>
                <div class="article-accent" aria-hidden="true" />
                <ArticleBody html={value().contentHtml} />
                <footer class="article-footer">
                  <a href={archiveHref}>
                    <ArrowLeft size={18} aria-hidden="true" />
                    <span>返回文章档案</span>
                  </a>
                  <span>FIELD NOTES</span>
                </footer>
              </article>
            )}
          </Show>
        </main>
      </div>
    );
  };
}
