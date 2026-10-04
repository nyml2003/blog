import { type Result } from "@fluvient/core";
import { createMobilePrefetchClient } from "@fluvient-loom/mobile-prefetch";
import {
  createWebMobilePorts,
  mountMobileApplication,
  removeMobileAppShell,
} from "@fluvient-loom/page-kit/mobile";
import { type Component } from "solid-js";
import {
  createMobileApi,
  type MobileApiFailure,
  type SiteRoutes,
  siteRoutesSchema,
} from "@blog/mobile-api";
import type { MobilePageContext } from "../../mobile/foundation/context";
// 路由清单在构建期由 pages.registry 投影生成（与后端 /api/public/site-routes 同源，
// 有重新生成比对守卫），直接内嵌进包，避免每次导航阻塞首绘的串行请求。
import siteRoutesManifest from "../../site-routes.json";

// bootstrap 是 page-kit 的唯一调用点：端口装配在包内完成，
// 这里只组合应用声明（api 工厂、内嵌清单）并挂载页面。
function embeddedSiteRoutes(): Result<SiteRoutes, MobileApiFailure> {
  const parsed = siteRoutesSchema.safeParse(siteRoutesManifest);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: "protocol",
        message: "内嵌路由清单不符合协议",
        code: undefined,
        status: undefined,
        issues: parsed.error.issues.map(
          (issue) => issue.path.join(".") || issue.message,
        ),
      },
    };
  }
  return { ok: true, value: parsed.data };
}

export function createBrowserMobileContext(): Result<
  MobilePageContext,
  MobileApiFailure
> {
  const ports = createWebMobilePorts();
  const routes = embeddedSiteRoutes();
  if (!routes.ok) return { ok: false, error: routes.error };
  return {
    ok: true,
    value: {
      ...ports,
      api: createMobileApi(ports.network),
      routes: routes.value,
    },
  };
}

export function mountMobilePage(
  createPage: (context: MobilePageContext) => Component,
): void {
  mountMobileApplication({
    context: createBrowserMobileContext(),
    createPage,
    onContextFailure: removeMobileAppShell,
    afterMount: () => {
      void registerMobilePrefetch(window.location.pathname);
    },
  });
}

export { removeMobileAppShell };

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
      markMobilePrefetch("failed", 0);
      return;
    }
    const body: unknown = await response.json();
    const categoryIds = categoryIdsFromResponse(body);
    if (categoryIds.length === 0) {
      markMobilePrefetch("complete", 0);
      return;
    }
    const urls = categoryIds.map(
      (id) =>
        `/api/public/mobile/category-shelf?sceneCode=public.mobile_category_shelf&category_id=${id}`,
    );
    const result = await client.prefetchAll(urls);
    markMobilePrefetch(
      result.status === "accepted" ? "complete" : "failed",
      result.prefetched,
    );
  } catch {
    markMobilePrefetch("failed", 0);
    // SW and prefetch are an optional enhancement; page loading remains network-first.
  }
}

function markMobilePrefetch(
  status: "complete" | "failed",
  count: number,
): void {
  document.documentElement.dataset.mobilePrefetch = status;
  document.documentElement.dataset.mobilePrefetchCount = String(count);
}

function whenIdle(): Promise<void> {
  if (typeof window.requestIdleCallback === "function") {
    return new Promise((resolve) =>
      window.requestIdleCallback(() => resolve()),
    );
  }
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function categoryIdsFromResponse(body: unknown): readonly number[] {
  if (typeof body !== "object" || body === null) return [];
  const data = (body as { readonly data?: unknown }).data;
  if (typeof data !== "object" || data === null) return [];
  const taxonomy = (data as { readonly taxonomy?: unknown }).taxonomy;
  if (typeof taxonomy !== "object" || taxonomy === null) return [];
  const categories = (taxonomy as { readonly categories?: unknown }).categories;
  if (!Array.isArray(categories)) return [];
  return categories.flatMap((category) => {
    if (typeof category !== "object" || category === null) return [];
    const id = (category as { readonly id?: unknown }).id;
    return typeof id === "number" && Number.isSafeInteger(id) && id > 0
      ? [id]
      : [];
  });
}
