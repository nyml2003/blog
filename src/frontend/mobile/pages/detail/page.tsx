import { type Component, createEffect, For, Show } from "solid-js";
import { displayDate } from "../../../validation/route-input";
import {
  type MobileDetailInput,
  useMobileDetail,
} from "../../features/detail/model";
import { searchQuery } from "../../features/search/model";
import { Heading, StateMessage, Tag, Text } from "../../foundation/ui";
import { ArticleBody } from "../../widgets/article-body/ui";
import { StandardNavigator } from "../../widgets/shell/navigator-icons";

export function createMobileDetailPage(input: MobileDetailInput): Component {
  return function MobileDetailPage() {
    const detail = useMobileDetail(input);
    createEffect(() => {
      if (detail.kind === "invalid") {
        input.onAppShellReady();
        return;
      }
      const status = detail.state().status;
      if (status !== "idle" && status !== "loading") input.onAppShellReady();
    });
    const query = searchQuery(input.navigation.current().search);
    if (detail.kind === "invalid") {
      return (
        <div class="mobile-shell">
          <StandardNavigator
            context={input.context}
            leftIcons={["back"]}
            title="阅读"
            leftLabel="返回上一页"
            browserNavigation={input.navigation}
            persistence={input.persistence}
            document={input.document}
            share={input.share}
            onBack={detail.onBack}
            className="reading-bar"
          />
          <main id="main" class="mobile-main detail-main">
            <DetailError retry={undefined} />
          </main>
        </div>
      );
    }
    const payload = () => detail.state().snapshot;
    const article = () => payload()?.article;
    const favorite = () => {
      const current = article();
      if (current === undefined) return undefined;
      return {
        active: input.favorites.has(String(current.id)),
        toggle: () => {
          void input.favorites.toggle(String(current.id));
        },
      };
    };
    return (
      <div class="mobile-shell">
        <StandardNavigator
          context={input.context}
          navigation={payload()?.navigation}
          leftIcons={["back"]}
          browserNavigation={input.navigation}
          persistence={input.persistence}
          document={input.document}
          share={input.share}
          favorite={favorite()}
          onBack={detail.onBack}
        />
        <main id="main" class="mobile-main detail-main">
          <Show
            when={detail.state().status !== "loading"}
            fallback={
              <StateMessage
                kind="loading"
                text="正在加载文章…"
                onRetry={undefined}
              />
            }
          >
            <Show
              when={article()}
              fallback={<DetailError retry={detail.retry} />}
            >
              {(value) => (
                <article class="mobile-article">
                  <header class="detail-header">
                    <Text
                      content={value().articleType?.name ?? "文章"}
                      options={{ tone: "accent", size: "meta" }}
                    />
                    <Heading
                      content={value().title}
                      options={{ as: "h1", size: "page" }}
                    />
                    <Show when={value().summary}>
                      <Text
                        content={value().summary}
                        options={{ as: "p", tone: "muted", size: "body" }}
                      />
                    </Show>
                    <p class="detail-meta">
                      <For each={value().terms?.slice(0, 2) ?? []}>
                        {(term) => <Tag content={term.name} options={{}} />}
                      </For>
                      <time dateTime={value().updatedAt}>
                        更新于 {displayDate(value().updatedAt)}
                      </time>
                    </p>
                  </header>
                  <ArticleBody html={value().contentHtml} query={query} />
                </article>
              )}
            </Show>
          </Show>
        </main>
      </div>
    );
  };
}

function DetailError(props: { readonly retry: (() => void) | undefined }) {
  return (
    <StateMessage
      kind="error"
      text="文章不存在或暂不可见"
      onRetry={props.retry}
    />
  );
}
