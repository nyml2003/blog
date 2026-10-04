import type { Taxonomy } from "@blog/desktop-api";

export function parseTaxonomy(
  source: string,
): { ok: true; value: Taxonomy } | { ok: false; message: string } {
  try {
    const value = JSON.parse(source) as Taxonomy;
    if (
      !value ||
      !Number.isInteger(value.version) ||
      !Array.isArray(value.categories) ||
      !Array.isArray(value.tags)
    )
      return { ok: false, message: "taxonomy 结构不符合协议" };
    return {
      ok: true,
      value: {
        ...value,
        categories: value.categories.map((category) => ({
          ...category,
          parentId: category.parentId ?? undefined,
        })),
      },
    };
  } catch {
    return { ok: false, message: "taxonomy JSON 无法解析" };
  }
}
