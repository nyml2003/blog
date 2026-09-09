import { createSignal, For, Show } from "solid-js";
import type { Article, ArticleType } from "../../common/contracts/domain";
import {
  adminArticleEditHref,
  adminEditorGuideHref,
  adminHomeHref,
  adminLoginHref,
  adminWorkspaceHref,
  logoutAdminSession,
  publicArchiveHref,
  publicArticleDetailHref,
  publicHomeHref,
  queryErrorMessage,
  type ContentArticle,
  type TShelfArticle,
  type TShelfFilter,
  type QueryReadonly,
} from "../../solid/queries";
import "./styles.css";
import "./integration.css";

export type { Article };
export const qs = () => new URLSearchParams(location.search);
export const date = (value?: string) =>
  value ? new Date(value).toLocaleString() : "-";

export const shortDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value))
    : "-";

export function Header(props: { admin?: boolean }) {
  const current = location.pathname;
  const [logoutBusy, setLogoutBusy] = createSignal(false);
  const [logoutError, setLogoutError] = createSignal<string | undefined>();
  // SPEC-SITE-ROUTES-001：导航值全部来自后端下发的路由清单。
  const routes = {
    home: publicHomeHref(),
    archive: publicArchiveHref(),
    adminHome: adminHomeHref(),
    workspace: adminWorkspaceHref(),
    guide: adminEditorGuideHref(),
    login: adminLoginHref(),
  };
  const active = (href: string) => {
    if (href === routes.home) return current === routes.home;
    if (href === routes.adminHome) {
      const adminDir = routes.adminHome.slice(
        0,
        routes.adminHome.lastIndexOf("/") + 1,
      );
      return (
        current === adminDir ||
        current === routes.adminHome ||
        current.startsWith(`${adminDir}articles`)
      );
    }
    return current.startsWith(href.replace("/index.html", ""));
  };
  return (
    <>
      <a class="skip" href="#main">
        跳到主内容
      </a>
      <header class="topbar">
        <a class="brand" href={props.admin ? routes.adminHome : routes.home}>
          <span class="brand-kicker">
            {props.admin ? "管理台" : "FIELD NOTES"}
          </span>
          <strong>技术知识库</strong>
        </a>
        <nav class="nav" aria-label="主导航">
          {props.admin ? (
            <>
              <a href={routes.home}>返回站点</a>
              <a
                aria-current={active(routes.adminHome) ? "page" : undefined}
                href={routes.adminHome}
              >
                文章
              </a>
              <a
                aria-current={active(routes.workspace) ? "page" : undefined}
                href={routes.workspace}
              >
                分类工作台
              </a>
              <a
                aria-current={active(routes.guide) ? "page" : undefined}
                href={routes.guide}
              >
                指南
              </a>
              <button
                class="nav-logout"
                type="button"
                disabled={logoutBusy()}
                onClick={async () => {
                  setLogoutError(undefined);
                  setLogoutBusy(true);
                  const result = await logoutAdminSession();
                  if (result.ok) {
                    location.replace(routes.login);
                    return;
                  }
                  setLogoutError(
                    queryErrorMessage(result.error, "退出失败，请重试"),
                  );
                  setLogoutBusy(false);
                }}
              >
                {logoutBusy() ? "退出中..." : "退出"}
              </button>
              <Show when={logoutError()}>
                {(message) => (
                  <span class="nav-error" role="alert">
                    {message()}
                  </span>
                )}
              </Show>
            </>
          ) : (
            <>
              <a
                aria-current={active(routes.home) ? "page" : undefined}
                href={routes.home}
              >
                首页
              </a>
              <a
                aria-current={active(routes.archive) ? "page" : undefined}
                href={routes.archive}
              >
                全部文章
              </a>
            </>
          )}
        </nav>
      </header>
    </>
  );
}

export function Status(props: { busy: boolean; error?: string; ok?: string }) {
  return (
    <>
      {props.busy && (
        <div class="muted" role="status">
          处理中...
        </div>
      )}
      {props.error && (
        <div class="error" role="alert">
          {props.error}
        </div>
      )}
      {props.ok && (
        <div class="notice" role="status">
          {props.ok}
        </div>
      )}
    </>
  );
}

