import { For, Show } from "solid-js";
import { definePage } from "../../../../solid/page";
import {
  usePublishedArticle,
  publicArchiveHref,
} from "../../../../solid/queries";
import { ArticleBody, date, Header, qs } from "../../shell";

const App = () => {
  const id = qs().get("id");
  const article = usePublishedArticle(() => id);
  return (
    <div class="shell">
      <Header />
      <main id="main">
        <Show
          when={article.snapshot()}
          fallback={<div class="state">加载中或文章不存在</div>}
        >
          {(x) => (
            <article class="article">
              <a class="back-link" href={publicArchiveHref()}>
                ← 返回文章档案
              </a>
              <p class="eyebrow">
                {x().articleType?.name ?? `类型 #${x().articleTypeId}`}
              </p>
              <h1>{x().title}</h1>
              <div class="meta">
                <span>发布于 {date(x().publishedAt)}</span>
                <For each={x().terms ?? []}>
                  {(term) => <span class="tag">{term.name}</span>}
                </For>
              </div>
              <div class="article-accent" aria-hidden="true" />
              <ArticleBody html={x().contentHtml} />
              <footer class="article-footer">
                <a href={publicArchiveHref()}>← 返回文章档案</a>
                <span>FIELD NOTES</span>
              </footer>
            </article>
          )}
        </Show>
      </main>
    </div>
  );
};
definePage(App);
