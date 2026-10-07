import type {
  DocumentPort,
  NavigationPort,
  PersistencePort,
} from "@fluvient-loom/port";
import { ArrowRight } from "lucide-solid";
import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import { useMobileHome } from "./feature.ts";
import "./page.css";
import type { MobileApi } from "@blog/mobile-api";
import type { MobileRouteContext } from "@blog/mobile-shared";
import { route } from "@blog/mobile-shared";
import {
  Heading,
  Link,
  StateMessage,
  TabGroup,
  Text,
} from "@blog/mobile-shared";
import { ArticleCard } from "@blog/mobile-shared";
import { MobileShell } from "@blog/mobile-shared";

export interface MobileHomePageInput extends MobileRouteContext {
  readonly api: Pick<MobileApi, "page">;
  readonly navigation: NavigationPort;
  readonly persistence: PersistencePort;
  readonly document: DocumentPort;
  readonly share: (url: string) => Promise<void>;
}

export function createMobileHomePage(input: MobileHomePageInput): Component {
  return function MobileHomePage() {
    const home = useMobileHome(input);
    const snapshot = home.snapshot;
    return (
      <MobileShell
        context={input}
        activeId="home"
        navigation={home.navigation()}
        browserNavigation={input.navigation}
        persistence={input.persistence}
        document={input.document}
        share={input.share}
        rightIcons={["search", "more"]}
      >
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
            selectedId={home.selection().filterId}
            onChange={home.selectFilter}
            ariaLabel="文章类型筛选"
            orientation="horizontal"
          />
          <div
            class="mobile-t-shelf-content"
            aria-live="polite"
            aria-busy={home.resource.state().status === "loading"}
          >
            <Show
              when={
                home.resource.state().status !== "loading" ||
                snapshot() !== undefined
              }
              fallback={
                <StateMessage
                  kind="loading"
                  text="正在加载推荐内容…"
                  onRetry={undefined}
                />
              }
            >
              <Show
                when={home.resource.state().error === undefined}
                fallback={
                  <StateMessage
                    kind="error"
                    text="推荐内容加载失败"
                    onRetry={home.retry}
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
            href={route(input.routes, "mobile-articles")}
            options={{ variant: "cta" }}
          />
        </div>
      </MobileShell>
    );
  };
}
