import { ArrowLeft } from "lucide-solid";
import { For, Show, type Component } from "solid-js";
import { Heading, Link, Text } from "@blog/desktop-atoms";
import type { DesktopPageContext } from "@blog/desktop-shared";
import { route, routeWithQuery } from "@blog/desktop-shared";
import { useDesktopAdminPreview } from "./feature";
import { ArticleBody } from "@blog/desktop-shared";
import { desktopAdminArticlePreviewPage } from "./definition.ts";

export function createDesktopAdminPreviewPage(
  input: DesktopPageContext,
): Component {
  return function DesktopAdminPreviewPage() {
    const params = desktopAdminArticlePreviewPage.parseParams(
      input.navigation.current().search,
    );
    const page = useDesktopAdminPreview(
      input.api,
      params.ok ? params.value.id : undefined,
    );
    const adminHref = route(input.routes, "desktop-admin-home");
    const editHref = (id: number) =>
      routeWithQuery(input.routes, "desktop-admin-article-edit", { id });
    if (page.kind === "invalid")
      return (
        <div class="admin-page">
          <Text role="alert" tone="danger">
            文章编号无效
          </Text>
          <Link href={adminHref}>返回文章管理</Link>
        </div>
      );
    const article = () => {
      const value = page.state().snapshot;
      return value?.htmlInspection.valid === true ? value : undefined;
    };
    return (
      <div class="admin-page desktop-preview">
        <Show
            when={article()}
            fallback={
              <Text role="alert" tone="danger">
                文章不存在或暂不可见
              </Text>
            }
          >
            {(value) => (
              <article class="article">
                <Link class="back-link" href={editHref(value().id)}>
                  <ArrowLeft size={18} aria-hidden="true" />
                  <span>返回编辑</span>
                </Link>
                <Text tone="accent">
                  {value().articleType?.name ??
                    `类型 #${value().articleTypeId}`}
                </Text>
                <Heading level={1}>{value().title}</Heading>
                <Show when={value().summary}>
                  <p>{value().summary}</p>
                </Show>
                <div class="meta">
                  <span>
                    {value().status === "published" ? "已发布" : "草稿"}
                  </span>
                  <For each={value().terms ?? []}>
                    {(term) => <span class="tag">{term.name}</span>}
                  </For>
                </div>
                <div class="article-accent" aria-hidden="true" />
                <ArticleBody html={value().contentHtml} />
              </article>
            )}
          </Show>
      </div>
    );
  };
}
