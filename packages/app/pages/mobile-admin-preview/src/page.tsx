import { ArrowLeft } from "lucide-solid";
import { type Component, For, Show } from "solid-js";
import { displayDate, positiveIdFromSearch } from "@blog/route-input";
import { useMobileAdminPreview } from "./feature.ts";
import type { MobileApi } from "@blog/mobile-api";
import type { MobilePageContext } from "@blog/mobile-shared";
import { routeWithQuery } from "@blog/mobile-shared";
import { Heading, Link, StateMessage, Tag, Text } from "@blog/mobile-shared";
import { ArticleBody } from "@blog/mobile-shared";
import { StandardNavigator } from "@blog/mobile-shared";

type MobileAdminPreviewInput = MobilePageContext & {
  readonly api: MobileApi;
};

export function createMobileAdminPreviewPage(
  input: MobileAdminPreviewInput,
): Component {
  return function MobileAdminPreviewPage() {
    const detail = useMobileAdminPreview(
      input.api,
      positiveIdFromSearch(input.navigation.current().search, "id"),
    );
    const editHref = (id: number) =>
      routeWithQuery(input.routes, "desktop-admin-article-edit", { id });
    if (detail.kind === "invalid")
      return (
        <div class="mobile-shell mobile-preview-page">
          <main id="main" class="mobile-main detail-main">
            <StateMessage
              kind="error"
              text="文章编号无效"
              onRetry={undefined}
            />
          </main>
        </div>
      );
    const article = () => {
      const value = detail.state().snapshot;
      return value?.htmlInspection.valid === true ? value : undefined;
    };
    return (
      <div class="mobile-shell mobile-preview-page">
        <StandardNavigator
          context={input}
          leftIcons={["back"]}
          leftLabel="返回编辑"
          leftHref={
            article()
              ? editHref(article()!.id)
              : routeWithQuery(input.routes, "desktop-admin-home", {})
          }
          title="已保存版本"
          browserNavigation={input.navigation}
          persistence={input.persistence}
          document={input.document}
          share={input.share}
          className="reading-bar"
        />
        <main id="main" class="mobile-main detail-main">
          <Show
            when={detail.state().status !== "loading"}
            fallback={
              <StateMessage
                kind="loading"
                text="正在读取文章…"
                onRetry={undefined}
              />
            }
          >
            <Show
              when={article()}
              fallback={
                <StateMessage
                  kind="error"
                  text="文章不存在、校验未通过或暂不可见"
                  onRetry={detail.retry}
                />
              }
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
                      <For each={value().terms ?? []}>
                        {(term) => <Tag content={term.name} options={{}} />}
                      </For>
                      <time dateTime={value().updatedAt}>
                        更新于 {displayDate(value().updatedAt)}
                      </time>
                    </p>
                  </header>
                  <ArticleBody html={value().contentHtml} />
                  <footer class="detail-footer">
                    <Link
                      content={
                        <>
                          <ArrowLeft size={18} aria-hidden="true" />
                          <span>返回编辑</span>
                        </>
                      }
                      href={editHref(value().id)}
                      options={{}}
                    />
                  </footer>
                </article>
              )}
            </Show>
          </Show>
        </main>
      </div>
    );
  };
}
