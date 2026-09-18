import { For, Show } from "solid-js";
import type { MobilePageContext } from "../context";
import { route } from "../context";
import { Heading, Tag, Text } from "../ui";

export interface ArticleCardProps {
  readonly article: {
    readonly id: number;
    readonly title: string;
    readonly summary: string;
    readonly updatedAt: string;
    readonly terms: readonly {
      readonly id: number;
      readonly name: string;
      readonly kind: "topic" | "tag";
    }[];
  };
  readonly context: MobilePageContext;
}

export function ArticleCard(props: ArticleCardProps) {
  const terms = () => props.article.terms;
  return (
    <a
      class="article-card"
      href={`${route(props.context.routes, "mobile-article-detail")}?id=${props.article.id}`}
    >
      <Show when={terms().length > 0}>
        <p class="article-card-type">
          <Text
            content={terms()[0]?.name ?? "文章"}
            options={{ tone: "accent", size: "meta" }}
          />
        </p>
      </Show>
      <Heading
        content={props.article.title}
        options={{ as: "h3", size: "card" }}
      />
      <p
        class={`article-card-summary${props.article.summary ? "" : " is-empty"}`}
      >
        <Text
          content={props.article.summary || "暂无摘要"}
          options={{ as: "span", tone: "muted", size: "meta" }}
        />
      </p>
      <div class="article-card-meta">
        <span class="article-card-tags">
          <For each={terms().slice(0, 2)}>
            {(term) => <Tag content={term.name} options={{}} />}
          </For>
          <Show when={terms().length > 2}>
            <Tag content={`+${terms().length - 2}`} options={{}} />
          </Show>
        </span>
        <time>{props.article.updatedAt.slice(0, 10)}</time>
      </div>
    </a>
  );
}
