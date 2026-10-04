import { z } from "zod";

const positiveId = z.number().int().positive();

export const mobileTermSchema = z.object({
  id: positiveId,
  name: z.string(),
  kind: z.enum(["topic", "tag"]),
});
export type MobileTerm = z.output<typeof mobileTermSchema>;

const articleTypeSchema = z.object({ id: positiveId, name: z.string() });

const articleListItemSchema = z.object({
  id: positiveId,
  title: z.string(),
  summary: z.string(),
  articleTypeId: positiveId,
  articleType: articleTypeSchema.nullish(),
  status: z.enum(["draft", "published"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullish(),
  termIds: z.array(positiveId),
  terms: z.array(mobileTermSchema),
});

export const articleSearchSchema = z.object({
  items: z.array(articleListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type ArticleSearch = z.output<typeof articleSearchSchema>;

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

export const mobileNavigationIconSchema = z.string().trim().min(1);
export type MobileNavigationIcon = z.output<typeof mobileNavigationIconSchema>;

const supportedMobileNavigationIconIds = new Set([
  "back",
  "search",
  "favorite",
  "share",
  "more",
]);

export const mobileNavigationSchema = z.object({
  leftIcons: z.array(z.string()),
  rightIcons: z.array(z.string()),
  shareUrl: z.string().min(1).optional(),
});
export interface MobileNavigation {
  readonly leftIcons: readonly MobileNavigationIcon[];
  readonly rightIcons: readonly MobileNavigationIcon[];
  readonly shareUrl?: string;
}

export const mobileModuleSchema = z.object({
  moduleKey: z.string().min(1),
  data: z.unknown(),
});
export type MobileModule = z.output<typeof mobileModuleSchema>;

export const mobilePageSchema = z.object({
  modules: z.array(mobileModuleSchema),
});
export type MobilePage = z.output<typeof mobilePageSchema>;

export function supportedNavigationIcons(
  values: readonly string[],
): MobileNavigationIcon[] {
  return values.flatMap((value) => {
    const parsed = mobileNavigationIconSchema.safeParse(value);
    return parsed.success && supportedMobileNavigationIconIds.has(parsed.data)
      ? [parsed.data]
      : [];
  });
}

export function navigationFromModule(
  module: MobileModule | undefined,
): MobileNavigation | undefined {
  if (module?.moduleKey !== "mobile.navigation") return undefined;
  const parsed = mobileNavigationSchema.safeParse(module.data);
  if (!parsed.success) return undefined;
  return {
    ...parsed.data,
    leftIcons: supportedNavigationIcons(parsed.data.leftIcons),
    rightIcons: supportedNavigationIcons(parsed.data.rightIcons),
  };
}

export function navigationFromPage(page: {
  readonly modules: readonly {
    readonly moduleKey: string;
    readonly data: unknown;
  }[];
}): MobileNavigation | undefined {
  return navigationFromModule(moduleByKey(page, "mobile.navigation"));
}

export function tShelfFromPageModule(page: {
  readonly modules: readonly {
    readonly moduleKey: string;
    readonly data: unknown;
  }[];
}): TShelf | undefined {
  const parsed = tShelfSchema.safeParse(
    moduleByKey(page, "mobile.t-shelf")?.data,
  );
  return parsed.success ? parsed.data : undefined;
}

export function categoryShelfFromPageModule(page: {
  readonly modules: readonly {
    readonly moduleKey: string;
    readonly data: unknown;
  }[];
}): CategoryShelf | undefined {
  const parsed = categoryShelfSchema.safeParse(
    moduleByKey(page, "mobile.category-shelf")?.data,
  );
  return parsed.success ? parsed.data : undefined;
}

export function moduleByKey(
  page: {
    readonly modules: readonly {
      readonly moduleKey: string;
      readonly data: unknown;
    }[];
  },
  moduleKey: string,
): MobileModule | undefined {
  return page.modules.find((module) => module.moduleKey === moduleKey);
}

export function articleFromPageModule(page: {
  readonly modules: readonly {
    readonly moduleKey: string;
    readonly data: unknown;
  }[];
}): MobileArticle | undefined {
  const module = moduleByKey(page, "mobile.article-detail");
  const parsed = mobileArticleSchema.safeParse(module?.data);
  return parsed.success ? parsed.data : undefined;
}

export interface MobileApiFailure {
  readonly kind: "network" | "timeout" | "protocol" | "remote";
  readonly message: string;
  readonly code: string | undefined;
  readonly status: number | undefined;
  readonly issues: readonly string[] | undefined;
}

export interface MobileApi {
  readonly page: {
    get(
      page: string,
      parameters?: Readonly<Record<string, string | undefined>>,
    ): import("@fluvient-loom/port").DataTask<MobilePage, MobileApiFailure>;
  };
  readonly siteRoutes: {
    get(): import("@fluvient-loom/port").DataTask<SiteRoutes, MobileApiFailure>;
  };
  readonly tShelf: {
    get(
      input: TShelfInput,
    ): import("@fluvient-loom/port").DataTask<TShelf, MobileApiFailure>;
  };
  readonly categoryShelf: {
    get(
      categoryId: number | undefined,
    ): import("@fluvient-loom/port").DataTask<CategoryShelf, MobileApiFailure>;
  };
  readonly article: {
    getPublished(
      id: number,
    ): import("@fluvient-loom/port").DataTask<MobileArticle, MobileApiFailure>;
  };
  readonly search: {
    get(
      query: string,
      page?: number,
    ): import("@fluvient-loom/port").DataTask<ArticleSearch, MobileApiFailure>;
  };
  readonly adminArticle: {
    get(
      id: number,
    ): import("@fluvient-loom/port").DataTask<AdminArticle, MobileApiFailure>;
  };
}
