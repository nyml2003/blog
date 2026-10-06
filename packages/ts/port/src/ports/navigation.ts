import type { ResourceHandle } from "@fluvient/core";

export interface NavigationSnapshot {
  readonly pathname: string;
  readonly search: string;
  readonly state: unknown;
}

export interface NavigationPort {
  current(): NavigationSnapshot;
  push(href: string, state: unknown): void;
  replace(href: string, state: unknown): void;
  /** 离开当前文档整页跳转（用于登录后进入管理端等跨文档导航）。 */
  assign(href: string): void;
  back(): void;
  /** 历史栈里是否还有上一页（用于"返回上一站"策略）。 */
  canGoBack(): boolean;
  /** 文档 referrer；不可用时为空串。 */
  referrer(): string;
  /** 当前文档 origin（如 `https://example.com`）。 */
  origin(): string;
  subscribePopState(listener: () => void): ResourceHandle;
  subscribePageHide(listener: () => void): ResourceHandle;
}