export function ArticleBody(props: { html: string }) {
  return <div class="article-body" innerHTML={props.html} />;
}

type PublicShelfArticle = QueryReadonly<TShelfArticle> & {
  readonly articleTypeId?: number;
  readonly articleType?: ArticleType;
};

export function WorkspaceArticleTable(props: {
  items: readonly ContentArticle[];
  busyArticleId: number | undefined;
  onRemove: (article: ContentArticle) => void;
}) {
  return (
    <div class="list list-admin">
      <div class="admin-list-head" aria-hidden="true">
        <span>文章</span>
        <span>分类</span>
        <span>标签</span>
        <span>更新时间</span>
        <span>操作</span>
      </div>
      <For each={props.items}>
        {(article) => (
          <article class="admin-row">
            <h3>
              <a href={adminArticleEditHref(article.id)}>
                {article.title || "未命名文章"}
              </a>
            </h3>
            <span>{article.categoryIds.length} 个分类</span>
            <span>{article.tagIds.length} 个标签</span>
            <time>{shortDate(article.updatedAt)}</time>
            <div class="row-actions">
              <a href={adminArticleEditHref(article.id)}>编辑</a>
              <button
                type="button"
                class="link-button danger"
                disabled={props.busyArticleId !== undefined}
                aria-label={`暂存下架《${article.title || "未命名文章"}》`}
                onClick={() => props.onRemove(article)}
              >
                {props.busyArticleId === article.id ? "暂存中..." : "暂存下架"}
              </button>
            </div>
          </article>
        )}
      </For>
    </div>
  );
}

function PublicShelf(props: {
  items: readonly PublicShelfArticle[];
  variant: "archive" | "recommended";
}) {
  return (
    <div class={`list list-${props.variant}`}>
      <For each={props.items}>
        {(article, index) => (
          <a class="archive-row" href={publicArticleDetailHref(article.id)}>
            <div class="archive-index">
              <strong>{String(index() + 1).padStart(2, "0")}</strong>
              <time>{shortDate(article.updatedAt)}</time>
            </div>
            <div class="archive-copy">
              {props.variant === "recommended" && index() === 0 && (
                <span class="feature-label">近期精选</span>
              )}
              <h3>{article.title || "未命名文章"}</h3>
              <div class="tag-line">
                <For each={article.terms.slice(0, 3)}>
                  {(term) => <span class="tag">{term.name}</span>}
                </For>
              </div>
            </div>
            <div class="archive-type">
              <span>{article.articleType?.name ?? "阅读全文"}</span>
              <span aria-hidden="true">→</span>
            </div>
          </a>
        )}
      </For>
    </div>
  );
}

export function TShelf(props: {
  filters: readonly QueryReadonly<TShelfFilter>[];
  selectedFilterId: string;
  articles: readonly QueryReadonly<TShelfArticle>[];
  total: number | undefined;
  loading: boolean;
  error: boolean;
  variant: "archive" | "recommended";
  onSelect: (filterId: string) => void;
  onRetry: () => void;
}) {
  return (
    <div class="t-shelf">
      <nav class="t-shelf-filters" aria-label="文章类型筛选">
        <For each={props.filters}>
          {(filter) => (
            <button
              type="button"
              aria-pressed={props.selectedFilterId === filter.id}
              onClick={() => props.onSelect(filter.id)}
            >
              {filter.name}
            </button>
          )}
        </For>
      </nav>
      <div class="t-shelf-content" aria-live="polite" aria-busy={props.loading}>
        <Show
          when={!props.loading}
          fallback={<div class="state">加载中...</div>}
        >
          <Show
            when={!props.error}
            fallback={
              <div class="error" role="alert">
                <span>文章加载失败，请重试。</span>
                <button type="button" onClick={props.onRetry}>
                  重试
                </button>
              </div>
            }
          >
            <Show
              when={props.articles.length > 0}
              fallback={<div class="state">当前分类还没有文章</div>}
            >
              <div class="t-shelf-count">共 {props.total ?? 0} 篇</div>
              <PublicShelf items={props.articles} variant={props.variant} />
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  );
}
