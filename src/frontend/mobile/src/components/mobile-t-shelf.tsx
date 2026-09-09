import { For, Show } from "solid-js";
import {
  StateMessage,
  TabGroup,
  type TabItem,
} from "../../../mobile-ui/molecules";
import type {
  QueryReadonly,
  TShelfArticle,
  TShelfFilter,
} from "../../../solid/queries";
import { ArticleCard } from "./article-card";

/** Mobile 推荐货架：类型筛选 + 当前类型的有界文章集合。 */
export function MobileTShelf(p: {
  filters: readonly QueryReadonly<TShelfFilter>[];
  selectedFilterId: string;
  articles: readonly QueryReadonly<TShelfArticle>[];
  total: number | undefined;
  loading: boolean;
  error: boolean;
  onSelect: (filterId: string) => void;
  onRetry: () => void;
}) {
  return (
    <section class="mobile-t-shelf" aria-label="推荐文章">
      <div class="mobile-t-shelf-filters">
        <TabGroup
          items={p.filters.map(
            (filter): TabItem => ({ id: filter.id, label: filter.name }),
          )}
          onChange={p.onSelect}
          selectedId={p.selectedFilterId}
          ariaLabel="文章类型筛选"
          options={{ orientation: "horizontal" }}
        />
      </div>
      <div
        class="mobile-t-shelf-content"
        aria-live="polite"
        aria-busy={p.loading}
      >
        <Show
          when={!p.loading}
          fallback={<StateMessage kind="loading" text="正在加载推荐内容…" />}
        >
          <Show
            when={!p.error}
            fallback={
              <StateMessage
                kind="error"
                text="推荐内容加载失败"
                onRetry={p.onRetry}
              />
            }
          >
            <Show
              when={p.articles.length > 0}
              fallback={<StateMessage kind="empty" text="当前分类还没有文章" />}
            >
              <p class="mobile-t-shelf-count">共 {p.total ?? 0} 篇</p>
              <div class="article-list">
                <For each={p.articles}>
                  {(article) => <ArticleCard article={article} />}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </section>
  );
}
