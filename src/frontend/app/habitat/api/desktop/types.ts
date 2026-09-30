import { z } from "zod";

const positiveId = z.number().int().positive();

const termSchema = z.object({ id: positiveId, name: z.string(), kind: z.enum(["topic", "tag"]) });

const shelfArticleSchema = z.object({
  id: positiveId,
  href: z.string(),
  title: z.string(),
  summary: z.string(),
  updatedAt: z.string(),
  terms: z.array(termSchema),
  articleTypeId: positiveId.nullish(),
  articleType: z
    .object({ id: positiveId, name: z.string() })
    .nullish(),
}).transform((value) => ({
  ...value,
  articleTypeId: value.articleTypeId ?? undefined,
  articleType: value.articleType ?? undefined,
}));

export const tShelfSchema = z.object({
  filters: z.array(z.object({ id: z.string(), name: z.string() })),
  selectedFilterId: z.string(),
  articles: z.array(shelfArticleSchema),
  total: z.number().int().nonnegative(),
});

export const siteRoutesSchema = z.object({ routes: z.record(z.string(), z.string()) });

export const articleSchema = z.object({
  id: positiveId,
  title: z.string(),
  summary: z.string(),
  articleTypeId: positiveId,
  articleType: z.object({ id: positiveId, name: z.string() }).nullish(),
  contentHtml: z.string(),
  status: z.enum(["draft", "published"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullish(),
  terms: z.array(termSchema).nullish(),
}).transform((value) => ({ ...value, articleType: value.articleType ?? undefined, publishedAt: value.publishedAt ?? undefined, terms: value.terms ?? undefined }));

export type TShelf = z.output<typeof tShelfSchema>;
export type TShelfInput = {
  readonly surface: "recommendation" | "archive";
  readonly filterId: string;
};
export type SiteRoutes = z.output<typeof siteRoutesSchema>;
export type DesktopArticle = z.output<typeof articleSchema>;

export interface DesktopApiFailure {
  readonly kind: "network" | "timeout" | "protocol" | "remote";
  readonly message: string;
  readonly code: string | undefined;
  readonly status: number | undefined;
  readonly issues: readonly string[] | undefined;
}

export interface DesktopApi {
  readonly siteRoutes: {
    get(): import("../../../kernel/ports").DataTask<SiteRoutes, DesktopApiFailure>;
  };
  readonly tShelf: {
    get(input: TShelfInput): import("../../../kernel/ports").DataTask<TShelf, DesktopApiFailure>;
  };
  readonly article: {
    getPublished(id: number): import("../../../kernel/ports").DataTask<DesktopArticle, DesktopApiFailure>;
  };
}
