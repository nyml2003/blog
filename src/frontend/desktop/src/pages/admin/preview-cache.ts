import { z } from "zod";
import { articleSchema } from "../../../../common/client/domain";
import type { Article } from "../../../../common/contracts/domain";

export const previewKey = "admin.article.preview";
const draftSchema = articleSchema.extend({
  id: z.number().int().nonnegative(),
  articleTypeId: z.number().int().nonnegative(),
});

export function readPreviewDraft(
  raw: string | null,
  id: string | null,
): Article | undefined {
  if (raw === null) return undefined;
  const expectedId = id === null ? 0 : Number(id);
  if (!Number.isSafeInteger(expectedId) || expectedId < 0) return undefined;
  try {
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.id !== expectedId) return undefined;
    return parsed.data;
  } catch {
    return undefined;
  }
}

export function cachedPreviewDraft(id: string | null): Article | undefined {
  try {
    return readPreviewDraft(sessionStorage.getItem(previewKey), id);
  } catch {
    return undefined;
  }
}
