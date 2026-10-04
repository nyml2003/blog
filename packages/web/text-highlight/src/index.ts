export type TextMatch = {
  readonly start: number;
  readonly end: number;
};

export type TextMatcher = {
  readonly query: string;
  readonly matches: readonly TextMatch[];
};

/** Returns non-overlapping, UTF-16 offsets for a literal query. */
export function findTextMatches(text: string, query: string): TextMatcher {
  const normalizedQuery = query.trim();
  if (normalizedQuery === "") return { query: normalizedQuery, matches: [] };

  const source = text.toLocaleLowerCase();
  const needle = normalizedQuery.toLocaleLowerCase();
  const matches: TextMatch[] = [];
  let cursor = 0;
  while (cursor <= source.length - needle.length) {
    const start = source.indexOf(needle, cursor);
    if (start < 0) break;
    const end = start + needle.length;
    matches.push({ start, end });
    cursor = end;
  }
  return { query: normalizedQuery, matches };
}

export function mergeTextMatches(
  matchers: readonly TextMatcher[],
): readonly TextMatch[] {
  return matchers
    .flatMap((matcher) => matcher.matches)
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .filter((match, index, all) => {
      const previous = all[index - 1];
      return previous === undefined || match.start >= previous.end;
    });
}
