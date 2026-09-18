import type {
  NavigationPort,
  NavigationSnapshot,
  ResourceHandle,
} from "../../kernel/ports";

export interface BrowserNavigationOptions {
  readonly read: () => NavigationSnapshot;
  readonly push: (href: string, state: unknown) => void;
  readonly replace: (href: string, state: unknown) => void;
  readonly back: () => void;
  readonly addPopStateListener: (listener: () => void) => ResourceHandle;
  readonly addPageHideListener: (listener: () => void) => ResourceHandle;
}

export function createBrowserNavigation(
  options: BrowserNavigationOptions,
): NavigationPort {
  return {
    current: options.read,
    push: options.push,
    replace: options.replace,
    back: options.back,
    subscribePopState: options.addPopStateListener,
    subscribePageHide: options.addPageHideListener,
  };
}
