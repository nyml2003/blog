export type ArticleType = {
  readonly id: number;
  readonly name: string;
};

export type Term = {
  readonly id: number;
  readonly name: string;
  readonly kind: "topic" | "tag";
};

export type Article = {
  readonly id: number;
  readonly title: string;
  readonly summary: string;
  readonly articleTypeId: number;
  readonly articleType?: ArticleType;
  readonly contentHtml: string;
  readonly status: "draft" | "published";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt?: string;
  readonly termIds: readonly number[];
  readonly terms?: readonly Term[];
};

export type ArticleFilter = {
  termIds: string[];
  typeId: string;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
};

export type MobileShelfArticle = {
  readonly id: number;
  readonly title: string;
  readonly summary: string;
  readonly updatedAt: string;
  readonly terms: readonly Term[];
};

export type MobileShelfSection = {
  readonly id: string;
  readonly title: string;
  readonly articles: readonly MobileShelfArticle[];
};

export type MobileShelf = {
  readonly sections: readonly MobileShelfSection[];
  readonly total: number;
  readonly hasFilters: boolean;
  readonly warnings: readonly string[];
};

export const emptyFilter = (): ArticleFilter => ({
  termIds: [],
  typeId: "",
  createdFrom: "",
  createdTo: "",
  updatedFrom: "",
  updatedTo: "",
});
