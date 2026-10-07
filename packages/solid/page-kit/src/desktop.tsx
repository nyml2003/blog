import type { NavigationPort } from "@fluvient-loom/port";
import { createFetchNetwork } from "@fluvient-loom/net";
import { createWebNavigation } from "@fluvient-loom/web";
import { type Component, createComponent } from "solid-js";
import { render } from "solid-js/web";
import { requireMountTarget } from "./mount.ts";
import type { PageView } from "./shared.ts";

// Desktop 浏览器端口装配：宿主适配器只允许在 page-kit 内装配
// （SPEC-ARCH-BOUNDARY-001）；bootstrap 只组合应用声明并调用本包。
export interface WebDesktopDialog {
  confirm(message: string): boolean;
}

export interface WebDesktopSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WebDesktopPorts {
  readonly network: ReturnType<typeof createFetchNetwork>;
  readonly navigation: NavigationPort;
  readonly dialog: WebDesktopDialog;
  readonly sessionStorage: WebDesktopSessionStorage | undefined;
}

function createWebDesktopSessionStorage():
  | WebDesktopSessionStorage
  | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function createWebDesktopPorts(): WebDesktopPorts {
  return {
    network: createFetchNetwork({
      fetcher: window.fetch.bind(window),
      setTimeoutFn: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeoutFn: (handle) => window.clearTimeout(handle as number),
    }),
    navigation: createWebNavigation({
      history: window.history,
      location: window.location,
      events: window,
      referrer: window.document.referrer,
    }),
    dialog: {
      confirm: (message) => window.confirm(message),
    },
    sessionStorage: createWebDesktopSessionStorage(),
  };
}

function DesktopStartupError() {
  return (
    <main>
      <p role="alert">页面初始化失败，请重试。</p>
      <button type="button" onClick={() => window.location.reload()}>
        重试
      </button>
    </main>
  );
}

export interface MountApplicationOptions<Ctx> {
  readonly context:
    | { readonly ok: true; readonly value: Ctx }
    | { readonly ok: false; readonly error: unknown };
  readonly createPage: (context: Ctx) => PageView;
  /** context 创建失败时的附加清理。 */
  readonly onContextFailure?: () => void;
  /** 挂载成功后的增强动作（失败不阻塞页面）。 */
  readonly afterMount?: () => void;
}

export function mountDesktopApplication<Ctx>(
  options: MountApplicationOptions<Ctx>,
): void {
  const mount = requireMountTarget(document);
  if (!options.context.ok) {
    options.onContextFailure?.();
    render(() => createComponent(DesktopStartupError, {}), mount);
    return;
  }
  const Page = options.createPage(options.context.value) as Component;
  render(() => createComponent(Page, {}), mount);
  options.afterMount?.();
}
