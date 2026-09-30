import { createComponent, type Component } from "solid-js";
import { render } from "solid-js/web";
import {
  createBrowserDocument,
  createBrowserAsyncPersistence,
  createBrowserNavigation,
  createBrowserNetwork,
  createBrowserPersistence,
  createBrowserScheduler,
  createBrowserSpaceTime,
  createBrowserViewport,
  createBrowserOperationId,
} from "../../infrastructure/browser";
import type { Result, ResourceHandle } from "../../kernel";
import {
  createMobileApi,
  siteRoutesSchema,
  type MobileApiFailure,
  type SiteRoutes,
} from "../../habitat/api/mobile";
import type { MobilePageContext } from "../../habitat/mobile";
// 路由清单在构建期由 pages.registry 投影生成（与后端 /api/public/site-routes 同源，
// 有测试守卫同步），直接内嵌进包，避免每次导航阻塞首绘的串行请求。
import siteRoutesManifest from "../../../site-routes.json";

function eventHandle(
  add: (listener: EventListener) => void,
  remove: (listener: EventListener) => void,
  callback: () => void,
): ResourceHandle {
  const listener: EventListener = () => callback();
  add(listener);
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      remove(listener);
    },
  };
}

function browserContextWithoutRoutes(): Omit<MobilePageContext, "routes"> {
  const network = createBrowserNetwork({
    fetcher: window.fetch.bind(window),
    setTimeoutFn: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeoutFn: (handle) => window.clearTimeout(handle as number),
  });
  const navigation = createBrowserNavigation({
    read: () => ({
      pathname: window.location.pathname,
      search: window.location.search,
      state: window.history.state,
    }),
    push: (href, state) => window.history.pushState(state, "", href),
    replace: (href, state) => window.history.replaceState(state, "", href),
    back: () => window.history.back(),
    addPopStateListener: (listener) =>
      eventHandle(
        (callback) => window.addEventListener("popstate", callback),
        (callback) => window.removeEventListener("popstate", callback),
        listener,
      ),
    addPageHideListener: (listener) =>
      eventHandle(
        (callback) => window.addEventListener("pagehide", callback),
        (callback) => window.removeEventListener("pagehide", callback),
        listener,
      ),
  });
  return {
    api: createMobileApi(network),
    persistence: createBrowserPersistence(window.localStorage),
    asyncPersistence: createBrowserAsyncPersistence(
      createBrowserPersistence(window.localStorage),
    ),
    operationId: createBrowserOperationId(),
    scheduler: createBrowserScheduler({
      queueMicrotaskFn: (callback) => window.queueMicrotask(callback),
      setTimeoutFn: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeoutFn: (handle) => window.clearTimeout(handle as number),
      requestAnimationFrameFn: (callback) =>
        window.requestAnimationFrame(callback),
      cancelAnimationFrameFn: (handle) => window.cancelAnimationFrame(handle),
    }),
    spaceTime: createBrowserSpaceTime({ now: () => Date.now() }),
    navigation,
    document: createBrowserDocument({ root: window.document.documentElement }),
    viewport: createBrowserViewport({
      readScrollY: () => window.scrollY,
      scrollTo: (scrollY) =>
        window.scrollTo({ top: scrollY, behavior: "auto" }),
    }),
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
}
