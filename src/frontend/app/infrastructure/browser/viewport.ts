import type { ViewportPort } from "../../kernel/ports";

export interface BrowserViewportOptions {
  readonly readScrollY: () => number;
  readonly scrollTo: (scrollY: number) => void;
}

export const createBrowserViewport = (
  options: BrowserViewportOptions,
): ViewportPort => ({
  scrollY: options.readScrollY,
  scrollTo: options.scrollTo,
});
