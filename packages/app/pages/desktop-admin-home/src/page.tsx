import { For, Show, type Component } from "solid-js";
import type { DesktopPageContext } from "@blog/desktop-shared";
import { Button, Heading, Link, Text } from "@blog/desktop-atoms";
import { route, routeWithQuery } from "@blog/desktop-shared";
import { useDesktopAdminHome } from "./feature";
import "./page.css";

export function createDesktopAdminHomePage(
  input: DesktopPageContext,
): Component {
  return function DesktopAdminHomePage() {
    const page = useDesktopAdminHome(input.api, input.dialog);
    const workspaceHref = route(input.routes, "desktop-admin-article-types");
    const newHref = route(input.routes, "desktop-admin-article-new");
    const editHref = (id: number) =>
      routeWithQuery(input.routes, "desktop-admin-article-edit", { id });
    return (
      <div class="admin-page admin-home-page">
        <header class="admin-page-head">
            <div>
              <Text tone="accent">CONTENT WORKSPACE</Text>
              <Heading level={1}>文章管理</Heading>
              <Text tone="muted">
                编辑工作区文章，并在发布工作台统一预览和提交。
              </Text>
            </div>
            <div class="actions">
              <Link href={workspaceHref} variant="action">
                发布工作台
              </Link>
              <Link href={newHref} variant="cta">
                新建文章
              </Link>
            </div>
          </header>
          <Show when={page.message()}>
            <p role="status">{page.message()}</p>
          </Show>
          <Show when={page.error()}>
            <p role="alert">{page.error()}</p>
          </Show>
          <Show
            when={page.articles.state().status !== "loading"}
            fallback={<p>加载中...</p>}
          >
            <Show
              when={page.articles.state().snapshot}
              fallback={<p>文章工作区加载失败</p>}
            >
              {(value) => (
                <>
                  <p>工作区版本 {value().version}</p>
                  <Show
                    when={value().articles.length > 0}
                    fallback={<p>当前工作区没有文章</p>}
                  >
                    <div class="admin-list">
                      <For each={value().articles}>
                        {(article) => (
                          <article class="admin-row">
                            <h3>
                              <a href={editHref(article.id)}>
                                {article.title || "未命名文章"}
                              </a>
                            </h3>
                            <span>{article.categoryIds.length} 个分类</span>
                            <span>{article.tagIds.length} 个标签</span>
                            <time>{article.updatedAt.slice(0, 10)}</time>
                            <div>
                              <Link href={editHref(article.id)}>编辑</Link>
                              <Button
                                disabled={page.busyId() !== undefined}
                                onClick={() =>
                                  void page.remove(article.id, article.title)
                                }
                              >
                                {page.busyId() === article.id
                                  ? "暂存中..."
                                  : "暂存下架"}
                              </Button>
                            </div>
                          </article>
                        )}
                      </For>
                    </div>
                  </Show>
                </>
              )}
            </Show>
          </Show>
      </div>
    );
  };
}
