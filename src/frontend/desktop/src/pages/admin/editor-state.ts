export type EditorSnapshot = {
  title: string;
  summary: string;
  categoryIds: readonly number[];
  tagIds: readonly number[];
  contentHtml: string;
};

export function editorSnapshot(input: EditorSnapshot): EditorSnapshot {
  return {
    title: input.title.trim(),
    summary: input.summary.trim(),
    categoryIds: [...input.categoryIds].sort((a, b) => a - b),
    tagIds: [...input.tagIds].sort((a, b) => a - b),
    contentHtml: input.contentHtml,
  };
}

export function editorSnapshotsEqual(
  left: EditorSnapshot | undefined,
  right: EditorSnapshot | undefined,
): boolean {
  if (!left || !right) return false;
  const a = editorSnapshot(left);
  const b = editorSnapshot(right);
  return (
    a.title === b.title &&
    a.summary === b.summary &&
    a.contentHtml === b.contentHtml &&
    a.categoryIds.length === b.categoryIds.length &&
    a.categoryIds.every((value, index) => value === b.categoryIds[index]) &&
    a.tagIds.length === b.tagIds.length &&
    a.tagIds.every((value, index) => value === b.tagIds[index])
  );
}

export function editorPageTitle(
  initialCreation: boolean,
  currentId: number,
): "新建文章" | "编辑文章" {
  if (initialCreation && currentId === 0) return "新建文章";
  return "编辑文章";
}

export type SourceAssociatedValue<T> = {
  readonly source: string;
  readonly value: T;
};

export function valueForCurrentSource<T>(
  currentSource: string,
  serverValue: SourceAssociatedValue<T> | undefined,
  localValue: T | undefined,
): T | undefined {
  if (serverValue?.source === currentSource) return serverValue.value;
  return localValue;
}
