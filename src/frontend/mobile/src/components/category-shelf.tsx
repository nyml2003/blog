import { For, Show } from "solid-js";
import { Text } from "../../../mobile-ui/atoms";
import { TabGroup, type TabItem } from "../../../mobile-ui/molecules";
import {
  allChildCategoriesId,
  childCategories,
  rootCategories,
  type CategoryNode,
  type CategorySelection,
  type CategoryShelfCard,
  type CategoryTree,
} from "../logic/category-browser";
import { ArticleCard, StateMessage } from "./index";

const tabs = (categories: readonly CategoryNode[]): readonly TabItem[] =>
  categories.map((category) => ({
    id: String(category.id),
    label: category.name,
  }));

export function CategoryShelfView(p: {
  taxonomy: CategoryTree;
  selection: CategorySelection;
  articles: readonly CategoryShelfCard[];
  total: number;
  loading: boolean;
  error: boolean;
  onSelectRoot: (categoryId: number) => void;
  onSelectChild: (categoryId: number | undefined) => void;
  onRetry: () => void;
}) {
  const children = () => childCategories(p.taxonomy, p.selection.rootId);
  const childTabs = (): readonly TabItem[] => [
    { id: allChildCategoriesId, label: "全部" },
    ...tabs(children()),
  ];
  const selectedChildId = () =>
    p.selection.childId === undefined
      ? allChildCategoriesId
      : String(p.selection.childId);
  const selectChild = (id: string) => {
    if (id === allChildCategoriesId) {
      p.onSelectChild(undefined);
      return;
    }
    p.onSelectChild(Number(id));
  };

  return (
    <div class="category-shelf-layout">
      <nav class="category-shelf-roots" aria-label="一级分类">
        <TabGroup
          items={tabs(rootCategories(p.taxonomy))}
          onChange={(id) => p.onSelectRoot(Number(id))}
          selectedId={String(p.selection.rootId)}
          ariaLabel="一级分类"
          options={{ orientation: "vertical" }}
        />
      </nav>
      <section class="category-shelf-content" aria-label="分类文章">
        <div class="category-shelf-children">
          <Text
            content="二级分类"
            options={{ as: "p", tone: "accent", size: "meta" }}
          />
          <TabGroup
            items={childTabs()}
            onChange={selectChild}
            selectedId={selectedChildId()}
            ariaLabel="二级分类"
            options={{ orientation: "horizontal" }}
          />
        </div>
        <div
          class="category-shelf-results"
          aria-live="polite"
          aria-busy={p.loading}
        >
          <Show
            when={!p.loading}
            fallback={<StateMessage kind="loading" text="正在加载分类文章…" />}
          >
            <Show
              when={!p.error}
              fallback={
                <StateMessage
                  kind="error"
                  text="分类文章加载失败，请稍后重试"
                  onRetry={p.onRetry}
                />
              }
            >
              <Show
                when={p.articles.length > 0}
                fallback={
                  <StateMessage kind="empty" text="当前分类还没有文章" />
                }
              >
                <Text
                  content={`共 ${p.total} 篇`}
                  options={{ as: "p", tone: "muted", size: "meta" }}
                />
                <div class="category-shelf-cards">
                  <For each={p.articles}>
                    {(article) => <ArticleCard article={article} />}
                  </For>
                </div>
              </Show>
            </Show>
          </Show>
        </div>
      </section>
    </div>
  );
}
