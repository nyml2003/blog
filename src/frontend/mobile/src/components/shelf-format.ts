import type { ArticleType, Term } from "../../../common/contracts/domain";

/**
 * Mobile 货架共享的纯工具与形状（A 形态：多导出、成员彼此独立）。
 */

/** 货架类型分区的截断上限，对齐 wire 的 `SHELF_SECTION_LIMIT`（N = 6）。 */
export const SHELF_SECTION_LIMIT = 6;

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

export const shortDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value))
    : "";

export const pageStyles = () => null;
