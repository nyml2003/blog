import type { SpaceTimePort } from "@fluvient-loom/port";

export interface WebSpaceTimeOptions {
  /** Wall-clock epoch milliseconds; defaults to `Date.now`. */
  readonly now?: () => number;
}

export function createWebSpaceTime(
  options: WebSpaceTimeOptions = {},
): SpaceTimePort {
  const now = options.now ?? Date.now;
  return { now };
}
