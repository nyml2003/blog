import { For, Show } from "solid-js";
import { definePage } from "../../../solid/page";
import { Heading, Link, Tag, Text } from "../../../mobile-ui/atoms";
import { useAdminArticle, adminArticleEditHref } from "../../../solid/queries";
import { ArticleBody, StateMessage } from "../components";
import "../../styles/app.css";

const displayDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(value))
    : "-";
const App = () => {
  const id = new URLSearchParams(location.search).get("id");
  const article = useAdminArticle(() => id);
  const savedArticle = () => {
    const value = article.snapshot();
    if (article.loading() || !value || value.htmlInspection.valid !== true)
      return undefined;
    return value;
  };
  const previewStatus = () => {
    const saved = savedArticle();
    if (!saved) return "正在读取";
    return saved.status === "published" ? "已发布" : "草稿";
  };
  return (
    <div class="mobile-shell mobile-preview-page">
      <header class="reading-bar">
        <Link
          content="← 返回编辑"
          href={adminArticleEditHref(id ?? "")}
          options={{}}
        />
        <span>已保存版本 · {previewStatus()}</span>
      </header>
      <main id="main" class="mobile-main detail-main">
        <Show
          when={savedArticle()}
          fallback={
            <StateMessage
              kind="error"
              text="文章不存在、校验未通过或暂不可见"
            />
          }
        >
          {(saved) => (
            <article class="mobile-article">
              <header class="detail-header">
                <Text
                  content={saved().articleType?.name ?? "文章"}
                  options={{ tone: "accent", size: "meta" }}
                />
                <Heading
                  content={saved().title}
                  options={{ as: "h1", size: "page" }}
                />
                <Show when={saved().summary}>
                  <Text
                    content={saved().summary}
                    options={{ as: "p", tone: "muted", size: "body" }}
                  />
                </Show>
                <p class="detail-meta">
                  <For each={saved().terms ?? []}>
                    {(term) => <Tag content={term.name} options={{}} />}
                  </For>
                  <time dateTime={saved().updatedAt}>
                    更新于 {displayDate(saved().updatedAt)}
                  </time>
                </p>
              </header>
              <ArticleBody html={saved().contentHtml} />
              <footer class="detail-footer">
                <Link
                  content="← 返回编辑"
                  href={adminArticleEditHref(id ?? "")}
                  options={{}}
                />
              </footer>
            </article>
          )}
        </Show>
      </main>
    </div>
  );
};
definePage(App);
