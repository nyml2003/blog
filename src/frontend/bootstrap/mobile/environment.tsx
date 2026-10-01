import { createComponent, type Component } from "solid-js";
import { render } from "solid-js/web";
import { asAsyncPersistence } from "@fluvient-loom/port";
import {
  createWebDocument,
  createWebNavigation,
  createWebNetwork,
  createWebOperationId,
  createWebPersistence,
  createWebScheduler,
  createWebSpaceTime,
  createWebViewport,
} from "@fluvient-loom/web";
import { type Result } from "@fluvient/core";
import { createMobilePrefetchClient } from "@fluvient-loom/mobile-prefetch";
import {
  createMobileApi,
  siteRoutesSchema,
  type MobileApiFailure,
  type SiteRoutes,
} from "../../mobile/foundation/api";
import type { MobilePageContext } from "../../mobile/foundation/context";
// 路由清单在构建期由 pages.registry 投影生成（与后端 /api/public/site-routes 同源，
// 有测试守卫同步），直接内嵌进包，避免每次导航阻塞首绘的串行请求。
import siteRoutesManifest from "../../site-routes.json";

function browserContextWithoutRoutes(): Omit<MobilePageContext, "routes"> {
  const network = createWebNetwork({
    fetcher: window.fetch.bind(window),
    setTimeoutFn: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeoutFn: (handle) => window.clearTimeout(handle as number),
  });
  const navigation = createWebNavigation({
    history: window.history,
    location: window.location,
    events: window,
  });
  const persistence = createWebPersistence({
    storage: window.localStorage,
  });
  const share = async (url: string): Promise<void> => {
    if (navigator.share) {
      await navigator.share({ url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url);
  };
  return {
    api: createMobileApi(network),
    persistence,
    asyncPersistence: asAsyncPersistence(persistence),
    operationId: createWebOperationId(),
    scheduler: createWebScheduler({
      queueMicrotaskFn: (callback) => window.queueMicrotask(callback),
      setTimeoutFn: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeoutFn: (handle) => window.clearTimeout(handle as number),
      requestAnimationFrameFn: (callback) =>
        window.requestAnimationFrame(callback),
      cancelAnimationFrameFn: (handle) =>
        window.cancelAnimationFrame(handle as number),
    }),
    spaceTime: createWebSpaceTime({ now: () => Date.now() }),
    navigation,
    document: createWebDocument({ root: window.document.documentElement }),
    viewport: createWebViewport({
      readScrollY: () => window.scrollY,
      scrollTo: (scrollY) =>
        window.scrollTo({ top: scrollY, behavior: "auto" }),
    }),
    share,
  };
}

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
  const base = browserContextWithoutRoutes();
  const routes = embeddedSiteRoutes();
  if (!routes.ok) return { ok: false, error: routes.error };
  return { ok: true, value: { ...base, routes: routes.value } };
}

function StartupError() {
  return (
    <main>
      <p role="alert">页面初始化失败，请重试。</p>
      <button type="button" onClick={() => window.location.reload()}>
        重试
      </button>
    </main>
  );
}

export function mountMobilePage(
  createPage: (context: MobilePageContext) => Component,
): void {
  const mount = document.getElementById("app");
  if (!mount) throw new Error('Page mount element "#app" is missing');
  const result = createBrowserMobileContext();
  if (!result.ok) {
    render(() => createComponent(StartupError, {}), mount);
    return;
  }
  const Page = createPage(result.value);
  render(() => createComponent(Page, {}), mount);
  void registerMobilePrefetch(window.location.pathname);
}

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
