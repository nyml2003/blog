import { z } from "zod";

const positiveId = z.number().int().positive();

const termSchema = z.object({
  id: positiveId,
  name: z.string(),
  kind: z.enum(["topic", "tag"]),
});

const shelfArticleSchema = z
  .object({
    id: positiveId,
    href: z.string(),
    title: z.string(),
    summary: z.string(),
    updatedAt: z.string(),
    terms: z.array(termSchema),
    articleTypeId: positiveId.nullish(),
    articleType: z.object({ id: positiveId, name: z.string() }).nullish(),
  })
  .transform((value) => ({
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

const articleListItemSchema = z.object({
  id: positiveId,
  title: z.string(),
  summary: z.string(),
  articleTypeId: positiveId,
  articleType: z.object({ id: positiveId, name: z.string() }).nullish(),
  status: z.enum(["draft", "published"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullish(),
  termIds: z.array(positiveId),
  terms: z.array(termSchema),
});
export const articleSearchSchema = z.object({
  items: z.array(articleListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const siteRoutesSchema = z.object({
  routes: z.record(z.string(), z.string()),
});

export const articleSchema = z
  .object({
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
  })
  .transform((value) => ({
    ...value,
    articleType: value.articleType ?? undefined,
    publishedAt: value.publishedAt ?? undefined,
    terms: value.terms ?? undefined,
  }));

export type TShelf = z.output<typeof tShelfSchema>;
export type ArticleSearch = z.output<typeof articleSearchSchema>;
export type TShelfInput = {
  readonly surface: "recommendation" | "archive";
  readonly filterId: string;
};
export type SiteRoutes = z.output<typeof siteRoutesSchema>;
export type DesktopArticle = z.output<typeof articleSchema>;
export const adminArticleSchema = articleSchema.and(
  z.object({
    htmlInspection: z.object({
      valid: z.boolean(),
      profileVersion: z.string(),
      diagnostics: z.array(z.unknown()),
    }),
  }),
);
export type AdminArticle = z.output<typeof adminArticleSchema>;
export type AdminSessionVerification = {
  readonly kind: "totp" | "recovery";
  readonly code: string;
};
export type AdminSessionLoginInput = {
  readonly password: string;
  readonly verification: AdminSessionVerification;
};
export type ContentArticle = {
  readonly id: number;
  readonly title: string;
  readonly summary: string;
  readonly categoryIds: readonly number[];
  readonly tagIds: readonly number[];
  readonly contentHtml: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | undefined;
};
export type ContentArticleList = {
  readonly version: number;
  readonly articles: readonly ContentArticle[];
};
export type ContentArticleDetail = {
  readonly version: number;
  readonly article: ContentArticle;
};
export type ContentArticleSaveResult = {
  readonly workspace: Workspace;
  readonly article: ContentArticle;
};
export type Taxonomy = {
  readonly version: number;
  readonly nextCategoryId: number;
  readonly nextTagId: number;
  readonly categories: readonly {
    readonly id: number;
    readonly name: string;
    readonly parentId: number | undefined;
    readonly position: number;
  }[];
  readonly tags: readonly { readonly id: number; readonly name: string }[];
};
export type Workspace = {
  readonly version: number;
  readonly status: string;
  readonly taxonomy: Taxonomy;
  readonly articles: readonly {
    readonly id: number;
    readonly title: string;
    readonly categoryIds: readonly number[];
    readonly tagIds: readonly number[];
  }[];
  readonly pullRequest: unknown;
  readonly lastError: string | undefined;
};
export type ContentPreview = {
  readonly version: number;
  readonly changedArticles: readonly number[];
  readonly diff: string;
  readonly warnings: readonly string[];
};
export type SyncStatus = {
  readonly status: "idle" | "running" | "succeeded" | "failed";
  readonly commit?: string;
  readonly articleCount?: number;
  readonly message?: string;
  readonly lastSuccessCommit?: string;
};

export interface DesktopApiFailure {
  readonly kind: "network" | "timeout" | "protocol" | "remote";
  readonly message: string;
  readonly code: string | undefined;
  readonly status: number | undefined;
  readonly issues: readonly string[] | undefined;
}

export interface DesktopApi {
  readonly adminSession: {
    login(
      input: AdminSessionLoginInput,
    ): import("@fluvient-loom/port").DataTask<undefined, DesktopApiFailure>;
  };
  readonly content: {
    listArticles(): import("@fluvient-loom/port").DataTask<
      ContentArticleList,
      DesktopApiFailure
    >;
    getArticle(
      id: number,
    ): import("@fluvient-loom/port").DataTask<
      ContentArticleDetail,
      DesktopApiFailure
    >;
    saveArticle(input: {
      readonly expectedVersion: number;
      readonly article: {
        readonly id?: number;
        readonly title: string;
        readonly summary: string;
        readonly categoryIds: readonly number[];
        readonly tagIds: readonly number[];
        readonly contentHtml: string;
      };
    }): import("@fluvient-loom/port").DataTask<
      ContentArticleSaveResult,
      DesktopApiFailure
    >;
    removeArticle(input: {
      readonly expectedVersion: number;
      readonly articleId: number;
    }): import("@fluvient-loom/port").DataTask<undefined, DesktopApiFailure>;
    workspace(): import("@fluvient-loom/port").DataTask<
      Workspace,
      DesktopApiFailure
    >;
    saveTaxonomy(input: {
      readonly expectedVersion: number;
      readonly taxonomy: Taxonomy;
    }): import("@fluvient-loom/port").DataTask<Workspace, DesktopApiFailure>;
    analyze(input: {
      readonly expectedVersion: number;
      readonly articleIds: readonly number[];
    }): import("@fluvient-loom/port").DataTask<Workspace, DesktopApiFailure>;
    review(input: {
      readonly expectedVersion: number;
    }): import("@fluvient-loom/port").DataTask<Workspace, DesktopApiFailure>;
    preview(): import("@fluvient-loom/port").DataTask<
      ContentPreview,
      DesktopApiFailure
    >;
    submit(input: {
      readonly expectedVersion: number;
    }): import("@fluvient-loom/port").DataTask<Workspace, DesktopApiFailure>;
    abandon(input: {
      readonly expectedVersion: number;
    }): import("@fluvient-loom/port").DataTask<Workspace, DesktopApiFailure>;
    sync(): import("@fluvient-loom/port").DataTask<
      SyncStatus,
      DesktopApiFailure
    >;
    syncStatus(): import("@fluvient-loom/port").DataTask<
      SyncStatus,
      DesktopApiFailure
    >;
  };
  readonly siteRoutes: {
    get(): import("@fluvient-loom/port").DataTask<
      SiteRoutes,
      DesktopApiFailure
    >;
  };
  readonly tShelf: {
    get(
      input: TShelfInput,
    ): import("@fluvient-loom/port").DataTask<TShelf, DesktopApiFailure>;
  };
  readonly article: {
    getPublished(
      id: number,
    ): import("@fluvient-loom/port").DataTask<
      DesktopArticle,
      DesktopApiFailure
    >;
  };
  readonly search: {
    get(
      query: string,
      page?: number,
    ): import("@fluvient-loom/port").DataTask<ArticleSearch, DesktopApiFailure>;
  };
  readonly adminArticle: {
    get(
      id: number,
    ): import("@fluvient-loom/port").DataTask<AdminArticle, DesktopApiFailure>;
  };
}
