import { For, Show } from "solid-js";
import type {
  Article,
  ArticleListItem,
  ArticleType,
} from "../../common/contracts/domain";
import {
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
  const active = (href: string) =>
    href === "/"
      ? current === "/"
      : href === "/admin/index.html"
        ? current.startsWith("/admin/articles") ||
          current === "/admin/" ||
          current === "/admin/index.html"
        : current.startsWith(href.replace("/index.html", ""));
  return (
    <>
      <a class="skip" href="#main">
        跳到主内容
      </a>
      <header class="topbar">
        <a class="brand" href={props.admin ? "/admin/index.html" : "/"}>
          <span class="brand-kicker">
            {props.admin ? "管理台" : "FIELD NOTES"}
          </span>
          <strong>技术知识库</strong>
        </a>
        <nav class="nav" aria-label="主导航">
          {props.admin ? (
            <>
              <a
                aria-current={active("/admin/index.html") ? "page" : undefined}
                href="/admin/index.html"
              >
                文章
              </a>
              <a
                aria-current={
                  active("/admin/article-types/index.html") ? "page" : undefined
                }
                href="/admin/article-types/index.html"
              >
                类型
              </a>
              <a
                aria-current={
                  active("/admin/terms/index.html") ? "page" : undefined
                }
                href="/admin/terms/index.html"
              >
                主题/标签
              </a>
              <a
                aria-current={
                  active("/admin/editor-guide/index.html") ? "page" : undefined
                }
                href="/admin/editor-guide/index.html"
              >
                指南
              </a>
            </>
          ) : (
            <>
              <a aria-current={active("/") ? "page" : undefined} href="/">
                首页
              </a>
              <a
                aria-current={
                  active("/articles/index.html") ? "page" : undefined
                }
                href="/articles/index.html"
              >
                全部文章
              </a>
              <a href="/admin/index.html">管理</a>
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

export function AdminArticleTable(props: {
  items: readonly ArticleListItem[];
}) {
  return (
    <div class="list list-admin">
      <div class="admin-list-head" aria-hidden="true">
        <span>文章</span>
        <span>类型</span>
        <span>状态</span>
        <span>更新时间</span>
        <span>操作</span>
      </div>
      <For each={props.items}>
        {(article) => (
          <article class="admin-row">
            <h3>
              <a href={`/admin/articles/edit.html?id=${article.id}`}>
                {article.title || "未命名文章"}
              </a>
            </h3>
            <span>
              {article.articleType?.name ?? `类型 #${article.articleTypeId}`}
            </span>
            <span class={`status-${article.status}`}>
              {article.status === "published" ? "已发布" : "草稿"}
            </span>
            <time>{shortDate(article.updatedAt)}</time>
            <div class="row-actions">
              <a href={`/admin/articles/edit.html?id=${article.id}`}>编辑</a>
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
          <a
            class="archive-row"
            href={`/articles/detail.html?id=${article.id}`}
          >
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
