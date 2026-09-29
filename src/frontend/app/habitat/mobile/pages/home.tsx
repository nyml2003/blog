import { ArrowRight } from "lucide-solid";
import { For, Show, createEffect, createSignal } from "solid-js";
import type { Component } from "solid-js";
import type { MobilePageContext } from "../context";
import { route } from "../context";
import { useMobileResource } from "../resource";
import { ArticleCard } from "../components";
import { Heading, Link, StateMessage, TabGroup, Text } from "../ui";
import { MobileShell } from "./shared";

export function createMobileHomePage(context: MobilePageContext): Component {
  return function MobileHomePage() {
    const [selection, setSelection] = createSignal({
      surface: "recommendation" as const,
      filterId: "all",
    });
    const resource = useMobileResource(() =>
      context.api.tShelf.get(selection()),
    );
    let started = false;
    createEffect(() => {
      selection();
      if (!started) {
        started = true;
        void resource.start();
        return;
      }
      void resource.refetch();
    });
    const snapshot = () => resource.state().snapshot ?? resource.state().latest;
    return (
      <MobileShell context={context} activeId="home">
        <header class="page-heading">
          <Text
            content="技术知识库"
            options={{ tone: "accent", size: "meta" }}
          />
          <Heading content="推荐阅读" options={{ as: "h1", size: "page" }} />
          <Text
            content="从最近沉淀的实践中，挑选值得反复阅读的内容。"
            options={{ as: "p", tone: "muted", size: "meta" }}
          />
        </header>
        <section class="mobile-t-shelf" aria-label="推荐文章">
          <TabGroup
            items={(snapshot()?.filters ?? []).map((filter) => ({
              id: filter.id,
              label: filter.name,
            }))}
            selectedId={selection().filterId}
            onChange={(filterId) =>
              setSelection({ surface: "recommendation", filterId })
            }
            ariaLabel="文章类型筛选"
            orientation="horizontal"
          />
          <div
            class="mobile-t-shelf-content"
            aria-live="polite"
            aria-busy={resource.state().status === "loading"}
          >
            <Show
              when={resource.state().status !== "loading"}
              fallback={
                <StateMessage
                  kind="loading"
                  text="正在加载推荐内容…"
                  onRetry={undefined}
                />
              }
            >
              <Show
                when={resource.state().error === undefined}
                fallback={
                  <StateMessage
                    kind="error"
                    text="推荐内容加载失败"
                    onRetry={() => void resource.refetch()}
                  />
                }
              >
                <Show
                  when={(snapshot()?.articles.length ?? 0) > 0}
                  fallback={
                    <StateMessage
                      kind="empty"
                      text="当前分类还没有文章"
                      onRetry={undefined}
                    />
                  }
                >
                  <p class="mobile-t-shelf-count">
                    共 {snapshot()?.total ?? 0} 篇
                  </p>
                  <div class="article-list">
                    <For each={snapshot()?.articles ?? []}>
                      {(article) => (
                        <ArticleCard article={article} href={article.href} />
                      )}
                    </For>
                  </div>
                </Show>
              </Show>
            </Show>
          </div>
        </section>
        <div class="primary-action">
          <Link
            content={
              <>
                <span>浏览全部文章</span>
                <ArrowRight size={18} aria-hidden="true" />
              </>
            }
            href={route(context.routes, "mobile-articles")}
            options={{ variant: "cta" }}
          />
        </div>
      </MobileShell>
    );
  };
}
