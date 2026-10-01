import { ArrowLeft } from "lucide-solid";
import { For, Show, type Component } from "solid-js";
import type { MobileRouteContext } from "../context";
import type { MobileApi } from "../../api/mobile";
import { type NavigationPort } from "@fluvient-loom/port";
import { routeWithQuery } from "../context";
import { useMobileAdminPreview } from "../logic/admin-preview";
import { ArticleBody } from "../components";
import { Heading, Link, StateMessage, Tag, Text } from "../ui";
import { displayDate, positiveIdFromSearch } from "../../route-input";

type MobileAdminPreviewInput = MobileRouteContext & {
  readonly api: MobileApi;
  readonly navigation: NavigationPort;
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
        <header class="reading-bar">
          <Link
            content={
              <>
                <ArrowLeft size={18} aria-hidden="true" />
                <span>返回编辑</span>
              </>
            }
            href={
              article()
                ? editHref(article()!.id)
                : routeWithQuery(input.routes, "desktop-admin-home", {})
            }
            options={{}}
          />
          <span>已保存版本</span>
        </header>
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
