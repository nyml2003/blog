// 组内选中项对齐机制：TabGroup / ChipGroup 共用（机制必须复用，声明才允许重复）。

/** 仅在元素越出容器可视区时滚动差额（横向）；已完整可见则不动。
 * 只写容器 scrollLeft，不触发页面级滚动。 */
export function scrollIntoRowView(
  container: HTMLElement,
  item: HTMLElement,
): void {
  const row = container.getBoundingClientRect();
  const rect = item.getBoundingClientRect();
  const hiddenLeft = rect.left - row.left;
  const hiddenRight = row.right - rect.right;
  if (hiddenLeft < 0) {
    container.scrollLeft += hiddenLeft;
  } else if (hiddenRight < 0) {
    container.scrollLeft -= hiddenRight;
  }
}
