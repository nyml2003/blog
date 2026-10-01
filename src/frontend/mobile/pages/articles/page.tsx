import { type DeepReadonly } from "@fluvient/core";
import { findTextMatches } from "@fluvient-loom/text-highlight";
import {
  type DocumentPort,
  type NavigationPort,
  type PersistencePort,
} from "@fluvient-loom/port";
import { type Component, For, Show } from "solid-js";
import type { CategorySelection } from "../../features/articles/category";
import {
  rootCategoryName,
  useMobileArticles,
} from "../../features/articles/model";
import { searchQuery, useMobileSearch } from "../../features/search/model";
import type { CategoryShelf, MobileApi } from "../../foundation/api";
import type { MobileRouteContext } from "../../foundation/context";
import { routeWithQuery } from "../../foundation/context";
import { Heading, StateMessage, Text } from "../../foundation/ui";
import { ArticleCard } from "../../widgets/article-card/ui";
import { MobileShell } from "../../widgets/shell/ui";

export interface MobileArticlesPageInput extends MobileRouteContext {
  readonly api: Pick<MobileApi, "page" | "search">;
  readonly navigation: NavigationPort;
  readonly persistence: PersistencePort;
  readonly document: DocumentPort;
  readonly share: (url: string) => Promise<void>;
}

export function createMobileArticlesPage(
  input: MobileArticlesPageInput,
  title: string,
): Component {
  return function MobileArticlesPage() {
    const articles = useMobileArticles(input);
    const query = searchQuery(input.navigation.current().search);
    const search = useMobileSearch({ api: input.api, query });
    const detailHref = (id: number) =>
      routeWithQuery(input.routes, "mobile-article-detail", { id, q: query });
    return (
      <MobileShell
        context={input}
        activeId="articles"
        navigation={articles.navigation()}
        browserNavigation={input.navigation}
        persistence={input.persistence}
        document={input.document}
        share={input.share}
      >
        <header class="page-heading">
          <Text content="文章库" options={{ tone: "accent", size: "meta" }} />
          <Heading content={title} options={{ as: "h1", size: "page" }} />
          <Text
            content="从一级领域进入，再用二级分类收窄文章。"
            options={{ as: "p", tone: "muted", size: "meta" }}
          />
          <form class="article-search" method="get">
            <label for="article-search-query">搜索文章</label>
            <input
              id="article-search-query"
              name="q"
              type="search"
              value={query}
              placeholder="标题、摘要或正文"
            />
            <button type="submit">搜索</button>
          </form>
        </header>
        <div class="category-shelf-content">
          <Show when={query !== ""}>
            <section class="search-results" aria-live="polite">
              <Show
                when={search.state().status !== "loading"}
                fallback={
                  <StateMessage
                    kind="loading"
                    text="正在搜索…"
                    onRetry={undefined}
                  />
                }
              >
                <Show
                  when={search.state().snapshot !== undefined}
                  fallback={
                    <StateMessage
                      kind="error"
                      text="搜索失败，请稍后重试"
                      onRetry={() => void search.refetch()}
                    />
                  }
                >
                  <p>找到 {search.state().snapshot?.total ?? 0} 篇文章</p>
                  <For each={search.state().snapshot?.items ?? []}>
                    {(article) => (
                      <a
                        class="article-search-result"
                        href={detailHref(article.id)}
                      >
                        <strong>
                          <HighlightedText text={article.title} query={query} />
                        </strong>
                        <span>
                          <HighlightedText
                            text={article.summary}
                            query={query}
                          />
                        </span>
                      </a>
                    )}
                  </For>
                </Show>
              </Show>
            </section>
          </Show>
          {(() => {
            if (query !== "") return null;
            const model = articles.current();
            if (articles.resource.state().error !== undefined) {
              return (
                <StateMessage
                  kind="error"
                  text="分类加载失败，请稍后重试"
                  onRetry={articles.retry}
                />
              );
            }
            if (model === undefined)
              return articles.resource.state().status === "loading" ? (
                <StateMessage
                  kind="loading"
                  text="正在加载分类…"
                  onRetry={undefined}
                />
              ) : (
                <StateMessage
                  kind="error"
                  text="分类加载失败，请稍后重试"
                  onRetry={articles.retry}
                />
              );
            const selected = articles.selection();
            if (selected === undefined)
              return (
                <StateMessage
                  kind="empty"
                  text="暂无可浏览分类"
                  onRetry={undefined}
                />
              );
            return (
              <section class="category-shelf">
                <div class="category-shelf-tabs">
                  <ForCategories
                    model={model}
                    selection={selected}
                    onSelect={articles.select}
                  />
                </div>
                <div class="article-list">
                  {model.articles.map((article) => {
                    const categoryId = article.categoryIds[0];
                    const typeName = rootCategoryName(model, categoryId);
                    return (
                      <ArticleCard
                        href={article.href}
                        article={{
                          id: article.id,
                          title: article.title,
                          summary: article.summary,
                          updatedAt: article.updatedAt,
                          terms:
                            categoryId === undefined || typeName === undefined
                              ? []
                              : [
                                  {
                                    id: categoryId,
                                    name: typeName,
                                    kind: "topic",
                                  },
                                ],
                        }}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })()}
        </div>
      </MobileShell>
    );
  };
}

function HighlightedText(props: {
  readonly text: string;
  readonly query: string;
}) {
  const matches = findTextMatches(props.text, props.query).matches;
  const parts: Array<{ readonly value: string; readonly hit: boolean }> = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor)
      parts.push({ value: props.text.slice(cursor, match.start), hit: false });
    parts.push({ value: props.text.slice(match.start, match.end), hit: true });
    cursor = match.end;
  }
  if (cursor < props.text.length)
    parts.push({ value: props.text.slice(cursor), hit: false });
  return (
    <>
      {parts.map((part) => (part.hit ? <mark>{part.value}</mark> : part.value))}
    </>
  );
}

function ForCategories(props: {
  readonly model: DeepReadonly<CategoryShelf>;
  readonly selection: CategorySelection;
  readonly onSelect: (selection: CategorySelection) => void;
}) {
  const roots = props.model.taxonomy.categories.filter(
    (category) => category.parentId === undefined,
  );
  const children = props.model.taxonomy.categories.filter(
    (category) => category.parentId === props.selection.rootId,
  );
  return (
    <div class="category-controls">
      <div class="category-root-list">
        {roots.map((root) => (
          <button
            type="button"
            class={
              root.id === props.selection.rootId
                ? "m-atom-tab m-atom-tab--vertical is-selected"
                : "m-atom-tab m-atom-tab--vertical"
            }
            onClick={() =>
              props.onSelect({ rootId: root.id, childId: undefined })
            }
          >
            {root.name}
          </button>
        ))}
      </div>
      <div class="category-child-list">
        <button
          type="button"
          class={
            !props.selection.childId ? "m-atom-chip is-selected" : "m-atom-chip"
          }
          onClick={() =>
            props.onSelect({
              rootId: props.selection.rootId,
              childId: undefined,
            })
          }
        >
          全部
        </button>
        {children.map((child) => (
          <button
            type="button"
            class={
              child.id === props.selection.childId
                ? "m-atom-chip is-selected"
                : "m-atom-chip"
            }
            onClick={() =>
              props.onSelect({
                rootId: props.selection.rootId,
                childId: child.id,
              })
            }
          >
            {child.name}
          </button>
        ))}
      </div>
    </div>
  );
}
