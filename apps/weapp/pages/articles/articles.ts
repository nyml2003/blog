import { createWeappApi } from "../../src/runtime.ts";
import { highlightTitle } from "../../src/runtime.ts";
import { errorMessage } from "../../src/runtime.ts";
import type { ArticleSearch, CategoryShelf, MobileApiFailure } from "../../src/runtime.ts";
import { fshelfSelection, fshelfRequestId, toFShelfModel } from "../../src/runtime.ts";
import { createWeappNavigation } from "../../src/runtime.ts";
import { readWeappSettings } from "../../src/runtime.ts";
import { createWeappResource, type WeappResource } from "../../src/runtime.ts";

type Category = { readonly id: number; readonly name: string; readonly parentId?: number; readonly position: number };
type ArticleItem = { readonly id: number; readonly title: string; readonly summary: string; readonly titleSegments?: readonly { text: string; match: boolean }[] };
type ArticleData = { items: readonly ArticleItem[]; query: string; categories: readonly Category[]; categoryIndex: number; categoryId?: number; theme: string; font: string; state: "loading" | "error" | "empty" | "ready"; error: string };
type ArticlePage = WeappPageThis<ArticleData> & {
  loadCategory(categoryId: number | undefined): void;
  loadSearch(query: string): void;
  normalizeItems(items: readonly ArticleItem[], query: string): readonly ArticleItem[];
  generation?: number;
  searchResource?: WeappResource<ArticleSearch, MobileApiFailure>;
  categoryResource?: WeappResource<CategoryShelf, MobileApiFailure>;
  searchTimer?: number;
};

Page<ArticleData>({
  data: { items: [], query: "", categories: [], categoryIndex: 0, categoryId: undefined, theme: "paper", font: "sans", state: "loading", error: "" },
  onLoad(this: ArticlePage) { this.setData(readWeappSettings()); this.searchResource = createWeappResource(); this.categoryResource = createWeappResource(); this.loadCategory(undefined); },
  onUnload(this: ArticlePage) { this.generation = (this.generation ?? 0) + 1; if (this.searchTimer !== undefined) clearTimeout(this.searchTimer); this.searchResource?.resource.cancel(); this.categoryResource?.resource.cancel(); },
  normalizeItems(this: ArticlePage, items: readonly ArticleItem[], query: string) { return items.map((item) => ({ ...item, titleSegments: highlightTitle(item.title, query) })); },
  search(this: ArticlePage, e: WeappEvent<{ value: string }>) {
    const query = e.detail.value;
    this.setData({ query });
    if (this.searchTimer !== undefined) clearTimeout(this.searchTimer);
    if (query.trim() === "") { this.loadCategory(this.data.categoryId); return; }
    this.searchTimer = setTimeout(() => this.loadSearch(query), 250);
  },
  loadSearch(this: ArticlePage, query: string) {
    // Resource guards its state; this guard also blocks setData after unload or a page mode switch.
    const generation = (this.generation ?? 0) + 1;
    this.generation = generation;
    const api = createWeappApi(getApp().globalData.apiOrigin);
    this.setData({ state: "loading", error: "" });
    const resource = this.searchResource;
    if (!resource) return;
    void resource.run(() => api.search.get(query, 1)).then((result) => {
      if (generation !== this.generation) return;
      if (!result.ok) { this.setData({ state: "error", error: errorMessage(result.error) }); return; }
      const items = this.normalizeItems(result.value.items, query);
      this.setData({ items, state: items.length ? "ready" : "empty" });
    });
  },
  loadCategory(this: ArticlePage, categoryId: number | undefined) {
    const generation = (this.generation ?? 0) + 1;
    this.generation = generation;
    const api = createWeappApi(getApp().globalData.apiOrigin);
    this.setData({ state: "loading", error: "" });
    const resource = this.categoryResource;
    if (!resource) return;
    void resource.run(() => api.categoryShelf.get(categoryId)).then((result) => {
      if (generation !== this.generation) return;
      if (!result.ok) { this.setData({ state: "error", error: errorMessage(result.error) }); return; }
      const model = toFShelfModel(result.value);
      const selection = fshelfSelection(model, model.selectedCategoryId);
      const roots = model.roots;
      const selected = selection ? fshelfRequestId(selection) : undefined;
      const index = Math.max(0, roots.findIndex((category) => category.id === selection?.rootId));
      const items = this.normalizeItems(model.articles, "");
      this.setData({ categories: roots, categoryIndex: index, categoryId: selected, items, state: items.length ? "ready" : "empty" });
    });
  },
  category(this: ArticlePage, e: WeappEvent<{ value: number }>) {
    const category = this.data.categories[e.detail.value];
    if (category) this.loadCategory(category.id);
  },
  retry(this: ArticlePage) { if (this.data.query.trim()) this.loadSearch(this.data.query); else this.loadCategory(this.data.categoryId); },
  open(e: WeappEvent) { createWeappNavigation().detail(Number(e.currentTarget.dataset.id)); },
  home() { createWeappNavigation().home(); },
  settings() { createWeappNavigation().settings(); },
});
