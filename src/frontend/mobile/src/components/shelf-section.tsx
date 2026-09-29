import { ArrowRight } from "lucide-solid";
import { For, Show } from "solid-js";
import { Heading, Link, Text } from "../../../mobile-ui/atoms";
import { mobileArticleListHref } from "../../../solid/queries";
import { browseHref } from "../logic/browse-filter";
import { ArticleCard } from "./article-card";
import {
  SHELF_SECTION_LIMIT,
  sectionTypeId,
  type ArticleShelfSection,
} from "./shelf-format";

/** 首页货架的一个分区：标题、有界卡片列表与「查看全部」。 */
export function ShelfSection(p: { section: ArticleShelfSection }) {
  // 「查看全部」只对类型分区渲染，且仅当该类型还有未下发的文章（total > N）。
  const viewAll = () => {
    const typeId = sectionTypeId(p.section.id);
    if (typeId === undefined || p.section.total <= SHELF_SECTION_LIMIT)
      return undefined;
    return { href: browseHref(mobileArticleListHref(), { typeId }, "") };
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
                  <ArrowRight size={18} aria-hidden="true" />
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
