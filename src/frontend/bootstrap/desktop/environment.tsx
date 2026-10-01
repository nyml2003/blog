import { createComponent, type Component } from "solid-js";
import { render } from "solid-js/web";
import { createWebNavigation, createWebNetwork } from "@fluvient-loom/web";
import { type Result } from "@fluvient/core";
import {
  createDesktopApi,
  type DesktopApiFailure,
} from "../../desktop/foundation/api";
import type { DesktopPageContext } from "../../desktop/foundation/context";

function browserNavigation() {
  return createWebNavigation({
    history: window.history,
    location: window.location,
    events: window,
  });
}

export async function createBrowserDesktopContext(): Promise<
  Result<DesktopPageContext, DesktopApiFailure>
> {
  const network = createWebNetwork({
    fetcher: window.fetch.bind(window),
    setTimeoutFn: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeoutFn: (handle) => window.clearTimeout(handle as number),
  });
  const api = createDesktopApi(network);
  const routes = await api.siteRoutes.get().start();
  if (!routes.ok)
    return { ok: false, error: routes.error as DesktopApiFailure };
  return {
    ok: true,
    value: { api, routes: routes.value, navigation: browserNavigation() },
  };
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

export function mountDesktopPage(
  createPage: (context: DesktopPageContext) => Component,
): void {
  const mount = document.getElementById("app");
  if (!mount) throw new Error('Page mount element "#app" is missing');
  void createBrowserDesktopContext().then((result) => {
    if (!result.ok) {
      render(() => createComponent(StartupError, {}), mount);
      return;
    }
    const Page = createPage(result.value);
    render(() => createComponent(Page, {}), mount);
  });
}
