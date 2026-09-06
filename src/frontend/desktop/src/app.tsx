import { createSignal, For } from "solid-js";
import { browserClient as client } from "../../common/client";
import type {
  Article,
  ArticleFilter,
  ArticleListItem,
  ArticleType,
  Term,
} from "../../common/contracts/domain";
import { useDataResource } from "../../solid/data";
import "./styles.css";
import "./integration.css";

export type { Article, ArticleFilter, ArticleType, Term };
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

export function Shelf(props: {
  items: readonly ArticleListItem[];
  variant?: "archive" | "recommended" | "admin";
}) {
  const isAdmin = () => props.variant === "admin";
  return (
    <div class={`list list-${props.variant ?? "archive"}`}>
      {isAdmin() && (
        <div class="admin-list-head" aria-hidden="true">
          <span>文章</span>
          <span>类型</span>
          <span>状态</span>
          <span>更新时间</span>
          <span>操作</span>
        </div>
      )}
      <For each={props.items}>
        {(article, index) =>
          isAdmin() ? (
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
          ) : (
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
                  <For each={(article.terms ?? []).slice(0, 3)}>
                    {(term) => <span class="tag">{term.name}</span>}
                  </For>
                </div>
              </div>
              <div class="archive-type">
                <span>
                  {article.articleType?.name ??
                    `类型 #${article.articleTypeId}`}
                </span>
                <span aria-hidden="true">→</span>
              </div>
            </a>
          )
        }
      </For>
    </div>
  );
}

export function Filters(props: {
  value: ArticleFilter;
  onChange: (value: ArticleFilter) => void;
}) {
  const types = useDataResource(
    () => undefined,
    () => client.taxonomy.listTypes(),
  );
  const terms = useDataResource(
    () => undefined,
    () => client.taxonomy.listTerms(),
  );
  const [typeId, setTypeId] = createSignal(props.value.typeId);
  const [termIds, setTermIds] = createSignal([...props.value.termIds]);
  const [createdFrom, setCreatedFrom] = createSignal(props.value.createdFrom);
  const [createdTo, setCreatedTo] = createSignal(props.value.createdTo);
  const [updatedFrom, setUpdatedFrom] = createSignal(props.value.updatedFrom);
  const [updatedTo, setUpdatedTo] = createSignal(props.value.updatedTo);
  const current = (): ArticleFilter => ({
    typeId: typeId(),
    termIds: termIds(),
    createdFrom: createdFrom(),
    createdTo: createdTo(),
    updatedFrom: updatedFrom(),
    updatedTo: updatedTo(),
  });
  const clear = () => {
    setTypeId("");
    setTermIds([]);
    setCreatedFrom("");
    setCreatedTo("");
    setUpdatedFrom("");
    setUpdatedTo("");
    props.onChange({
      typeId: "",
      termIds: [],
      createdFrom: "",
      createdTo: "",
      updatedFrom: "",
      updatedTo: "",
    });
  };
  return (
    <form
      class="filters"
      onSubmit={(event) => {
        event.preventDefault();
        props.onChange(current());
      }}
    >
      <div class="field">
        <label for="filter-type">文章类型</label>
        <select
          id="filter-type"
          value={typeId()}
          onChange={(event) => setTypeId(event.currentTarget.value)}
        >
          <option value="">全部类型</option>
          <For each={types.snapshot() ?? []}>
            {(type) => <option value={type.id}>{type.name}</option>}
          </For>
        </select>
      </div>
      <fieldset class="term-filter">
        <legend>主题/标签</legend>
        <div class="check-list">
          <For each={terms.snapshot() ?? []}>
            {(term) => (
              <label>
                <input
                  type="checkbox"
                  checked={termIds().includes(String(term.id))}
                  onChange={(event) =>
                    setTermIds(
                      event.currentTarget.checked
                        ? [...termIds(), String(term.id)]
                        : termIds().filter((id) => id !== String(term.id)),
                    )
                  }
                />
                {term.name}
              </label>
            )}
          </For>
        </div>
      </fieldset>
      <div class="field">
        <label for="created-from">创建起始</label>
        <input
          id="created-from"
          type="date"
          value={createdFrom()}
          onInput={(event) => setCreatedFrom(event.currentTarget.value)}
        />
      </div>
      <div class="field">
        <label for="created-to">创建结束</label>
        <input
          id="created-to"
          type="date"
          value={createdTo()}
          onInput={(event) => setCreatedTo(event.currentTarget.value)}
        />
      </div>
      <div class="field">
        <label for="updated-from">更新起始</label>
        <input
          id="updated-from"
          type="date"
          value={updatedFrom()}
          onInput={(event) => setUpdatedFrom(event.currentTarget.value)}
        />
      </div>
      <div class="field">
        <label for="updated-to">更新结束</label>
        <input
          id="updated-to"
          type="date"
          value={updatedTo()}
          onInput={(event) => setUpdatedTo(event.currentTarget.value)}
        />
      </div>
      <button class="primary" type="submit">
        应用筛选
      </button>
      <button type="button" onClick={clear}>
        清除
      </button>
    </form>
  );
}
