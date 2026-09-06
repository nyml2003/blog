import { For, Show } from "solid-js";
import { render } from "solid-js/web";
import {
  browserClient as client,
  type Article,
  type ArticleId,
} from "../../../common/client";
import type { DataError } from "../../../common/data/errors";
import { err } from "../../../common/data/result";
import { createDataTask } from "../../../common/data/task";
import { useDataResource } from "../../../solid/data";
import { StateMessage, ArticleBody, pageStyles } from "../components/ui";
import "../../styles.css";

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
  const id = new URLSearchParams(location.search).get("id") ?? "";
  const article = useDataResource<Article, string, DataError>(
    () => id,
    (articleId) => {
      const parsedId = Number(articleId);
      const hasValidId =
        articleId !== "" && Number.isInteger(parsedId) && parsedId > 0;
      if (!hasValidId)
        return createDataTask<Article, DataError>(async () =>
          err({ kind: "protocol", message: "缺少文章 ID" }),
        );
      return client.articleCatalog.getPublishedArticle(parsedId as ArticleId);
    },
  );
  return (
    <div class="mobile-shell">
      {pageStyles()}
      <header class="reading-bar">
        <a href="/m/articles/index.html" onClick={returnToArticleList}>
          ← 文章库
        </a>
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
                <p class="eyebrow">
                  {article.snapshot()?.articleType?.name ?? "文章"}
                </p>
                <h1>{article.snapshot()?.title}</h1>
                <Show when={article.snapshot()?.summary}>
                  <p class="detail-summary">{article.snapshot()?.summary}</p>
                </Show>
                <p class="detail-meta">
                  <For each={article.snapshot()?.terms?.slice(0, 2) ?? []}>
                    {(term) => <span>{term.name}</span>}
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
                <a href="/m/articles/index.html" onClick={returnToArticleList}>
                  ← 返回文章库
                </a>
              </footer>
            </article>
          </Show>
        </Show>
      </main>
    </div>
  );
};
render(() => <App />, document.getElementById("app")!);
