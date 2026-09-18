import { For, Show } from "solid-js";
import { Button, StateMessage } from "../../../desktop-ui";
import type { ArticleType } from "../../../common/contracts/domain";
import {
  publicArticleDetailHref,
  type QueryReadonly,
  type TShelfArticle,
  type TShelfFilter,
} from "../../../solid/queries";
import { shortDate } from "./format";

type PublicShelfArticle = QueryReadonly<TShelfArticle> & {
  readonly articleTypeId?: number;
  readonly articleType?: ArticleType;
};

function PublicShelf(props: {
  items: readonly PublicShelfArticle[];
  variant: "archive" | "recommended";
}) {
  return (
    <div class={`list list-${props.variant}`}>
      <For each={props.items}>
        {(article, index) => (
          <a class="archive-row" href={publicArticleDetailHref(article.id)}>
            <div class="archive-index">
              <strong>{String(index() + 1).padStart(2, "0")}</strong>
              <time>{shortDate(article.updatedAt)}</time>
            </div>
            <div class="archive-copy">
              {props.variant === "recommended" && index() === 0 && (
                <span class="feature-label">近期精选</span>
              )}
              <h3>{article.title || "未命名文章"}</h3>
              <div class="tag-line">
                <For each={article.terms.slice(0, 3)}>
                  {(term) => <span class="tag">{term.name}</span>}
                </For>
              </div>
            </div>
            <div class="archive-type">
              <span>{article.articleType?.name ?? "阅读全文"}</span>
              <span aria-hidden="true">→</span>
            </div>
          </a>
        )}
      </For>
    </div>
  );
}

/** 公开端 T 型货架：顶部类型筛选 + 当前类型的有界文章集合。 */
export function TShelf(props: {
  filters: readonly QueryReadonly<TShelfFilter>[];
  selectedFilterId: string;
  articles: readonly QueryReadonly<TShelfArticle>[];
  total: number | undefined;
  loading: boolean;
  error: boolean;
  variant: "archive" | "recommended";
  onSelect: (filterId: string) => void;
  onRetry: () => void;
}) {
  return (
    <div class="t-shelf">
      <nav class="t-shelf-filters" aria-label="文章类型筛选">
        <For each={props.filters}>
          {(filter) => (
            <button
              type="button"
              aria-pressed={props.selectedFilterId === filter.id}
              onClick={() => props.onSelect(filter.id)}
            >
              {filter.name}
            </button>
          )}
        </For>
      </nav>
      <div class="t-shelf-content" aria-live="polite" aria-busy={props.loading}>
        <Show
          when={!props.loading}
          fallback={<StateMessage content="加载中..." kind="loading" />}
        >
          <Show
            when={!props.error}
            fallback={
              <StateMessage
                content={
                  <>
                    <span>文章加载失败，请重试。</span>
                    <Button
                      content="重试"
                      options={{
                        onClick: props.onRetry,
                        variant: "secondary",
                      }}
                    />
                  </>
                }
                kind="error"
              />
            }
          >
            <Show
              when={props.articles.length > 0}
              fallback={
                <StateMessage content="当前分类还没有文章" kind="empty" />
              }
            >
              <div class="t-shelf-count">共 {props.total ?? 0} 篇</div>
              <PublicShelf items={props.articles} variant={props.variant} />
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  );
}
