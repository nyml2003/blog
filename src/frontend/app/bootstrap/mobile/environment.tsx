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
import type { CancellationFailure, TaskFailure } from "../../kernel/ports";
import {
  createMobileApi,
  type MobileApiFailure,
} from "../../habitat/api/mobile";
import type { MobilePageContext } from "../../habitat/mobile";

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

function startupFailure(
  error: MobileApiFailure | CancellationFailure | TaskFailure,
): MobileApiFailure {
  if (error.kind === "cancelled") {
    return {
      kind: "network",
      message: "页面初始化被取消",
      code: undefined,
      status: undefined,
      issues: undefined,
    };
  }
  if (error.kind === "task") {
    return {
      kind: "protocol",
      message: error.message,
      code: undefined,
      status: undefined,
      issues: undefined,
    };
  }
  return error;
}

export async function createBrowserMobileContext(): Promise<
  Result<MobilePageContext, MobileApiFailure>
> {
  const base = browserContextWithoutRoutes();
  const routes = await base.api.siteRoutes.get().start();
  if (!routes.ok) return { ok: false, error: startupFailure(routes.error) };
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
  void createBrowserMobileContext().then((result) => {
    if (!result.ok) {
      render(() => createComponent(StartupError, {}), mount);
      return;
    }
    const Page = createPage(result.value);
    render(() => createComponent(Page, {}), mount);
  });
}
