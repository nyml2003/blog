import { For, Show } from "solid-js";
import { definePage } from "../../../solid/page";
import { Heading, Link, Tag, Text } from "../../../mobile-ui/atoms";
import { usePublishedArticle } from "../../../solid/queries";
import { StateMessage, ArticleBody, pageStyles } from "../components/ui";
import "../../styles/app.css";

const displayDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(value))
    : "-";

const cameFromArticleList = () => {
  if (!document.referrer || history.length <= 1) return false;
  try {
    const referrer = new URL(document.referrer);
    return (
      referrer.origin === location.origin &&
      referrer.pathname === "/m/articles/index.html"
    );
  } catch {
    return false;
  }
};

const returnToArticleList = (event: MouseEvent) => {
  if (!cameFromArticleList()) return;
  event.preventDefault();
  history.back();
};

const App = () => {
  const id = new URLSearchParams(location.search).get("id");
  const article = usePublishedArticle(() => id);
  return (
    <div class="mobile-shell">
      {pageStyles()}
      <header class="reading-bar">
        <Link
          content="← 文章库"
          href="/m/articles/index.html"
          options={{ onClick: returnToArticleList }}
        />
        <span>阅读</span>
      </header>
      <main id="main" class="mobile-main detail-main">
        <Show
          when={!article.loading()}
          fallback={<StateMessage kind="loading" text="正在加载文章…" />}
        >
          <Show
            when={!article.error() && article.snapshot()}
            fallback={
              <StateMessage
                kind="error"
                text="文章不存在或暂不可见"
                onRetry={() => void article.refetch()}
              />
            }
          >
            <article class="mobile-article">
              <header class="detail-header">
                <Text
                  content={article.snapshot()?.articleType?.name ?? "文章"}
                  options={{ tone: "accent", size: "meta" }}
                />
                <Heading
                  content={article.snapshot()?.title ?? ""}
                  options={{ as: "h1", size: "page" }}
                />
                <Show when={article.snapshot()?.summary}>
                  <Text
                    content={article.snapshot()?.summary ?? ""}
                    options={{ as: "p", tone: "muted", size: "body" }}
                  />
                </Show>
                <p class="detail-meta">
                  <For each={article.snapshot()?.terms?.slice(0, 2) ?? []}>
                    {(term) => <Tag content={term.name} options={{}} />}
                  </For>
                  <Show when={(article.snapshot()?.terms?.length ?? 0) > 2}>
                    <span>
                      +
                      {Math.max(
                        0,
                        (article.snapshot()?.terms?.length ?? 0) - 2,
                      )}
                    </span>
                  </Show>
                  <time dateTime={article.snapshot()?.updatedAt}>
                    更新于 {displayDate(article.snapshot()?.updatedAt)}
                  </time>
                </p>
              </header>
              <ArticleBody html={article.snapshot()?.contentHtml ?? ""} />
              <footer class="detail-footer">
                <Link
                  content="← 返回文章库"
                  href="/m/articles/index.html"
                  options={{ onClick: returnToArticleList }}
                />
              </footer>
            </article>
          </Show>
        </Show>
      </main>
    </div>
  );
};
definePage(App);
