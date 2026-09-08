import { z } from "zod";
import {
  htmlInspectionSchema,
  type HtmlInspection,
} from "../validation/article-html";

export type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type ArticleId = Brand<number, "ArticleId">;
export type ArticleTypeId = Brand<number, "ArticleTypeId">;
export type TermId = Brand<number, "TermId">;

const id = z.number().int().positive();

export type Category = {
  readonly id: number;
  readonly name: string;
  readonly parentId: number | undefined;
  readonly position: number;
};

export type TaxonomyTag = {
  readonly id: number;
  readonly name: string;
};

export type ContentTaxonomy = {
  readonly version: number;
  readonly nextCategoryId: number;
  readonly nextTagId: number;
  readonly categories: readonly Category[];
  readonly tags: readonly TaxonomyTag[];
};

export type CategoryShelfArticle = {
  readonly id: number;
  readonly title: string;
  readonly summary: string;
  readonly updatedAt: string;
  readonly categoryIds: readonly number[];
  readonly tagIds: readonly number[];
};

export type CategoryShelf = {
  readonly taxonomy: ContentTaxonomy;
  readonly selectedCategoryId: number | undefined;
  readonly articles: readonly CategoryShelfArticle[];
  readonly total: number;
};

export type ContentWorkspaceArticle = {
  readonly id: number;
  readonly title: string;
  readonly categoryIds: readonly number[];
  readonly tagIds: readonly number[];
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
  readonly workspace: ContentWorkspace;
  readonly article: ContentArticle;
};

export type ContentWorkspaceStatus =
  | "clean"
  | "saved"
  | "submitting"
  | "discarding"
  | "submitted"
  | "submitted_with_changes"
  | "failed";

export type ContentPullRequest = {
  readonly number: number;
  readonly branch: string;
  readonly commit: string;
};

export type ContentWorkspace = {
  readonly version: number;
  readonly status: ContentWorkspaceStatus;
  readonly taxonomy: ContentTaxonomy;
  readonly articles: readonly ContentWorkspaceArticle[];
  readonly pullRequest: ContentPullRequest | undefined;
  readonly lastError: string | undefined;
};

export type ContentPreview = {
  readonly version: number;
  readonly taxonomy: ContentTaxonomy;
  readonly changedArticles: readonly number[];
  readonly diff: string;
  readonly warnings: readonly string[];
};

export type ContentSyncStatus =
  | { readonly status: "idle" }
  | { readonly status: "running"; readonly commit: string }
  | {
      readonly status: "succeeded";
      readonly commit: string;
      readonly articleCount: number;
    }
  | {
      readonly status: "failed";
      readonly commit: string;
      readonly message: string;
      readonly lastSuccessCommit: string | undefined;
    };

const categorySchema = z
  .object({
    id,
    name: z.string(),
    parentId: id.nullable(),
    position: z.number().int(),
  })
  .transform(
    (value): Category => ({
      ...value,
      parentId: value.parentId ?? undefined,
    }),
  );
const taxonomyTagSchema = z.object({ id, name: z.string() });
export const contentTaxonomySchema = z.object({
  version: z.number().int().positive(),
  nextCategoryId: id,
  nextTagId: id,
  categories: z.array(categorySchema),
  tags: z.array(taxonomyTagSchema),
});
const categoryShelfArticleSchema = z.object({
  id,
  title: z.string(),
  summary: z.string(),
  updatedAt: z.string(),
  categoryIds: z.array(id),
  tagIds: z.array(id),
});
export const categoryShelfSchema = z
  .object({
    taxonomy: contentTaxonomySchema,
    selectedCategoryId: id.nullable(),
    articles: z.array(categoryShelfArticleSchema),
    total: z.number().int().nonnegative(),
  })
  .transform(
    (value): CategoryShelf => ({
      ...value,
      selectedCategoryId: value.selectedCategoryId ?? undefined,
    }),
  );
export const contentWorkspaceSchema = z
  .object({
    version: z.number().int().nonnegative(),
    status: z.enum([
      "clean",
      "saved",
      "submitting",
      "discarding",
      "submitted",
      "submitted_with_changes",
      "failed",
    ]),
    taxonomy: contentTaxonomySchema,
    articles: z.array(
      z.object({
        id,
        title: z.string(),
        categoryIds: z.array(id),
        tagIds: z.array(id),
      }),
    ),
    pullRequest: z
      .object({
        number: z.number().int().positive(),
        branch: z.string().min(1),
        commit: z.string().min(1),
      })
      .nullish(),
    lastError: z.string().nullish(),
  })
  .transform(
    (value): ContentWorkspace => ({
      ...value,
      pullRequest: value.pullRequest ?? undefined,
      lastError: value.lastError ?? undefined,
    }),
  );
