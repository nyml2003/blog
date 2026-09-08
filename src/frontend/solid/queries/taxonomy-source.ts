import type { ContentTaxonomy } from "../../common/client";
import { contentTaxonomySchema } from "../../common/client";

export type TaxonomySourceResult =
  | { readonly ok: true; readonly value: ContentTaxonomy }
  | { readonly ok: false; readonly message: string };

export const formatTaxonomySource = (taxonomy: ContentTaxonomy): string =>
  JSON.stringify(
    {
      ...taxonomy,
      categories: taxonomy.categories.map((category) => ({
        ...category,
        parentId: category.parentId ?? null,
      })),
    },
    undefined,
    2,
  );

export const parseTaxonomySource = (source: string): TaxonomySourceResult => {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return { ok: false, message: "taxonomy JSON 无法解析" };
  }
  const parsed = contentTaxonomySchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".") || "taxonomy";
    return {
      ok: false,
      message: `${field}: ${issue?.message ?? "结构不符合协议"}`,
    };
  }
  return { ok: true, value: parsed.data };
};
