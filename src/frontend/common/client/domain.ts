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
