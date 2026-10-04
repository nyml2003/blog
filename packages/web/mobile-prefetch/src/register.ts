import {
  createMobilePrefetchClient,
  type RequestIdleCallbackLike,
  type ServiceWorkerContainerLike,
} from "./client.ts";

// 预取注册编排：包内闭环的应用侧入口。应用只提供配置（SW 路径/scope）、
// 两个回调（何时预取、预取什么）与观测标记键名；注册、idle 调度、
// 失败降级与标记写入全部在此完成。

export interface MobilePrefetchMarkerRoot {
  readonly dataset: { [key: string]: string | undefined };
}

export interface MobilePrefetchMarker {
  readonly statusKey: string;
  readonly countKey: string;
  /** 标记写入位置；缺省惰性取 document.documentElement（node 环境安全）。 */
  readonly root?: MobilePrefetchMarkerRoot;
}

export interface RegisterMobilePrefetchOptions {
  readonly serviceWorkerUrl: string;
  readonly scope?: string;
  readonly navigator?: ServiceWorkerContainerLike;
  /** 本页是否参与预取；缺省 true。false 时静默返回、不写任何标记。 */
  readonly enabled?: () => boolean;
  /** 返回要预取的 URL 列表（[] 视为"无内容"→ complete/0）；抛错 → failed/0。 */
  readonly resolveUrls: () => Promise<readonly string[]> | readonly string[];
  /** 缺省不写任何 DOM 标记。 */
  readonly marker?: MobilePrefetchMarker;
  readonly requestIdleCallback?: RequestIdleCallbackLike;
  readonly setTimeoutFn?: (callback: () => void, delayMs: number) => unknown;
}

/**
 * 语义契约（与迁移前应用侧实现逐条对齐）：
 * 1. 每个页面无条件先注册 SW；注册抛错 → failed/0（含非业务页）；
 * 2. 注册成功且 enabled() 为 false → 静默返回，不写标记；
 * 3. 业务页：等 idle → resolveUrls → [] → complete/0；
 * 4. prefetchAll 结果 accepted ? complete/count : failed/count；
 * 5. 任何异常 → failed/0。
 * 不因 SW 不支持而短路：不支持时仍走完整流程，最终 prefetchAll 返回
 * unsupported → failed/0（观测语义的一部分）。
 */
export async function registerMobilePrefetch(
  options: RegisterMobilePrefetchOptions,
): Promise<void> {
  const client = createMobilePrefetchClient({
    serviceWorkerUrl: options.serviceWorkerUrl,
    scope: options.scope,
    navigator: options.navigator,
    requestIdleCallback: options.requestIdleCallback,
    setTimeoutFn: options.setTimeoutFn,
  });
  const mark = createMarker(options.marker);
  try {
    await client.register();
    if (!(options.enabled?.() ?? true)) return;
    await whenIdle(options);
    const urls = await options.resolveUrls();
    if (urls.length === 0) {
      mark("complete", 0);
      return;
    }
    const result = await client.prefetchAll(urls);
    mark(
      result.status === "accepted" ? "complete" : "failed",
      result.prefetched,
    );
  } catch {
    mark("failed", 0);
  }
}

function createMarker(
  marker: MobilePrefetchMarker | undefined,
): (status: "complete" | "failed", count: number) => void {
  if (marker === undefined) return () => undefined;
  return (status, count) => {
    const root = marker.root ?? documentRoot();
    if (root === undefined) return;
    root.dataset[marker.statusKey] = status;
    root.dataset[marker.countKey] = String(count);
  };
}

function documentRoot(): MobilePrefetchMarkerRoot | undefined {
  return typeof document === "undefined" ? undefined : document.documentElement;
}

function whenIdle(options: RegisterMobilePrefetchOptions): Promise<void> {
  const idle =
    options.requestIdleCallback ??
    (typeof requestIdleCallback === "function"
      ? (callback: () => void) => requestIdleCallback(callback)
      : undefined);
  if (idle !== undefined) {
    return new Promise((resolve) => {
      idle(() => resolve());
    });
  }
  const setTimeoutFn =
    options.setTimeoutFn ??
    (typeof setTimeout === "function" ? setTimeout : undefined);
  if (setTimeoutFn === undefined) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeoutFn(() => resolve(), 0);
  });
}
