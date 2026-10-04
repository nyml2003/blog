import type { ViewportPort } from "@fluvient-loom/port";

export interface WebViewportOptions {
  readonly readScrollY?: () => number;
  readonly scrollTo?: (scrollY: number) => void;
}

export function createWebViewport(
  options: WebViewportOptions = {},
): ViewportPort {
  const readScrollY: (() => number) | undefined =
    options.readScrollY ??
    (typeof window === "undefined" ? undefined : () => window.scrollY);
  const scrollTo: ((scrollY: number) => void) | undefined =
    options.scrollTo ??
    (typeof window === "undefined"
      ? undefined
      : (scrollY) => window.scrollTo({ top: scrollY, behavior: "auto" }));
  if (readScrollY === undefined || scrollTo === undefined) {
    throw new Error(
      "createWebViewport: 全局 window 不存在，须显式注入对应 options",
    );
  }
  return {
    scrollY: readScrollY,
    scrollTo,
  };
}
