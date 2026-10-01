import { ArrowLeft } from "lucide-solid";
import { For, Show, type Component } from "solid-js";
import type { DesktopPageContext } from "../context";
import { route, routeWithQuery } from "../context";
import { useDesktopAdminPreview } from "../logic/admin-preview";
import { ArticleBody } from "../components/article-body";
import { positiveIdFromSearch } from "../../route-input";

export function createDesktopAdminPreviewPage(
  input: DesktopPageContext,
): Component {
  return function DesktopAdminPreviewPage() {
    const page = useDesktopAdminPreview(
      input.api,
      positiveIdFromSearch(input.navigation.current().search, "id"),
    );
    const adminHref = route(input.routes, "desktop-admin-home");
    const editHref = (id: number) =>
      routeWithQuery(input.routes, "desktop-admin-article-edit", { id });
    if (page.kind === "invalid")
      return (
        <div class="desktop-login">
          <main id="main">
            <p role="alert">文章编号无效</p>
            <a href={adminHref}>返回文章管理</a>
          </main>
        </div>
      );
    const article = () => {
      const value = page.state().snapshot;
      return value?.htmlInspection.valid === true ? value : undefined;
    };
    return (
      <div class="desktop-login desktop-preview">
        <header>
          <a class="brand" href={adminHref}>
            <span>管理台</span>
            <strong>技术知识库</strong>
          </a>
          <a href={adminHref}>返回文章管理</a>
        </header>
        <main id="main">
          <Show
            when={article()}
            fallback={<p role="alert">文章不存在或暂不可见</p>}
          >
            {(value) => (
              <article class="article">
                <a class="back-link" href={editHref(value().id)}>
                  <ArrowLeft size={18} aria-hidden="true" />
                  <span>返回编辑</span>
                </a>
                <p class="eyebrow">
                  {value().articleType?.name ??
                    `类型 #${value().articleTypeId}`}
                </p>
                <h1>{value().title}</h1>
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
        </main>
      </div>
    );
  };
}
