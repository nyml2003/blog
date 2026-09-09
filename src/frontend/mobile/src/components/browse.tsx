import { For, Show } from "solid-js";
import { Button, Text } from "../../../mobile-ui/atoms";
import {
  ChipGroup,
  TabGroup,
  type ChipItem,
  type TabItem,
} from "../../../mobile-ui/molecules";
import type {
  ArticleListItem,
  ArticleType,
  Term,
} from "../../../common/contracts/domain";
import { ArticleCard } from "./index";
import {
  browseAllLevelId,
  browseSelectedLevelId,
  type BrowseFilter,
  type BrowseFilterLevel,
} from "../logic/browse-filter";

/** 平铺页卡片流的条目类型：与货架卡片共用同一个 `ArticleCard` 展示件。 */
export type BrowseArticle = ArticleListItem;

export type BrowseLevelSelect = (
  level: BrowseFilterLevel,
  levelId: string,
) => void;

/** L1：左侧纵向类型栏，永远包含「全部」。 */
export function BrowseTypeRail(p: {
  types: readonly ArticleType[];
  filter: BrowseFilter;
  onSelect: (levelId: string) => void;
}) {
  const items = (): readonly TabItem[] => [
    { id: browseAllLevelId, label: "全部" },
    ...p.types.map((type) => ({ id: String(type.id), label: type.name })),
  ];
  return (
    <nav class="browse-types" aria-label="文章类型">
      <TabGroup
        items={items()}
        onChange={p.onSelect}
        selectedId={browseSelectedLevelId(p.filter, "type")}
        ariaLabel="文章类型"
        options={{ orientation: "vertical" }}
      />
    </nav>
  );
}

const chipItems = (
  terms: readonly Term[],
  allLabel: string,
): readonly ChipItem[] => [
  { id: browseAllLevelId, label: allLabel },
  ...terms.map((term) => ({ id: String(term.id), label: term.name })),
];

/**
 * L2（主题）+ L3（标签）：横向 chips，L3 仅在具体主题选中后渲染。
 * taxonomy 失败时条目只剩「全部」，并提供重试入口，不阻塞全部文章列表。
 */
export function BrowseCascade(p: {
  topics: readonly Term[];
  tags: readonly Term[];
  taxonomyFailed: boolean;
  filter: BrowseFilter;
  onSelect: BrowseLevelSelect;
  onTaxonomyRetry: () => void;
}) {
  return (
    <div class="browse-cascade">
      <div class="browse-cascade-row">
        <Text
          content="主题"
          options={{ as: "p", tone: "accent", size: "meta" }}
        />
        <ChipGroup
          items={chipItems(p.topics, "全部主题")}
          onChange={(levelId) => p.onSelect("topic", levelId)}
          selectedId={browseSelectedLevelId(p.filter, "topic")}
          ariaLabel="按主题筛选"
          options={{}}
        />
      </div>
      <Show when={p.filter.topicId !== undefined}>
        <div class="browse-cascade-row">
          <Text
            content="标签"
            options={{ as: "p", tone: "accent", size: "meta" }}
          />
          <ChipGroup
            items={chipItems(p.tags, "全部标签")}
            onChange={(levelId) => p.onSelect("tag", levelId)}
            selectedId={browseSelectedLevelId(p.filter, "tag")}
            ariaLabel="按标签筛选"
            options={{}}
          />
        </div>
      </Show>
      <Show when={p.taxonomyFailed}>
        <div class="browse-cascade-degraded">
          <Text
            content="分类加载失败，暂只能浏览全部文章。"
            options={{ as: "p", tone: "muted", size: "meta" }}
          />
          <Button
            content="重试分类"
            options={{
              onClick: () => p.onTaxonomyRetry(),
              variant: "secondary",
            }}
          />
        </div>
      </Show>
    </div>
  );
}

/** 平铺卡片流：复用货架的 `ArticleCard`，样式同源（pages.css `.article-card`）。 */
export function BrowseList(p: { articles: readonly BrowseArticle[] }) {
  return (
    <div class="browse-list">
      <For each={p.articles}>
        {(article) => <ArticleCard article={article} />}
      </For>
    </div>
  );
}

export type BrowseMoreStatus = "idle" | "loading" | "error";

/** 「加载更多」：显式按钮 + 进度；失败保留已载内容并可重试。 */
export function BrowseMore(p: {
  status: BrowseMoreStatus;
  loadedCount: number;
  total: number;
  onLoadMore: () => void;
}) {
  return (
    <div class="browse-more">
      {/* 原子内容只在挂载时取值：进度变化时按 keyed 重建这一行。 */}
      <Show when={{ loaded: p.loadedCount, total: p.total }} keyed>
        {(progress) => (
          <Text
            content={`已载 ${progress.loaded} / ${progress.total} 篇`}
            options={{ as: "p", tone: "muted", size: "meta" }}
          />
        )}
      </Show>
      <Show
        when={p.status !== "error"}
        fallback={
          <>
            <Text
              content="下一页加载失败，已保留上面的内容。"
              options={{ as: "p", tone: "muted", size: "meta" }}
            />
            <Button
              content="重试加载"
              options={{ onClick: () => p.onLoadMore(), variant: "primary" }}
            />
          </>
        }
      >
        <Button
          content="加载更多"
          options={{
            onClick: () => p.onLoadMore(),
            state: p.status === "loading" ? "loading" : "enabled",
            variant: "secondary",
            width: "block",
          }}
        />
      </Show>
    </div>
  );
}
