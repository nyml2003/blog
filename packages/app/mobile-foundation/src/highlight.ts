export interface HighlightSegment { readonly text: string; readonly match: boolean; }
export function highlightTitle(text: string, query: string): readonly HighlightSegment[] {
  const normalized = query.trim();
  if (normalized === "") return [{ text, match: false }];
  const source = text.toLocaleLowerCase();
  const needle = normalized.toLocaleLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = source.indexOf(needle, cursor);
    if (start < 0) { segments.push({ text: text.slice(cursor), match: false }); break; }
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false });
    segments.push({ text: text.slice(start, start + normalized.length), match: true });
    cursor = start + normalized.length;
  }
  return segments;
}
