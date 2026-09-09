import { For, Show } from "solid-js";
import { Heading, Tag, Text } from "../../../mobile-ui/atoms";
import { mobileArticleDetailHref } from "../../../solid/queries";
import { shortDate, type ArticleCardArticle } from "./shelf-format";

/** 货架分区与平铺页共用的单一卡片形态（样式在 pages.css 的 `.article-card`）。 */
export function ArticleCard(p: { article: ArticleCardArticle }) {
  const terms = () => p.article.terms ?? [];
  const visibleTags = () => terms().slice(0, 2);
  const extraTags = () => Math.max(0, terms().length - 2);
  return (
    <a class="article-card" href={mobileArticleDetailHref(p.article.id)}>
      <Show when={p.article.articleType}>
        {(type) => (
          <p class="article-card-type">
            <Text
              content={type().name}
              options={{ tone: "accent", size: "meta" }}
            />
          </p>
        )}
      </Show>
      <Heading content={p.article.title} options={{ as: "h3", size: "card" }} />
      <p class={`article-card-summary${p.article.summary ? "" : " is-empty"}`}>
        <Text
          content={p.article.summary || "暂无摘要"}
          options={{ as: "span", tone: "muted", size: "meta" }}
        />
      </p>
      <div class="article-card-meta">
        <span class="article-card-tags">
          <For each={visibleTags()}>
            {(term) => <Tag content={term.name} options={{}} />}
          </For>
          <Show when={extraTags() > 0}>
            <Tag content={`+${extraTags()}`} options={{}} />
          </Show>
        </span>
        <time>{shortDate(p.article.updatedAt)}</time>
      </div>
    </a>
  );
}
