import type { EditorSnapshot } from "./editor-state";

const draftKey = "blog.admin.article-editor.session-draft.v1";

export type EditorSessionDraft = {
  readonly schemaVersion: 1;
  readonly returnPath: string;
  readonly expectedVersion: number;
  readonly values: EditorSnapshot & { readonly id: number };
};

export type EditorDraftStorage = {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
};

const isNonnegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isPositiveIntegerArray = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      typeof item === "number" && Number.isSafeInteger(item) && item > 0,
  );

const isEditorPath = (value: string, articleId: number): boolean => {
  if (!value.startsWith("/admin/") || /\\|%5c/i.test(value)) return false;
  let parsed: URL;
  try {
    parsed = new URL(value, "https://editor.invalid");
  } catch {
    return false;
  }
  if (parsed.origin !== "https://editor.invalid") return false;
  if (`${parsed.pathname}${parsed.search}` !== value) return false;
  if (parsed.pathname === "/admin/articles/new.html") return articleId === 0;
  if (parsed.pathname !== "/admin/articles/edit.html") return false;
  return parsed.searchParams.get("id") === String(articleId);
};

const parseDraft = (value: unknown): EditorSessionDraft | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  if (!("schemaVersion" in value) || value.schemaVersion !== 1)
    return undefined;
  if (!("returnPath" in value) || typeof value.returnPath !== "string") {
    return undefined;
  }
  if (
    !("expectedVersion" in value) ||
    !isNonnegativeInteger(value.expectedVersion)
  ) {
    return undefined;
  }
  if (
    !("values" in value) ||
    typeof value.values !== "object" ||
    value.values === null
  ) {
    return undefined;
  }
  const values = value.values;
  if (!("id" in values) || !isNonnegativeInteger(values.id)) return undefined;
  if (!("title" in values) || typeof values.title !== "string")
    return undefined;
  if (!("summary" in values) || typeof values.summary !== "string")
    return undefined;
  if (!("contentHtml" in values) || typeof values.contentHtml !== "string") {
    return undefined;
  }
  if (
    !("categoryIds" in values) ||
    !isPositiveIntegerArray(values.categoryIds)
  ) {
    return undefined;
  }
  if (!("tagIds" in values) || !isPositiveIntegerArray(values.tagIds)) {
    return undefined;
  }
  if (!isEditorPath(value.returnPath, values.id)) return undefined;
  return {
    schemaVersion: 1,
    returnPath: value.returnPath,
    expectedVersion: value.expectedVersion,
    values: {
      id: values.id,
      title: values.title,
      summary: values.summary,
      categoryIds: values.categoryIds,
      tagIds: values.tagIds,
      contentHtml: values.contentHtml,
    },
  };
};

export const writeEditorSessionDraft = (
  storage: EditorDraftStorage | undefined,
  draft: EditorSessionDraft,
): void => {
  if (
    storage === undefined ||
    !isEditorPath(draft.returnPath, draft.values.id)
  ) {
    return;
  }
  try {
    storage.setItem(draftKey, JSON.stringify(draft));
  } catch {
    // Storage failure must not block the redirect or editor controls.
  }
};

export const takeEditorSessionDraft = (
  storage: EditorDraftStorage | undefined,
  returnPath: string,
): EditorSessionDraft | undefined => {
  if (storage === undefined) return undefined;
  let raw: string | null;
  try {
    raw = storage.getItem(draftKey);
  } catch {
    return undefined;
  }
  if (raw === null) return undefined;
  let draft: EditorSessionDraft | undefined;
  try {
    draft = parseDraft(JSON.parse(raw));
  } catch {
    draft = undefined;
  }
  if (draft === undefined || draft.returnPath !== returnPath) return undefined;
  try {
    storage.removeItem(draftKey);
  } catch {
    // Returning the validated in-memory value is still safe.
  }
  return draft;
};

export const clearEditorSessionDraft = (
  storage: EditorDraftStorage | undefined,
): void => {
  try {
    storage?.removeItem(draftKey);
  } catch {
    // A stale recovery record is preferable to failing an authoritative save.
  }
};
