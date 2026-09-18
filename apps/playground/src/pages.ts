import { h } from "./h";
import type { DemoArticle, DemoListItem, DemoRecommendationItem } from "./app";

/* ------------------------------------------------------------------ *
 * Views are built with h() — element references are returned as plain
 * fields, so the host never needs querySelector to find its slots.
 * ------------------------------------------------------------------ */

export interface HomeView {
  readonly root: HTMLElement;
  readonly recommendations: HTMLElement;
  readonly stackHint: HTMLElement;
}

export function buildHome(handlers: {
  onOpenList: () => void;
}): HomeView {
  const stackHint = h("p", { class: "hint stack-hint" });
  const recommendations = h("div", { class: "cards" }, h("p", { class: "hint" }, "加载中…"));
  const root = h(
    "div",
    null,
    h(
      "header",
      { class: "page-head" },
      h("h1", null, "fluvient-loom"),
      h("p", { class: "page-sub" }, "端口 · 生命周期 · mock 网络 · 迷你导航栈"),
    ),
    h("h2", { class: "section-title" }, "为你推荐"),
    recommendations,
    h(
      "button",
      { class: "more", type: "button", onClick: handlers.onOpenList },
      "查看更多 ",
      h("span", { "aria-hidden": "true" }, "→"),
    ),
    stackHint,
  );
  return { root, recommendations, stackHint };
}

export function renderRecommendations(
  container: HTMLElement,
  items: readonly DemoRecommendationItem[],
  handlers: { onOpenDetail: (id: number) => void },
): void {
  container.replaceChildren(
    ...(items.length === 0
      ? [h("p", { class: "hint" }, "暂无推荐")]
      : items.map((item) =>
          h(
            "button",
            {
              class: "card",
              type: "button",
              onClick: () => handlers.onOpenDetail(item.id),
            },
            h("span", { class: "tag" }, item.tag),
            h("span", { class: "card-title" }, item.title),
            h("span", { class: "card-summary" }, item.summary),
            h("span", { class: "card-reason" }, `推荐理由：${item.reason}`),
          ),
        )),
  );
}

export interface ArticleGroup {
  readonly tag: string;
  readonly items: readonly DemoListItem[];
}

