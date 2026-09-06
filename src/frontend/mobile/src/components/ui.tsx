import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type {
  Article,
  ArticleFilter,
  ArticleType,
  Term,
} from "../../../common/contracts/domain";

export type ShelfArticle = {
  readonly id: number;
  readonly title: string;
  readonly summary: string;
  readonly updatedAt: string;
  readonly terms: readonly Term[];
};

export type ArticleShelfSection = {
  readonly id: string;
  readonly title: string;
  readonly articles: readonly ShelfArticle[];
};
export const pageStyles = () => null;
export function MobileNav(_p: { active: string }) {
  return (
    <>
      <a class="skip-link" href="#main">
        跳到主要内容
      </a>
      <header class="mobile-header">
        <a class="mobile-brand" href="/m/">
          <span>FIELD NOTES</span>
          <strong>技术知识库</strong>
        </a>
      </header>
    </>
  );
}
export function BottomNav(p: { active: "home" | "articles" }) {
  return (
    <nav class="bottom-nav" aria-label="页面导航">
      <a
        class={p.active === "home" ? "is-active" : ""}
        aria-current={p.active === "home" ? "page" : undefined}
        href="/m/"
      >
        <span aria-hidden="true" class="nav-mark">
          荐
        </span>
        <span>推荐</span>
      </a>
      <a
        class={p.active === "articles" ? "is-active" : ""}
        aria-current={p.active === "articles" ? "page" : undefined}
        href="/m/articles/index.html"
      >
        <span aria-hidden="true" class="nav-mark">
          库
        </span>
        <span>文章库</span>
      </a>
    </nav>
  );
}
const shortDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value))
    : "";

