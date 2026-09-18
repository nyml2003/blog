import { ScrollView } from "./scroll-view";

/**
 * <sticky-list-view> — a scroll-view whose content is grouped under
 * sticky section headers (CSS position: sticky, non-stacking: each header
 * pins at the container top while its own group is in view). It inherits
 * the entire NestedGesture child role from <scroll-view> unchanged; the
 * grouping is pure presentation.
 *
 * stuckHeaderHeight() reports the protocol's "effective top bound"
 * introspection — the total height of currently pinned headers. With CSS
 * sticky the downward hand-over bound correctly stays scrollTop 0
 * (headers are content); implementations that pin chrome inside the
 * scroller would feed this value to setTopBoundProvider() instead.
 */
export class StickyListView extends ScrollView {
  stuckHeaderHeight(): number {
    const hostTop = this.getBoundingClientRect().top;
    let total = 0;
    for (const header of this.querySelectorAll<HTMLElement>(
      "[data-group-header]",
    )) {
      const rect = header.getBoundingClientRect();
      if (rect.top <= hostTop + 1) total += rect.height;
    }
    return total;
  }
}
