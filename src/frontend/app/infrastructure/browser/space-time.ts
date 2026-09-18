import type { SpaceTimePort } from "../../kernel/ports";

export interface BrowserSpaceTimeOptions {
  readonly now: () => number;
}

export const createBrowserSpaceTime = (
  options: BrowserSpaceTimeOptions,
): SpaceTimePort => ({ now: options.now });
