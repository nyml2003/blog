import { createComponent, type Component } from "solid-js";
import { render } from "solid-js/web";
import { createBrowserNavigation, createBrowserNetwork } from "../../infrastructure/browser";
import type { Result } from "../../kernel";
import { createDesktopApi, type DesktopApiFailure } from "../../habitat/api/desktop";
import type { DesktopPageContext } from "../../habitat/desktop";

function browserNavigation() {
  return createBrowserNavigation({ read: () => ({ pathname: window.location.pathname, search: window.location.search, state: window.history.state }), push: (href, state) => window.history.pushState(state, "", href), replace: (href, state) => window.history.replaceState(state, "", href), back: () => window.history.back(), addPopStateListener: (listener) => { window.addEventListener("popstate", listener); return { release: () => window.removeEventListener("popstate", listener) }; }, addPageHideListener: (listener) => { window.addEventListener("pagehide", listener); return { release: () => window.removeEventListener("pagehide", listener) }; } });
}

export async function createBrowserDesktopContext(): Promise<Result<DesktopPageContext, DesktopApiFailure>> {
  const network = createBrowserNetwork({ fetcher: window.fetch.bind(window), setTimeoutFn: (callback, delayMs) => window.setTimeout(callback, delayMs), clearTimeoutFn: (handle) => window.clearTimeout(handle as number) });
  const api = createDesktopApi(network);
  const routes = await api.siteRoutes.get().start();
  if (!routes.ok) return { ok: false, error: routes.error as DesktopApiFailure };
  return { ok: true, value: { api, routes: routes.value, navigation: browserNavigation() } };
}

function StartupError() { return <main><p role="alert">页面初始化失败，请重试。</p><button type="button" onClick={() => window.location.reload()}>重试</button></main>; }

export function mountDesktopPage(createPage: (context: DesktopPageContext) => Component): void {
  const mount = document.getElementById("app");
  if (!mount) throw new Error('Page mount element "#app" is missing');
  void createBrowserDesktopContext().then((result) => {
    if (!result.ok) { render(() => createComponent(StartupError, {}), mount); return; }
    const Page = createPage(result.value);
    render(() => createComponent(Page, {}), mount);
  });
}
