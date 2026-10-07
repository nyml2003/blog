import { createWeappApi } from "../../src/runtime.ts";
import { tShelfFromPageModule, type MobilePage, type MobileApiFailure } from "../../src/runtime.ts";
import { toTShelfModel } from "../../src/runtime.ts";
import { errorMessage } from "../../src/runtime.ts";
import { createWeappNavigation } from "../../src/runtime.ts";
import { readWeappSettings } from "../../src/runtime.ts";
import { createWeappResource } from "../../src/runtime.ts";

type HomeItem = { readonly id: number; readonly title: string; readonly summary: string };
type HomeData = { items: readonly HomeItem[]; theme: string; font: string; state: "loading" | "error" | "empty" | "ready"; error: string };
type HomePage = WeappPageThis<HomeData> & { load(): void; generation?: number; onUnload(): void; resource?: ReturnType<typeof createWeappResource<MobilePage, MobileApiFailure>> };

Page<HomeData>({
  data: { items: [], theme: "paper", font: "sans", state: "loading", error: "" },
  onLoad(this: HomePage) { this.setData(readWeappSettings()); this.resource = createWeappResource<MobilePage, MobileApiFailure>(); this.load(); },
  onUnload(this: HomePage) { this.generation = (this.generation ?? 0) + 1; this.resource?.resource.cancel(); },
  load(this: HomePage) {
    // Resource guards its state; this guard also blocks setData after unload or a page mode switch.
    const generation = (this.generation ?? 0) + 1;
    this.generation = generation;
    const api = createWeappApi(getApp().globalData.apiOrigin);
    this.setData({ state: "loading", error: "" });
    const resource = this.resource;
    if (!resource) return;
    void resource.run(() => api.page.get("home", { surface: "recommendation", filter_id: "all" })).then((result) => {
      if (generation !== this.generation) return;
      if (!result.ok) { this.setData({ state: "error", error: errorMessage(result.error) }); return; }
      const shelf = tShelfFromPageModule(result.value);
      if (!shelf) { this.setData({ state: "error", error: "首页模块格式无效" }); return; }
      const model = toTShelfModel(shelf);
      this.setData({ items: model.articles, state: model.articles.length ? "ready" : "empty" });
    });
  },
  retry(this: HomePage) { this.load(); },
  open(e: WeappEvent) { createWeappNavigation().detail(Number(e.currentTarget.dataset.id)); },
  home() {},
  articles() { createWeappNavigation().articles(); },
  settings() { createWeappNavigation().settings(); },
});
