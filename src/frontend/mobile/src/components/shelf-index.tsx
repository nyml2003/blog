import { TabGroup, type TabItem } from "../../../mobile-ui/molecules";
import type { ArticleShelfSection } from "./shelf-format";

/** 首页货架左侧的分区索引（纵向标签组）。 */
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