export function ArticleRow(p: { article: Article }) {
  const tags = () => p.article.terms?.slice(0, 2) ?? [];
  const extraTags = () => Math.max(0, (p.article.terms?.length ?? 0) - 2);
  return (
    <a class="article-row" href={`/m/articles/detail.html?id=${p.article.id}`}>
      <div class="row-anchor">{p.article.articleType?.name ?? "文章"}</div>
      <div class="row-top">
        <h2>{p.article.title}</h2>
      </div>
      <p class={`row-summary${p.article.summary ? "" : " is-empty"}`}>
        {p.article.summary || "暂无摘要"}
      </p>
      <div class="row-meta">
        <span class="row-tags">
          <For each={tags()}>{(t) => <span>{t.name}</span>}</For>
          <Show when={extraTags()}>
            {" "}
            <span>+{extraTags()}</span>
          </Show>
        </span>
        <time>{shortDate(p.article.updatedAt)}</time>
      </div>
    </a>
  );
}
export function ShelfIndex(p: {
  activeSectionId: string;
  sections: readonly ArticleShelfSection[];
  onSelect: (sectionId: string) => void;
}) {
  return (
    <nav class="shelf-index" aria-label="文章分区">
      <For each={p.sections}>
        {(section) => (
          <button
            class={
              p.activeSectionId === section.id
                ? "shelf-index-tab is-active"
                : "shelf-index-tab"
            }
            type="button"
            aria-current={p.activeSectionId === section.id ? "true" : undefined}
            onClick={() => p.onSelect(section.id)}
          >
            {section.title}
          </button>
        )}
      </For>
    </nav>
  );
}
const ShelfCard = (p: { article: ShelfArticle }) => {
  const tags = () => p.article.terms.slice(0, 2);
  const extraTags = () => Math.max(0, p.article.terms.length - 2);
  return (
    <a class="shelf-card" href={`/m/articles/detail.html?id=${p.article.id}`}>
      <h3>{p.article.title}</h3>
      <p class={`shelf-summary${p.article.summary ? "" : " is-empty"}`}>
        {p.article.summary || "暂无摘要"}
      </p>
      <div class="shelf-card-meta">
        <span class="shelf-card-tags">
          <For each={tags()}>{(term) => <span>{term.name}</span>}</For>
          <Show when={extraTags() > 0}>
            <span>+{extraTags()}</span>
          </Show>
        </span>
        <time>{shortDate(p.article.updatedAt)}</time>
      </div>
    </a>
  );
};
export function ShelfSection(p: { section: ArticleShelfSection }) {
  return (
    <section
      id={`shelf-${p.section.id}`}
      class="shelf-section"
      data-shelf-section={p.section.id}
      aria-labelledby={`shelf-title-${p.section.id}`}
    >
      <header class="shelf-section-heading">
        <p>分区</p>
        <h2 id={`shelf-title-${p.section.id}`}>{p.section.title}</h2>
        <span>{p.section.articles.length} 篇</span>
      </header>
      <div class="shelf-cards">
        <For each={p.section.articles}>
          {(article) => <ShelfCard article={article} />}
        </For>
      </div>
    </section>
  );
}
export function StateMessage(p: {
  kind: "loading" | "empty" | "error";
  text: string;
  onRetry?: () => void;
}) {
  return (
    <div
      class={`state-message is-${p.kind}`}
      role={p.kind === "error" ? "alert" : "status"}
    >
      <span>{p.kind === "loading" ? "◌" : p.kind === "empty" ? "○" : "!"}</span>
      <p>{p.text}</p>
      <Show when={p.onRetry}>
        <button class="retry-button" onClick={p.onRetry}>
          重试
        </button>
      </Show>
    </div>
  );
}
export function ArticleBody(p: { html: string }) {
  return <div class="article-body" innerHTML={p.html} />;
}
export function FilterPanel(p: {
  value: ArticleFilter;
  terms: readonly Term[];
  types: readonly ArticleType[];
  onApply: (f: ArticleFilter) => void;
  onClose: () => void;
}) {
  const [termIds, setTermIds] = createSignal([...p.value.termIds]);
  const [typeId, setTypeId] = createSignal(p.value.typeId);
  const [createdFrom, setCreatedFrom] = createSignal(p.value.createdFrom),
    [createdTo, setCreatedTo] = createSignal(p.value.createdTo),
    [updatedFrom, setUpdatedFrom] = createSignal(p.value.updatedFrom),
    [updatedTo, setUpdatedTo] = createSignal(p.value.updatedTo);
  let closeButton: HTMLButtonElement | undefined;
  const previousFocus = document.activeElement as HTMLElement | null;
  const clear = () => {
    setTermIds([]);
    setTypeId("");
    setCreatedFrom("");
    setCreatedTo("");
    setUpdatedFrom("");
    setUpdatedTo("");
  };
  onMount(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") p.onClose();
      if (event.key !== "Tab") return;
      const panel = closeButton?.closest(".filter-panel");
      const focusable = panel?.querySelectorAll<HTMLElement>(
        "button, input, select, [href], [tabindex]:not([tabindex='-1'])",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    closeButton?.focus();
    onCleanup(() => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    });
  });
  return (
    <div
      class="filter-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) p.onClose();
      }}
    >
      <section
        class="filter-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-title"
      >
        <div class="panel-head">
          <h2 id="filter-title">筛选文章</h2>
          <button
            ref={(element) => {
              closeButton = element;
            }}
            onClick={p.onClose}
            aria-label="关闭筛选"
          >
            ×
          </button>
        </div>
        <label>
          文章类型
          <select
            value={typeId()}
            onChange={(e) => setTypeId(e.currentTarget.value)}
          >
            <option value="">全部类型</option>
            <For each={p.types}>
              {(t) => <option value={t.id}>{t.name}</option>}
            </For>
          </select>
        </label>
        <fieldset>
          <legend>主题 / 标签</legend>
          <For each={p.terms}>
            {(t) => (
              <label class="check">
                <input
                  type="checkbox"
                  checked={termIds().includes(String(t.id))}
                  onChange={(e) =>
                    setTermIds(
                      e.currentTarget.checked
                        ? [...termIds(), String(t.id)]
                        : termIds().filter((id) => id !== String(t.id)),
                    )
                  }
                />
                {t.name}
              </label>
            )}
          </For>
        </fieldset>
        <div class="date-grid">
          <label>
            创建起始
            <input
              type="date"
              value={createdFrom()}
              onInput={(e) => setCreatedFrom(e.currentTarget.value)}
            />
          </label>
          <label>
            创建结束
            <input
              type="date"
              value={createdTo()}
              onInput={(e) => setCreatedTo(e.currentTarget.value)}
            />
          </label>
          <label>
            更新起始
            <input
              type="date"
              value={updatedFrom()}
              onInput={(e) => setUpdatedFrom(e.currentTarget.value)}
            />
          </label>
          <label>
            更新结束
            <input
              type="date"
              value={updatedTo()}
              onInput={(e) => setUpdatedTo(e.currentTarget.value)}
            />
          </label>
        </div>
        <div class="panel-actions">
          <button class="clear-button" onClick={clear}>
            清除条件
          </button>
          <button
            class="apply-button"
            onClick={() =>
              p.onApply({
                termIds: termIds(),
                typeId: typeId(),
                createdFrom: createdFrom(),
                createdTo: createdTo(),
                updatedFrom: updatedFrom(),
                updatedTo: updatedTo(),
              })
            }
          >
            查看结果
          </button>
        </div>
      </section>
    </div>
  );
}
