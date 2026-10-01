import { For, Show, type Component } from "solid-js";
import type { DesktopPageContext } from "../../foundation/context";
import { route, routeWithQuery } from "../../foundation/context";
import { useDesktopAdminHome } from "../../features/admin-home/model";

export function createDesktopAdminHomePage(
  input: DesktopPageContext,
): Component {
  return function DesktopAdminHomePage() {
    const page = useDesktopAdminHome(input.api);
    const homeHref = route(input.routes, "desktop-public-home");
    const adminHref = route(input.routes, "desktop-admin-home");
    const workspaceHref = route(input.routes, "desktop-admin-article-types");
    const newHref = route(input.routes, "desktop-admin-article-new");
    const editHref = (id: number) =>
      routeWithQuery(input.routes, "desktop-admin-article-edit", { id });
    return (
      <div class="desktop-login desktop-admin-home">
        <header>
          <a class="brand" href={adminHref}>
            <span>管理台</span>
            <strong>技术知识库</strong>
          </a>
          <nav>
            <a href={homeHref}>返回站点</a>
            <a href={adminHref} aria-current="page">
              文章
            </a>
            <a href={workspaceHref}>分类工作台</a>
          </nav>
        </header>
        <main id="main">
          <header class="admin-page-head">
            <div>
              <p class="eyebrow">CONTENT WORKSPACE</p>
              <h1>文章管理</h1>
              <p>编辑工作区文章，并在发布工作台统一预览和提交。</p>
            </div>
            <div class="actions">
              <a href={workspaceHref}>发布工作台</a>
              <a href={newHref}>新建文章</a>
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
                              <a href={editHref(article.id)}>编辑</a>
                              <button
                                type="button"
                                disabled={page.busyId() !== undefined}
                                onClick={() =>
                                  void page.remove(article.id, article.title)
                                }
                              >
                                {page.busyId() === article.id
                                  ? "暂存中..."
                                  : "暂存下架"}
                              </button>
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
        </main>
      </div>
    );
  };
}
