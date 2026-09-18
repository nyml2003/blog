import type { ResourceHandle } from "./resource";

export interface NavigationSnapshot {
  readonly pathname: string;
  readonly search: string;
  readonly state: unknown;
}

export interface NavigationPort {
  current(): NavigationSnapshot;
  push(href: string, state: unknown): void;
  replace(href: string, state: unknown): void;
  back(): void;
  subscribePopState(listener: () => void): ResourceHandle;
  subscribePageHide(listener: () => void): ResourceHandle;
}
