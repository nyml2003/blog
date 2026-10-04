import { type Result } from "@fluvient/core";
import { type Component } from "solid-js";
import {
  createMobileApi,
  type MobileApiFailure,
  siteRoutesSchema,
} from "@blog/mobile-api";
import type { MobilePageContext } from "@blog/mobile-shared";
import { createMobilePrefetchClient } from "@fluvient-loom/mobile-prefetch";
import {
  createWebMobilePorts,
  mountMobileApplication,
  removeMobileAppShell,
} from "@fluvient-loom/page-kit/mobile";
import "../styles/mobile.css";
import siteRoutesManifest from "../site-routes.json";

// ── 环境装配（page-kit 唯一调用点）────────────────────────────────────
function createBrowserMobileContext(): Result<
  MobilePageContext,
  MobileApiFailure
> {
  const ports = createWebMobilePorts();
  const parsed = siteRoutesSchema.safeParse(siteRoutesManifest);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: "protocol",
        message: "内嵌路由清单不符合协议",
        code: undefined,
        status: undefined,
        issues: parsed.error.issues.map((i) => i.path.join(".") || i.message),
      },
    };
  }
  return {
    ok: true,
    value: {
      ...ports,
      api: createMobileApi(ports.network),
      routes: parsed.data,
    },
  };
}

// ── 页面路由（id → 工厂，dynamic import 由 Vite code-split）──────────
type PageFactory = (context: MobilePageContext) => Component;

const pages: Record<string, () => Promise<PageFactory>> = {
  "mobile-home": async () =>
    (await import("@blog/page-mobile-home/page")).createMobileHomePage,
  "mobile-articles": async () => {
    const m = await import("@blog/page-mobile-articles/page");
    return (ctx) => m.createMobileArticlesPage(ctx, "全部文章");
  },
  "mobile-article-list": async () => {
    const m = await import("@blog/page-mobile-articles/page");
    return (ctx) => m.createMobileArticlesPage(ctx, "分类浏览");
  },
  "mobile-article-detail": async () => {
    const { createMobileDetailEntry } = await import(
      "@blog/page-mobile-detail/entry"
    );
    return (context: MobilePageContext) =>
      createMobileDetailEntry(context, removeMobileAppShell);
  },
  "mobile-settings": async () =>
    (await import("@blog/page-mobile-settings/page")).createMobileSettingsPage,
  "mobile-admin-article-preview": async () =>
    (await import("@blog/page-mobile-admin-preview/page"))
      .createMobileAdminPreviewPage,
};

// ── 挂载 ────────────────────────────────────────────────────────────
const pageId = document.documentElement.dataset.pageId ?? "";
const resolve = pages[pageId];

if (resolve) {
  void resolve().then((factory) => {
    mountMobileApplication({
      context: createBrowserMobileContext(),
      createPage: factory,
      onContextFailure: removeMobileAppShell,
      afterMount: () => void registerMobilePrefetch(window.location.pathname),
    });
  });
} else {
  console.error(`Unknown mobile page id: "${pageId}"`);
}

// ── 预取（可选增强，失败不阻塞页面）───────────────────────────────────
async function registerMobilePrefetch(pathname: string): Promise<void> {
  const client = createMobilePrefetchClient({
    serviceWorkerUrl: "/mobile-prefetch-sw.js",
    scope: "/m/",
    navigator: navigator.serviceWorker,
  });
  try {
    await client.register();
    if (pathname !== "/m" && pathname !== "/m/") return;
    await whenIdle();
    const response = await fetch(
      "/api/public/mobile/category-shelf?sceneCode=public.mobile_category_shelf",
      { credentials: "same-origin" },
    );
    if (!response.ok) {
      markPrefetch("failed", 0);
      return;
    }
    const body: unknown = await response.json();
    const ids = categoryIds(body);
    if (ids.length === 0) {
      markPrefetch("complete", 0);
      return;
    }
    const urls = ids.map(
      (id) =>
        `/api/public/mobile/category-shelf?sceneCode=public.mobile_category_shelf&category_id=${id}`,
    );
    const result = await client.prefetchAll(urls);
    markPrefetch(
      result.status === "accepted" ? "complete" : "failed",
      result.prefetched,
    );
  } catch {
    markPrefetch("failed", 0);
  }
}

function markPrefetch(status: string, count: number): void {
  document.documentElement.dataset.mobilePrefetch = status;
  document.documentElement.dataset.mobilePrefetchCount = String(count);
}

function whenIdle(): Promise<void> {
  return typeof window.requestIdleCallback === "function"
    ? new Promise((r) => window.requestIdleCallback(() => r()))
    : new Promise((r) => window.setTimeout(r, 0));
}

function categoryIds(body: unknown): readonly number[] {
  if (typeof body !== "object" || body === null) return [];
  const d = (body as { data?: unknown }).data;
  if (typeof d !== "object" || d === null) return [];
  const t = (d as { taxonomy?: unknown }).taxonomy;
  if (typeof t !== "object" || t === null) return [];
  const cs = (t as { categories?: unknown }).categories;
  if (!Array.isArray(cs)) return [];
  return cs.flatMap((c) => {
    if (typeof c !== "object" || c === null) return [];
    const id = (c as { id?: unknown }).id;
    return typeof id === "number" && Number.isSafeInteger(id) && id > 0
      ? [id]
      : [];
  });
}
