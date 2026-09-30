import { z } from "zod";

const positiveId = z.number().int().positive();

export const mobileTermSchema = z.object({
  id: positiveId,
  name: z.string(),
  kind: z.enum(["topic", "tag"]),
});
export type MobileTerm = z.output<typeof mobileTermSchema>;

const articleTypeSchema = z.object({ id: positiveId, name: z.string() });

export const mobileArticleSchema = z
  .object({
    id: positiveId,
    title: z.string(),
    summary: z.string(),
    articleTypeId: positiveId,
    articleType: articleTypeSchema.nullish(),
    contentHtml: z.string(),
    status: z.enum(["draft", "published"]),
    createdAt: z.string(),
    updatedAt: z.string(),
    publishedAt: z.string().nullish(),
    termIds: z.array(positiveId),
    terms: z.array(mobileTermSchema).nullish(),
  })
  .transform((value) => ({
    ...value,
    articleType: value.articleType ?? undefined,
    publishedAt: value.publishedAt ?? undefined,
    terms: value.terms ?? undefined,
  }));
export type MobileArticle = z.output<typeof mobileArticleSchema>;

const htmlInspectionSchema = z.object({
  valid: z.boolean(),
  profileVersion: z.string(),
  diagnostics: z.array(z.unknown()),
});
export const adminArticleSchema = mobileArticleSchema.and(
  z.object({ htmlInspection: htmlInspectionSchema }),
);
export type AdminArticle = z.output<typeof adminArticleSchema>;

const shelfArticleSchema = z.object({
  id: positiveId,
  href: z.string(),
  title: z.string(),
  summary: z.string(),
  updatedAt: z.string(),
  terms: z.array(mobileTermSchema),
});

export const tShelfSchema = z.object({
  filters: z.array(z.object({ id: z.string(), name: z.string() })),
  selectedFilterId: z.string(),
  articles: z.array(shelfArticleSchema),
  total: z.number().int().nonnegative(),
});
export type TShelf = z.output<typeof tShelfSchema>;
export type TShelfInput = {
  readonly surface: "recommendation" | "archive";
  readonly filterId: string;
};

export const categoryShelfSchema = z.object({
  taxonomy: z.object({
    version: z.number().int().positive(),
    nextCategoryId: positiveId,
    nextTagId: positiveId,
    categories: z.array(
      z.object({
        id: positiveId,
        name: z.string(),
        parentId: positiveId.nullish().transform((value) => value ?? undefined),
        position: z.number().int(),
      }),
    ),
    tags: z.array(z.object({ id: positiveId, name: z.string() })),
  }),
  selectedCategoryId: positiveId
    .nullish()
    .transform((value) => value ?? undefined),
  articles: z.array(
    z.object({
      id: positiveId,
      href: z.string(),
      title: z.string(),
      summary: z.string(),
      updatedAt: z.string(),
      categoryIds: z.array(positiveId),
      tagIds: z.array(positiveId),
    }),
  ),
  total: z.number().int().nonnegative(),
});
export type CategoryShelf = z.output<typeof categoryShelfSchema>;

export const siteRoutesSchema = z.object({
  routes: z.record(z.string(), z.string()),
});
export type SiteRoutes = z.output<typeof siteRoutesSchema>;

export interface MobileApiFailure {
  readonly kind: "network" | "timeout" | "protocol" | "remote";
  readonly message: string;
  readonly code: string | undefined;
  readonly status: number | undefined;
  readonly issues: readonly string[] | undefined;
}

export interface MobileApi {
  readonly siteRoutes: {
    get(): import("../../../kernel/ports").DataTask<
      SiteRoutes,
      MobileApiFailure
    >;
  };
  readonly tShelf: {
    get(
      input: TShelfInput,
    ): import("../../../kernel/ports").DataTask<TShelf, MobileApiFailure>;
  };
  readonly categoryShelf: {
    get(
      categoryId: number | undefined,
    ): import("../../../kernel/ports").DataTask<
      CategoryShelf,
      MobileApiFailure
    >;
  };
  readonly article: {
    getPublished(
      id: number,
    ): import("../../../kernel/ports").DataTask<
      MobileArticle,
      MobileApiFailure
    >;
  };
  readonly adminArticle: {
    get(
      id: number,
    ): import("../../../kernel/ports").DataTask<AdminArticle, MobileApiFailure>;
  };
}
