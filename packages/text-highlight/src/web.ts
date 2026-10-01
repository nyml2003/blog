import { findTextMatches, type TextMatch } from "./index.ts";

type TextSegment = {
  readonly node: Text;
  readonly start: number;
  readonly end: number;
};

export type HighlightSession = {
  readonly count: number;
  readonly focus: (index: number) => boolean;
  readonly clear: () => void;
};

const HIGHLIGHT_NAME = "loom-text-highlight";
const MARK_ATTRIBUTE = "data-loom-text-highlight";

function textSegments(root: HTMLElement): TextSegment[] {
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (
          parent === null ||
          parent.closest(`script, style, [${MARK_ATTRIBUTE}]`) !== null
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  const segments: TextSegment[] = [];
  let offset = 0;
  let current: Node | null = walker.nextNode();
  while (current instanceof Text) {
    const end = offset + current.data.length;
    segments.push({ node: current, start: offset, end });
    offset = end;
    current = walker.nextNode();
  }
  return segments;
}

function rangesForMatches(
  root: HTMLElement,
  matches: readonly TextMatch[],
): Range[] {
  const segments = textSegments(root);
  return matches.flatMap((match) => {
    const start = segments.find(
      (segment) => match.start >= segment.start && match.start < segment.end,
    );
    const end = segments.find(
      (segment) => match.end > segment.start && match.end <= segment.end,
    );
    if (start === undefined || end === undefined) return [];
    const range = root.ownerDocument.createRange();
    range.setStart(start.node, match.start - start.start);
    range.setEnd(end.node, match.end - end.start);
    return [range];
  });
}

function unwrapMarks(root: HTMLElement): void {
  for (const mark of Array.from(root.querySelectorAll(`[${MARK_ATTRIBUTE}]`))) {
    const parent = mark.parentNode;
    if (parent === null) continue;
    while (mark.firstChild !== null) parent.insertBefore(mark.firstChild, mark);
    mark.remove();
  }
}

function wrapRanges(root: HTMLElement, ranges: readonly Range[]): void {
  for (const range of [...ranges].reverse()) {
    const mark = root.ownerDocument.createElement("mark");
    mark.setAttribute(MARK_ATTRIBUTE, "true");
    mark.append(range.extractContents());
    range.insertNode(mark);
  }
}

export function highlightText(
  root: HTMLElement,
  query: string,
): HighlightSession {
  clearTextHighlight(root);
  const segments = textSegments(root);
  const text = segments.map((segment) => segment.node.data).join("");
  const matches = findTextMatches(text, query).matches;
  const ranges = rangesForMatches(root, matches);
  const supportsCustomHighlight =
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    typeof Highlight !== "undefined";

  if (supportsCustomHighlight) {
    const highlight = new Highlight(...ranges);
    CSS.highlights.set(HIGHLIGHT_NAME, highlight);
    const focus = (index: number): boolean => {
      const range = ranges[index];
      if (range === undefined) return false;
      range.startContainer.parentElement?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
      return true;
    };
    return {
      count: ranges.length,
      focus,
      clear: () => {
        CSS.highlights.delete(HIGHLIGHT_NAME);
      },
    };
  }

  wrapRanges(root, ranges);
  const marks = Array.from(root.querySelectorAll(`[${MARK_ATTRIBUTE}]`));
  return {
    count: marks.length,
    focus: (index: number) => {
      const mark = marks[index];
      if (!(mark instanceof HTMLElement)) return false;
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
      return true;
    },
    clear: () => unwrapMarks(root),
  };
}

export function clearTextHighlight(root: HTMLElement): void {
  if (typeof CSS !== "undefined" && "highlights" in CSS) {
    CSS.highlights.delete(HIGHLIGHT_NAME);
  }
  unwrapMarks(root);
}
