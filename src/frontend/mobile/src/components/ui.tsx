import { For, Show } from "solid-js";
import { Heading, Link, Tag, Text } from "../../../mobile-ui/atoms";
import {
  StateMessage,
  TabGroup,
  type TabItem,
} from "../../../mobile-ui/molecules";
import type {
  Article,
  ArticleType,
  Term,
} from "../../../common/contracts/domain";
import type {
  QueryReadonly,
  TShelfArticle,
  TShelfFilter,
} from "../../../solid/queries";
import { browseHref } from "../logic/browse-filter";

/** 货架类型分区的截断上限，对齐 wire 的 `SHELF_SECTION_LIMIT`（N = 6）。 */
const SHELF_SECTION_LIMIT = 6;
const articleListHref = "/m/articles/list.html";

/**
 * 卡片渲染所需的展示字段：货架 wire 卡片与公开列表项都满足（渐进归一化视图，
 * 因此允许 `terms` / `articleType` 可选）。
 */
export type ArticleCardArticle = {
  readonly id: number;
  readonly title: string;
  readonly summary: string;
  readonly updatedAt: string;
  readonly terms?: readonly Term[];
  /** 出现时卡片顶部渲染类型眉标；货架 wire 卡片没有该字段，货架卡片因此不显示。 */
  readonly articleType?: ArticleType;
};

export type ArticleShelfSection = {
  readonly id: string;
  readonly title: string;
  /** 截断前该分区的全量条数（类型分区即该类型的全量计数）。 */
  readonly total: number;
  readonly articles: readonly ArticleCardArticle[];
};

/** `type-<id>` 分区 id → 类型 id；推荐区（`recommendation`）没有类型 id。 */
export const sectionTypeId = (sectionId: string): number | undefined => {
  if (!sectionId.startsWith("type-")) return undefined;
  const raw = sectionId.slice("type-".length);
  return /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : undefined;
};
export const pageStyles = () => null;
export function MobileNav(_p: { active: string }) {
  return (
    <>
      <a class="skip-link" href="#main">
        跳到主要内容
      </a>
      <header class="mobile-header">
        <div class="mobile-brand">
          <Link
            content={
              <>
                <Text
                  content="FIELD NOTES"
                  options={{ tone: "accent", size: "meta" }}
                />
                <strong>技术知识库</strong>
              </>
            }
            href="/m/"
            options={{}}
          />
        </div>
      </header>
    </>
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
      <div class="row-anchor">
        <Text
          content={p.article.articleType?.name ?? "文章"}
          options={{ tone: "accent", size: "meta" }}
        />
      </div>
      <div class="row-top">
        <Heading
          content={p.article.title}
          options={{ as: "h2", size: "card" }}
        />
      </div>
      <p class={`row-summary${p.article.summary ? "" : " is-empty"}`}>
        <Text
          content={p.article.summary || "暂无摘要"}
          options={{ as: "span", tone: "muted", size: "meta" }}
        />
      </p>
      <div class="row-meta">
        <span class="row-tags">
          <For each={tags()}>
            {(t) => <Tag content={t.name} options={{}} />}
          </For>
          <Show when={extraTags()}>
            {" "}
            <Tag content={`+${extraTags()}`} options={{}} />
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
      <TabGroup
        items={p.sections.map(
          (section): TabItem => ({ id: section.id, label: section.title }),
        )}
        onChange={p.onSelect}
        selectedId={p.activeSectionId}
        ariaLabel="文章分区"
        options={{ orientation: "vertical" }}
      />
    </nav>
  );
}
/** 货架分区与平铺页共用的单一卡片形态（样式在 pages.css 的 `.article-card`）。 */
export function ArticleCard(p: { article: ArticleCardArticle }) {
  const terms = () => p.article.terms ?? [];
  const visibleTags = () => terms().slice(0, 2);
  const extraTags = () => Math.max(0, terms().length - 2);
  return (
    <a class="article-card" href={`/m/articles/detail.html?id=${p.article.id}`}>
      <Show when={p.article.articleType}>
        {(type) => (
          <p class="article-card-type">
            <Text
              content={type().name}
              options={{ tone: "accent", size: "meta" }}
            />
          </p>
        )}
      </Show>
      <Heading content={p.article.title} options={{ as: "h3", size: "card" }} />
      <p class={`article-card-summary${p.article.summary ? "" : " is-empty"}`}>
        <Text
          content={p.article.summary || "暂无摘要"}
          options={{ as: "span", tone: "muted", size: "meta" }}
        />
      </p>
      <div class="article-card-meta">
        <span class="article-card-tags">
          <For each={visibleTags()}>
            {(term) => <Tag content={term.name} options={{}} />}
          </For>
          <Show when={extraTags() > 0}>
            <Tag content={`+${extraTags()}`} options={{}} />
          </Show>
        </span>
        <time>{shortDate(p.article.updatedAt)}</time>
      </div>
    </a>
  );
}

