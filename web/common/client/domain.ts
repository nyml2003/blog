import { z } from "zod";

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
export const articleListSchema = z.object({
  items: z.array(articleSchema),
  total: z.number().int().nonnegative(),
});

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
  articles: MobileShelfArticle[];
};

export type MobileShelf = {
  sections: MobileShelfSection[];
  total: number;
  hasFilters: boolean;
  warnings: string[];
};

export function parseArticle(value: unknown): Article {
  return articleSchema.parse(value) as unknown as Article;
}
export function parseArticleList(value: unknown): {
  items: Article[];
  total: number;
} {
  return articleListSchema.parse(value) as unknown as {
    items: Article[];
    total: number;
  };
}
