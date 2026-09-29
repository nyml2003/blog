import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type Component,
} from "solid-js";
import type { MobilePageContext } from "../context";
import type { CategoryShelf } from "../../api/mobile";
import type { DeepReadonly } from "../../../kernel";
import { useMobileResource } from "../resource";
import { ArticleCard } from "../components";
import { Heading, StateMessage, Text } from "../ui";
import { MobileShell } from "./shared";
import {
  categoryHref,
  categoryIdFromSearch,
  categoryRequestId,
  categorySelection,
  type CategorySelection,
} from "../logic/category";

function categoryNavigation(
  context: MobilePageContext,
  selection: CategorySelection,
): void {
  const current = context.navigation.current();
  context.navigation.push(categoryHref(current.pathname, selection), {
    ...(typeof current.state === "object" && current.state !== null
      ? current.state
      : {}),
  });
}

export function createMobileArticlesPage(
  context: MobilePageContext,
  title: string,
): Component {
  return function MobileArticlesPage() {
    const [requestedId, setRequestedId] = createSignal(
      categoryIdFromSearch(context.navigation.current().search),
    );
    const resource = useMobileResource(() =>
      context.api.categoryShelf.get(requestedId()),
    );
    let started = false;
    createEffect(() => {
      requestedId();
      if (!started) {
        started = true;
        void resource.start();
        return;
      }
      void resource.refetch();
    });
    const current = createMemo(
      () => resource.state().snapshot ?? resource.state().latest,
    );
    const selection = createMemo(() => {
      const model = current();
      return model === undefined
        ? undefined
        : categorySelection(model, requestedId());
    });
    const onPopState = () =>
      setRequestedId(categoryIdFromSearch(context.navigation.current().search));
    const popHandle = context.navigation.subscribePopState(onPopState);
    onCleanup(() => popHandle.release());
    const select = (next: CategorySelection) => {
      setRequestedId(categoryRequestId(next));
      categoryNavigation(context, next);
    };
    return (
      <MobileShell context={context} activeId="articles">
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
            const model = current();
            if (resource.state().error !== undefined) {
              return (
                <StateMessage
                  kind="error"
                  text="分类加载失败，请稍后重试"
                  onRetry={() => void resource.refetch()}
                />
              );
            }
            if (model === undefined)
              return resource.state().status === "loading" ? (
                <StateMessage
                  kind="loading"
                  text="正在加载分类…"
                  onRetry={undefined}
                />
              ) : (
                <StateMessage
                  kind="error"
                  text="分类加载失败，请稍后重试"
                  onRetry={() => void resource.refetch()}
                />
              );
            const selected = selection();
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
                    onSelect={select}
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

function rootCategoryName(
  model: DeepReadonly<CategoryShelf>,
  categoryId: number | undefined,
): string | undefined {
  if (categoryId === undefined) return undefined;
  let current = model.taxonomy.categories.find(
    (category) => category.id === categoryId,
  );
  while (current !== undefined && current.parentId !== undefined) {
    const parentId = current.parentId;
    current = model.taxonomy.categories.find(
      (category) => category.id === parentId,
    );
  }
  return current?.name;
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
