import type {
  NavigationPort,
  NavigationSnapshot,
} from "@fluvient-loom/port";
import type { ResourceHandle } from "@fluvient-loom/common";

export interface WebHistoryLike {
  readonly state: unknown;
  pushState(state: unknown, unused: string, href: string): void;
  replaceState(state: unknown, unused: string, href: string): void;
  back(): void;
}

export interface WebLocationLike {
  readonly pathname: string;
  readonly search: string;
}

export interface WebEventTargetLike {
  addEventListener(
    type: string,
    listener: () => void,
  ): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface WebNavigationOptions {
  readonly history?: WebHistoryLike;
  readonly location?: WebLocationLike;
  /** The window-ish event surface carrying popstate / pagehide. */
  readonly events?: WebEventTargetLike;
}

export function createWebNavigation(
  options: WebNavigationOptions = {},
): NavigationPort {
  const historyBinding: WebHistoryLike | undefined =
    options.history ?? (typeof history === "undefined" ? undefined : history);
  const locationBinding: WebLocationLike | undefined =
    options.location ??
    (typeof location === "undefined" ? undefined : location);
  const events: WebEventTargetLike | undefined =
    options.events ?? (typeof window === "undefined" ? undefined : window);
  if (
    historyBinding === undefined ||
    locationBinding === undefined ||
    events === undefined
  ) {
    throw new Error(
      "createWebNavigation: 全局 history / location / window 不存在，须显式注入对应 options",
    );
  }

  const subscribe = (type: string, listener: () => void): ResourceHandle => {
    events.addEventListener(type, listener);
    let released = false;
    return {
      release() {
        if (released) return;
        released = true;
        events.removeEventListener(type, listener);
      },
    };
  };

  return {
    current(): NavigationSnapshot {
      return {
        pathname: locationBinding.pathname,
        search: locationBinding.search,
        state: historyBinding.state,
      };
    },
    push(href, state) {
      historyBinding.pushState(state, "", href);
    },
    replace(href, state) {
      historyBinding.replaceState(state, "", href);
    },
    back() {
      historyBinding.back();
    },
    subscribePopState(listener) {
      return subscribe("popstate", listener);
    },
    subscribePageHide(listener) {
      return subscribe("pagehide", listener);
    },
  };
}
