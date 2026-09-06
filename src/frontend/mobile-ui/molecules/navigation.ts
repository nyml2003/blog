export type RovingDirection = "next" | "previous" | "first" | "last";

export function nextRovingIndex(
  currentIndex: number,
  itemCount: number,
  direction: RovingDirection,
): number {
  if (itemCount <= 0) return -1;
  if (direction === "first") return 0;
  if (direction === "last") return itemCount - 1;
  if (direction === "next") return (currentIndex + 1) % itemCount;
  return (currentIndex - 1 + itemCount) % itemCount;
}
