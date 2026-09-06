export type EditorSnapshot = {
  title: string;
  summary: string;
  typeId: number;
  termIds: readonly number[];
  contentHtml: string;
};

export function editorSnapshot(input: EditorSnapshot): EditorSnapshot {
  return {
    title: input.title.trim(),
    summary: input.summary.trim(),
    typeId: input.typeId,
    termIds: [...input.termIds].sort((a, b) => a - b),
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
    a.typeId === b.typeId &&
    a.contentHtml === b.contentHtml &&
    a.termIds.length === b.termIds.length &&
    a.termIds.every((value, index) => value === b.termIds[index])
  );
}
