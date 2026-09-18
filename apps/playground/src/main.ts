/**
 * Playground host assembly: navigation + data + lifecycle wiring. Every
 * gesture experience lives inside <bottom-sheet> / <scroll-view>; views
 * are built with h() so the host holds element references directly — no
 * template strings, no querySelector, no event delegation. The same
 * detail content takes its form from the origin slot: pushed from home it
 * is a full page (a real navigation); opened from the list sheet it is a
 * sheet too (pure UI, like the list itself).
 */
import "./components/demo-page";
import "@fluvient-loom/gesture-web";
import {
  createWebNavigation,
  createWebOperationId,
  createWebPersistence,
  createWebScheduler,
} from "@fluvient-loom/web";
import { createDemoApp } from "./app";
import { h } from "./h";
import { log } from "./log";
import { createDemoNavigator } from "./nav";
import {
  buildDetail,
  buildHome,
  buildList,
  renderArticles,
  renderDetailBody,
  renderDetailFailed,
  renderRecommendations,
  renderRelated,
  type DetailView,
  type HomeView,
  type ListView,
} from "./pages";

type BottomSheetElement = import("@fluvient-loom/gesture-web").BottomSheet;

const homeView = document.getElementById("home")!;
const detailView = document.getElementById("detail")!;
const listSheet = document.getElementById("list-sheet") as BottomSheetElement;
const detailSheet = document.getElementById(
  "detail-sheet",
) as BottomSheetElement;

const navigation = createWebNavigation();
const navigator = createDemoNavigator(navigation);
const app = createDemoApp({
  persistence: createWebPersistence(),
  scheduler: createWebScheduler(),
  operationIds: createWebOperationId(),
  onFavorites: (favorites) => {
    log("lifecycle", "favorites projected", favorites);
    refreshDetail();
  },
});

let home: HomeView | undefined;
let list: ListView | undefined;
let pageDetail: { id: number; view: DetailView } | undefined;
let sheetDetail: { id: number; view: DetailView } | undefined;
let failNextArmed = false;

for (const component of [listSheet, detailSheet]) {
  component.addEventListener("dismiss", () => {
    // Sheets are page UI, not navigation — closing never touches history;
    // the view stack must still unwind, or a later open short-circuits.
    component.close();
    navigator.closeSheet();
  });
}

/* ------------------------------------------------------------------ *
 * Detail rendering (shared by both forms)
 * ------------------------------------------------------------------ */

function detailOptions(id: number) {
  const mutation = app.favorites.state();
  return {
    favoriteOn: mutation.value.ids.includes(id),
    failArmed: failNextArmed,
    errorOn: mutation.status === "error",
    onToggleFavorite: (articleId: number) => {
      void app.toggleFavorite(articleId);
    },
    onArmFail: () => {
      failNextArmed = !failNextArmed;
      if (failNextArmed) app.server.failNextFavorite();
      refreshDetail();
    },
    onRetry: () => {
      void app.favorites.retry();
    },
  };
}

function loadDetail(entry: { id: number; view: DetailView }): void {
  void app.fetchArticle(entry.id).then((result) => {
    if (!result.ok) {
      renderDetailFailed(entry.view.body, result.error.message);
      return;
    }
    renderDetailBody(entry.view.body, result.value, detailOptions(entry.id));
  });
  void app.fetchRelated(entry.id).then((result) => {
    if (!result.ok) return;
    renderRelated(entry.view.related, result.value, {
      // Related items always open as full pages, whatever form the
      // current detail is in.
      onOpenDetail: (id) => openDetailFrom("page", id),
    });
  });
}

function refreshDetail(): void {
  const current = navigator.current();
  if (current.name !== "detail") return;
  const entry = current.form === "page" ? pageDetail : sheetDetail;
  if (entry === undefined || entry.id !== current.id) return;
  void app.fetchArticle(current.id).then((result) => {
    if (!result.ok || navigator.current().name !== "detail") return;
    renderDetailBody(entry.view.body, result.value, detailOptions(current.id));
  });
}

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */

function openDetailFrom(form: "page" | "sheet", id: number): void {
  navigator.openDetail(id, form);
}

function showView(view: import("./nav").DemoView): void {
  log("view", "showView", view);
  if (view.name === "list") {
    detailSheet.close();
    detailView.hidePopover();
    homeView.hidden = false;
    if (list === undefined) {
      list = buildList();
      listSheet.append(list.root);
      void app.fetchList().then((result) => {
        if (list === undefined) return;
        if (result.ok) {
          renderArticles(list.articles, result.value, {
            onOpenDetail: (id) => openDetailFrom("sheet", id),
          });
        } else {
          list.articles.append(
            h("p", { class: "hint" }, `列表加载失败：${result.error.message}`),
          );
        }
      });
    }
    if (listSheet.state === "closed") {
      listSheet.openTo("half");
    }
    return;
  }
  if (view.name === "detail") {
    homeView.hidden = false;
    if (view.form === "page") {
      // Full page over the sheet: covered, not closed; back reveals it.
      detailSheet.close();
      detailView.hidden = false;
      detailView.showPopover();
      if (pageDetail?.id !== view.id) {
        const built = buildDetail(view.id, "page", {
          onBack: () => navigation.back(),
        });
        detailView.replaceChildren(built.root);
        pageDetail = { id: view.id, view: built };
        loadDetail(pageDetail);
      }
      return;
    }
    // Sheet form: the detail rides as a sheet over the list sheet —
    // pure UI, no history; dismissing it falls back to the list.
    detailView.hidePopover();
    detailView.hidden = true;
    if (sheetDetail?.id !== view.id) {
      const built = buildDetail(view.id, "sheet", {
        onBack: () => undefined,
      });
      detailSheet.replaceChildren(built.root);
      sheetDetail = { id: view.id, view: built };
    }
    if (sheetDetail !== undefined) {
      loadDetail(sheetDetail);
    }
    if (detailSheet.state === "closed") {
      detailSheet.openTo("half");
    }
    return;
  }
  listSheet.close();
  detailSheet.close();
  detailView.hidePopover();
  detailView.hidden = true;
  homeView.hidden = false;
  if (home === undefined) {
    home = buildHome({ onOpenList: () => navigator.openList() });
    homeView.append(home.root);
    home.stackHint.textContent =
      "提示：\"查看更多\"打开半页浮层；首页点推荐是整页详情，浮层里点卡片是浮层详情。URL 加 ?debug 看架构日志。";
    void app.fetchRecommendations().then((result) => {
      if (home === undefined) return;
      if (result.ok) {
        renderRecommendations(home.recommendations, result.value, {
          onOpenDetail: (id) => openDetailFrom("page", id),
        });
      } else {
        home.recommendations.textContent = `推荐加载失败：${result.error.message}`;
      }
    });
  }
}

navigator.subscribe(showView);
// The mini stack lives in memory and always boots at home — drop any deep
// URL left over from a refresh so back navigation stays consistent.
if (navigation.current().pathname !== "/") {
  navigation.replace("/", { frame: 0 });
}
showView(navigator.current());
void app.favorites.reconcile();
