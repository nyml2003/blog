import { ArrowLeft } from "lucide-solid";
import { For, Show } from "solid-js";
import { StateMessage } from "../../../../desktop-ui";
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
          fallback={<StateMessage content="加载中或文章不存在" kind="empty" />}
        >
          {(x) => (
            <article class="article">
              <a class="back-link" href={publicArchiveHref()}>
                <ArrowLeft size={18} aria-hidden="true" />
                <span>返回文章档案</span>
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
                <a href={publicArchiveHref()}>
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
definePage(App);
