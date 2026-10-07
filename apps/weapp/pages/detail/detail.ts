import { createWeappApi } from "../../src/runtime.ts";
import { articleHtmlToRichText, type WeappRichTextNode } from "../../src/runtime.ts";
import { errorMessage } from "../../src/runtime.ts";
import type { MobileArticle, MobileApiFailure } from "../../src/runtime.ts";
import { createWeappPersistence } from "../../src/runtime.ts";
import { mobileFavoritesKey, parseMobileFavorites } from "../../src/runtime.ts";
import { readWeappSettings } from "../../src/runtime.ts";
import { createWeappResource, type WeappResource } from "../../src/runtime.ts";

type DetailData = { article: Record<string, unknown>; nodes: readonly WeappRichTextNode[]; links: readonly string[]; favorite: boolean; theme: string; font: string; state: "loading" | "error" | "ready"; error: string };
type DetailPage = WeappPageThis<DetailData> & { load(): void; generation?: number; resource?: WeappResource<MobileArticle, MobileApiFailure> };

Page<DetailData>({
  data: { article: {}, nodes: [], links: [], favorite: false, theme: "paper", font: "sans", state: "loading", error: "" },
  onLoad(this: DetailPage, options) {
    this.setData(readWeappSettings());
    this.id = options.id;
    this.resource = createWeappResource();
    const stored = createWeappPersistence().read(mobileFavoritesKey);
    this.setData({ favorite: stored.ok && parseMobileFavorites(stored.value)[String(this.id)] === true });
    this.load();
  },
  load(this: DetailPage) {
    // Resource guards its state; this guard also blocks setData after unload or a page mode switch.
    const generation = (this.generation ?? 0) + 1;
    this.generation = generation;
    const api = createWeappApi(getApp().globalData.apiOrigin);
    this.setData({ state: "loading", error: "" });
    const resource = this.resource;
    if (!resource) return;
    void resource.run(() => api.article.getPublished(Number(this.id))).then((result) => {
      if (generation !== this.generation) return;
      if (!result.ok) { this.setData({ state: "error", error: errorMessage(result.error) }); return; }
      try {
        const converted = articleHtmlToRichText(result.value.contentHtml);
        this.setData({ article: result.value, nodes: converted.nodes, links: converted.links, state: "ready" });
      } catch (error) {
        this.setData({ state: "error", error: error instanceof Error ? error.message : "正文格式无效" });
      }
    });
  },
  onUnload(this: DetailPage) { this.generation = (this.generation ?? 0) + 1; this.resource?.resource.cancel(); },
  retry(this: DetailPage) { this.load(); },
  favorite(this: DetailPage) {
    const value = !this.data.favorite;
    const persistence = createWeappPersistence();
    const stored = persistence.read(mobileFavoritesKey);
    const favorites = stored.ok ? { ...parseMobileFavorites(stored.value) } : {};
    if (value) favorites[String(this.id)] = true;
    else delete favorites[String(this.id)];
    persistence.write({ key: mobileFavoritesKey, value: JSON.stringify(favorites) });
    this.setData({ favorite: value });
  },
  openLink(this: DetailPage, e: WeappEvent) {
    const rawIndex = e.currentTarget.dataset.value;
    const index = typeof rawIndex === "number" ? rawIndex : Number(rawIndex);
    const url = this.data.links[index];
    if (typeof url !== "string" || url === "") return;
    wx.setClipboardData({ data: url, success: () => wx.showToast({ title: "链接已复制" }) });
  },
  onShareAppMessage(this: DetailPage) { return { title: String(this.data.article.title || "Blog"), path: `/pages/detail/detail?id=${this.id}` }; },
});