export function MobileTShelf(p: {
  filters: readonly QueryReadonly<TShelfFilter>[];
  selectedFilterId: string;
  articles: readonly QueryReadonly<TShelfArticle>[];
  total: number | undefined;
  loading: boolean;
  error: boolean;
  onSelect: (filterId: string) => void;
  onRetry: () => void;
}) {
  return (
    <section class="mobile-t-shelf" aria-label="推荐文章">
      <div class="mobile-t-shelf-filters">
        <TabGroup
          items={p.filters.map(
            (filter): TabItem => ({ id: filter.id, label: filter.name }),
          )}
          onChange={p.onSelect}
          selectedId={p.selectedFilterId}
          ariaLabel="文章类型筛选"
          options={{ orientation: "horizontal" }}
        />
      </div>
      <div
        class="mobile-t-shelf-content"
        aria-live="polite"
        aria-busy={p.loading}
      >
        <Show
          when={!p.loading}
          fallback={<StateMessage kind="loading" text="正在加载推荐内容…" />}
        >
          <Show
            when={!p.error}
            fallback={
              <StateMessage
                kind="error"
                text="推荐内容加载失败"
                onRetry={p.onRetry}
              />
            }
          >
            <Show
              when={p.articles.length > 0}
              fallback={<StateMessage kind="empty" text="当前分类还没有文章" />}
            >
              <p class="mobile-t-shelf-count">共 {p.total ?? 0} 篇</p>
              <div class="article-list">
                <For each={p.articles}>
                  {(article) => <ArticleCard article={article} />}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </section>
  );
}
export function ShelfSection(p: { section: ArticleShelfSection }) {
  // 「查看全部」只对类型分区渲染，且仅当该类型还有未下发的文章（total > N）。
  const viewAll = () => {
    const typeId = sectionTypeId(p.section.id);
    if (typeId === undefined || p.section.total <= SHELF_SECTION_LIMIT)
      return undefined;
    return { href: browseHref(articleListHref, { typeId }, "") };
  };
  // 类型分区的 total 是截断前的全量计数；推荐区不是类型分区（wire 里它是推荐
  // 池大小，可能大于下发的 3 张），因此只展示实际下发条数。
  const countLabel = () =>
    sectionTypeId(p.section.id) === undefined
      ? `${p.section.articles.length} 篇`
      : `共 ${p.section.total} 篇`;
  return (
    <section
      id={`shelf-${p.section.id}`}
      class="shelf-section"
      data-shelf-section={p.section.id}
      aria-labelledby={`shelf-title-${p.section.id}`}
    >
      <header class="shelf-section-heading">
        <Text
          content="分区"
          options={{ as: "p", tone: "accent", size: "meta" }}
        />
        <Heading
          content={p.section.title}
          options={{
            as: "h2",
            id: `shelf-title-${p.section.id}`,
            size: "section",
          }}
        />
        <span>{countLabel()}</span>
      </header>
      <div class="shelf-cards">
        <For each={p.section.articles}>
          {(article) => <ArticleCard article={article} />}
        </For>
      </div>
      <Show when={viewAll()} keyed>
        {(entry) => (
          <p class="section-more">
            <Link
              content={
                <>
                  <span>查看全部</span>
                  <span aria-hidden="true">→</span>
                </>
              }
              href={entry.href}
              options={{ variant: "action" }}
            />
          </p>
        )}
      </Show>
    </section>
  );
}
export { StateMessage };
export function ArticleBody(p: { html: string }) {
  return <div class="article-body" innerHTML={p.html} />;
}