/** Group list items under their tag, ordered by first appearance. */
export function groupArticles(
  items: readonly DemoListItem[],
): readonly ArticleGroup[] {
  const groups: { tag: string; items: DemoListItem[] }[] = [];
  const byTag = new Map<string, { tag: string; items: DemoListItem[] }>();
  for (const item of items) {
    let group = byTag.get(item.tag);
    if (group === undefined) {
      group = { tag: item.tag, items: [] };
      byTag.set(item.tag, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

export interface ListView {
  readonly root: HTMLElement;
  readonly articles: HTMLElement;
}

export function buildList(): ListView {
  const articles = h("div", { class: "cards" }, h("p", { class: "hint" }, "加载中…"));
  const root = h(
    "div",
    { class: "view-root" },
    h(
      "header",
      { class: "sheet-head" },
      h("h1", null, "全部文章"),
      h("p", { class: "page-sub" }, "上拉全屏 · 下拉 / 返回键关闭"),
    ),
    h("sticky-list-view", null, articles),
  );
  return { root, articles };
}

export function renderArticles(
  container: HTMLElement,
  items: readonly DemoListItem[],
  handlers: { onOpenDetail: (id: number) => void },
): void {
  const card = (item: DemoListItem) =>
    h(
      "button",
      {
        class: "card",
        type: "button",
        onClick: () => handlers.onOpenDetail(item.id),
      },
      h("span", { class: "card-title" }, item.title),
      h("span", { class: "card-summary" }, item.summary),
    );
  container.replaceChildren(
    ...(items.length === 0
      ? [h("p", { class: "hint" }, "列表为空")]
      : groupArticles(items).map((group) =>
          h(
            "section",
            { class: "sticky-group" },
            h(
              "h2",
              {
                class: "sticky-group-header",
                dataset: { groupHeader: "" },
              },
              group.tag,
            ),
            ...group.items.map(card),
          ),
        )),
  );
}

export interface DetailView {
  readonly root: HTMLElement;
  readonly body: HTMLElement;
  readonly related: HTMLElement;
}

export function buildDetail(
  id: number,
  form: "page" | "sheet",
  handlers: { onBack: () => void },
): DetailView {
  const body = h("article", { class: "detail" }, h("p", { class: "hint" }, "加载中…"));
  const related = h(
    "section",
    { class: "related" },
    h("h2", { class: "section-title" }, "更多文章"),
    h("div", { class: "related-grid" }, h("p", { class: "hint" }, "加载中…")),
  );
  const head = h(
    "header",
    { class: form === "sheet" ? "sheet-head" : "page-head" },
    ...(form === "page"
      ? [
          h(
            "button",
            { class: "back", type: "button", "aria-label": "返回", onClick: handlers.onBack },
            h("span", { "aria-hidden": "true" }, "‹"),
            " 返回",
          ),
        ]
      : []),
    h("h1", null, `文章 #${id}`),
    h("p", { class: "page-sub" }, "DataTask 单次拉取 · 收藏走完整生命周期"),
  );
  if (form === "sheet") {
    // Sheet-form detail scrolls inside a scroll-view so it enjoys the
    // same chain/lock mechanics as the list.
    return {
      root: h(
        "div",
        { class: "view-root" },
        head,
        h("scroll-view", null, body, related),
      ),
      body,
      related,
    };
  }
  return { root: h("div", { class: "view-root" }, head, body, related), body, related };
}

export function renderRelated(
  container: HTMLElement,
  items: readonly DemoListItem[],
  handlers: { onOpenDetail: (id: number) => void },
): void {
  container.replaceChildren(
    h("h2", { class: "section-title" }, "更多文章"),
    h(
      "div",
      { class: "related-grid" },
      ...(items.length === 0
        ? [h("p", { class: "hint" }, "没有更多了")]
        : items.map((item) =>
            h(
              "button",
              {
                class: "related-card",
                type: "button",
                onClick: () => handlers.onOpenDetail(item.id),
              },
              h("span", { class: "tag" }, item.tag),
              h("span", { class: "related-title" }, item.title),
            ),
          )),
    ),
  );
}

export interface DetailBodyOptions {
  readonly favoriteOn: boolean;
  readonly failArmed: boolean;
  readonly errorOn: boolean;
  readonly onToggleFavorite: (id: number) => void;
  readonly onArmFail: () => void;
  readonly onRetry: () => void;
}

export function renderDetailBody(
  container: HTMLElement,
  article: DemoArticle,
  options: DetailBodyOptions,
): void {
  const banner = h(
    "p",
    { class: "banner", role: "alert", hidden: !options.errorOn },
    "收藏失败，已恢复服务端状态。",
    h("button", { type: "button", onClick: options.onRetry }, "重试"),
  );
  const tools = h(
    "div",
    { class: "detail-tools" },
    h(
      "button",
      {
        class: `favorite${options.favoriteOn ? " on" : ""}`,
        type: "button",
        "aria-pressed": String(options.favoriteOn),
        onClick: () => options.onToggleFavorite(article.id),
      },
      options.favoriteOn ? "★ 已收藏" : "☆ 收藏",
    ),
    h(
      "button",
      {
        class: `arm-fail${options.failArmed ? " on" : ""}`,
        type: "button",
        onClick: options.onArmFail,
      },
      `下次收藏失败：${options.failArmed ? "开" : "关"}`,
    ),
  );
  container.replaceChildren(
    h("h2", null, article.title),
    tools,
    banner,
    ...article.paragraphs.map((paragraph) =>
      h("p", { class: "paragraph" }, paragraph),
    ),
  );
}

export function renderDetailFailed(
  container: HTMLElement,
  message: string,
): void {
  container.replaceChildren(
    h("p", { class: "banner", role: "alert" }, `加载失败：${message}`),
  );
}
