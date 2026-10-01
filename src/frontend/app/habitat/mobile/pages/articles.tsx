import { type Component } from "solid-js";
import type { MobileRouteContext } from "../context";
import type { MobileApi } from "../../api/mobile";
import {
  type DocumentPort,
  type NavigationPort,
  type PersistencePort,
} from "@fluvient-loom/port";
import type { CategoryShelf } from "../../api/mobile";
import { type DeepReadonly } from "@fluvient-loom/common";
import { useMobileArticles, rootCategoryName } from "../logic/articles";
import { ArticleCard } from "../components";
import { Heading, StateMessage, Text } from "../ui";
import { MobileShell } from "./shared";
import type { CategorySelection } from "../logic/category";

export interface MobileArticlesPageInput extends MobileRouteContext {
  readonly api: Pick<MobileApi, "page">;
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
        </header>
        <div class="category-shelf-content">
          {(() => {
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