export const contentArticleSchema = z
  .object({
    id,
    title: z.string(),
    summary: z.string(),
    categoryIds: z.array(id),
    tagIds: z.array(id),
    contentHtml: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    publishedAt: z.string().nullish(),
  })
  .transform(
    (value): ContentArticle => ({
      ...value,
      publishedAt: value.publishedAt ?? undefined,
    }),
  );
export const contentArticleListSchema = z.object({
  version: z.number().int().nonnegative(),
  articles: z.array(contentArticleSchema),
});
export const contentArticleDetailSchema = z.object({
  version: z.number().int().nonnegative(),
  article: contentArticleSchema,
});
export const contentArticleSaveResultSchema = z.object({
  workspace: contentWorkspaceSchema,
  article: contentArticleSchema,
});
export const contentPreviewSchema = z.object({
  version: z.number().int().nonnegative(),
  taxonomy: contentTaxonomySchema,
  changedArticles: z.array(id),
  diff: z.string(),
  warnings: z.array(z.string()),
});
export const contentSyncStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("idle") }),
  z.object({ status: z.literal("running"), commit: z.string() }),
  z.object({
    status: z.literal("succeeded"),
    commit: z.string(),
    articleCount: z.number().int().nonnegative(),
  }),
  z
    .object({
      status: z.literal("failed"),
      commit: z.string(),
      message: z.string(),
      lastSuccessCommit: z.string().nullable(),
    })
    .transform(
      (value): ContentSyncStatus => ({
        ...value,
        lastSuccessCommit: value.lastSuccessCommit ?? undefined,
      }),
    ),
]);

const articleTypeSchema = z.object({ id, name: z.string() });
const termSchema = z.object({
  id,
  name: z.string(),
  kind: z.enum(["topic", "tag"]),
});
export const articleSchema = z.object({
  id,
  title: z.string(),
  summary: z.string(),
  articleTypeId: id,
  articleType: articleTypeSchema.optional(),
  contentHtml: z.string(),
  status: z.enum(["draft", "published"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().optional(),
  termIds: z.array(id),
  terms: z.array(termSchema).optional(),
});
export const articleListItemSchema = articleSchema.omit({ contentHtml: true });
export const articleListSchema = z.object({
  items: z.array(articleListItemSchema),
  total: z.number().int().nonnegative(),
});
/** `public.article_browse` 的分页形态：items + page/pageSize/total（沿用列表端点）。 */
export const articleBrowsePageSchema = z.object({
  items: z.array(articleListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  // 后端 `ArticleListPage` wire 另带 `hasMore`；契约只承诺上面四个字段。
  hasMore: z.boolean().optional(),
});
export const adminArticleSchema = articleSchema.extend({
  htmlInspection: htmlInspectionSchema,
});
export type AdminArticle = Article & { htmlInspection: HtmlInspection };

export type ArticleType = { id: ArticleTypeId; name: string };
export type Term = { id: TermId; name: string; kind: "topic" | "tag" };
export type Article = {
  id: ArticleId;
  title: string;
  summary: string;
  articleTypeId: ArticleTypeId;
  articleType?: ArticleType;
  contentHtml: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  termIds: TermId[];
  terms?: Term[];
};

export type ArticleListItem = Omit<Article, "contentHtml">;

export type ArticleBrowsePage = {
  items: ArticleListItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore?: boolean;
};

export type MobileShelfArticle = {
  id: number;
  title: string;
  summary: string;
  updatedAt: string;
  terms: Term[];
};

export type MobileShelfSection = {
  id: string;
  title: string;
  /** 截断前该分区的全量条数：类型分区据此渲染「查看全部」（`total > N`）。 */
  total: number;
  articles: MobileShelfArticle[];
};

export type MobileShelf = {
  sections: MobileShelfSection[];
  total: number;
  hasFilters: boolean;
  warnings: string[];
};

export type TShelfFilter = {
  id: string;
  name: string;
};

export type TShelfArticle = {
  id: number;
  title: string;
  summary: string;
  updatedAt: string;
  terms: Term[];
};

export type TShelf = {
  filters: TShelfFilter[];
  selectedFilterId: string;
  articles: TShelfArticle[];
  total: number;
};

export function parseArticle(value: unknown): Article {
  return articleSchema.parse(value) as unknown as Article;
}
export function parseArticleList(value: unknown): {
  items: ArticleListItem[];
  total: number;
} {
  return articleListSchema.parse(value) as unknown as {
    items: ArticleListItem[];
    total: number;
  };
}
