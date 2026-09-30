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

export type TShelf = z.output<typeof tShelfSchema>;
export type TShelfInput = {
  readonly surface: "recommendation" | "archive";
  readonly filterId: string;
};
export type SiteRoutes = z.output<typeof siteRoutesSchema>;

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
}
