import { For, Show } from "solid-js";
import { Heading, Tag, Text } from "../../../mobile-ui/atoms";
import type { Article } from "../../../common/contracts/domain";
import { mobileArticleDetailHref } from "../../../solid/queries";
import { shortDate } from "./shelf-format";

/** 平铺检索页的文章行（整行进入详情）。 */
export function ArticleRow(p: { article: Article }) {
  const tags = () => p.article.terms?.slice(0, 2) ?? [];
  const extraTags = () => Math.max(0, (p.article.terms?.length ?? 0) - 2);
  return (
    <a class="article-row" href={mobileArticleDetailHref(p.article.id)}>
      <div class="row-anchor">
        <Text
          content={p.article.articleType?.name ?? "文章"}
          options={{ tone: "accent", size: "meta" }}
        />
      </div>
      <div class="row-top">
        <Heading
          content={p.article.title}
          options={{ as: "h2", size: "card" }}
        />
      </div>
      <p class={`row-summary${p.article.summary ? "" : " is-empty"}`}>
        <Text
          content={p.article.summary || "暂无摘要"}
          options={{ as: "span", tone: "muted", size: "meta" }}
        />
      </p>
      <div class="row-meta">
        <span class="row-tags">
          <For each={tags()}>
            {(t) => <Tag content={t.name} options={{}} />}
          </For>
          <Show when={extraTags()}>
            {" "}
            <Tag content={`+${extraTags()}`} options={{}} />
          </Show>
        </span>
        <time>{shortDate(p.article.updatedAt)}</time>
      </div>
    </a>
  );
}
