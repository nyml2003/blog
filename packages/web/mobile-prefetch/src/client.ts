import { toErrorInfo, type ErrorInfo } from "@fluvient/core";

export interface MobilePrefetchClient {
  readonly supported: boolean;
  register(): Promise<void>;
  prefetchAll(urls: readonly string[]): Promise<MobilePrefetchResult>;
  prefetchAllWhenIdle(urls: readonly string[]): Promise<MobilePrefetchResult>;
}

export interface MobilePrefetchOptions {
  readonly serviceWorkerUrl: string;
  readonly scope?: string;
  readonly navigator?: ServiceWorkerContainerLike;
  readonly requestIdleCallback?: RequestIdleCallbackLike;
  readonly setTimeoutFn?: (callback: () => void, delayMs: number) => unknown;
}

export interface MobilePrefetchResult {
  readonly status: "accepted" | "unsupported" | "failed";
  readonly prefetched: number;
  readonly error?: string;
  readonly cause?: ErrorInfo;
}

interface ServiceWorkerLike {
  postMessage(message: unknown, transfer?: readonly unknown[]): void;
}

interface ServiceWorkerRegistrationLike {
  readonly active: ServiceWorkerLike | null;
}

export interface ServiceWorkerContainerLike {
  register(
    scriptUrl: string,
    options?: { readonly scope?: string },
  ): Promise<ServiceWorkerRegistrationLike>;
  readonly ready: Promise<ServiceWorkerRegistrationLike>;
}

interface MessagePortLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  start?(): void;
  close?(): void;
  postMessage?(message: unknown): void;
}

interface MessageChannelLike {
  readonly port1: MessagePortLike;
  readonly port2: MessagePortLike;
}

export interface RequestIdleCallbackLike {
  (callback: () => void): number;
}

const COMMAND = "mobile-prefetch/prefetch";

export function createMobilePrefetchClient(
  options: MobilePrefetchOptions,
): MobilePrefetchClient {
  const navigatorBinding =
    options.navigator ??
    (typeof navigator === "undefined" ? undefined : navigator.serviceWorker);
  const supported = navigatorBinding !== undefined;
  const idle = options.requestIdleCallback ??
    (typeof requestIdleCallback === "function"
      ? (callback) => requestIdleCallback(callback)
      : undefined);
  const setTimeoutFn = options.setTimeoutFn ??
    (typeof setTimeout === "function" ? setTimeout : undefined);

  async function register(): Promise<void> {
    if (navigatorBinding === undefined) return;
    await navigatorBinding.register(options.serviceWorkerUrl, {
      scope: options.scope,
    });
  }

  async function prefetchAll(
    urls: readonly string[],
  ): Promise<MobilePrefetchResult> {
    if (navigatorBinding === undefined) {
      return { status: "unsupported", prefetched: 0 };
    }
    if (urls.length === 0) return { status: "accepted", prefetched: 0 };
    try {
      const registration = await navigatorBinding.ready;
      const worker = registration.active;
      if (worker === null) {
        return { status: "failed", prefetched: 0, error: "Service Worker 未激活" };
      }
      const channel = createMessageChannel();
      const result = new Promise<MobilePrefetchResult>((resolve) => {
        channel.port1.onmessage = (event) => {
          const data = event.data;
          if (!isPrefetchResult(data)) {
            resolve({ status: "failed", prefetched: 0, error: "Service Worker 响应无效" });
            return;
          }
          resolve(data);
          channel.port1.close?.();
        };
        channel.port1.start?.();
      });
      worker.postMessage({ type: COMMAND, urls: [...urls] }, [channel.port2]);
      return await result;
    } catch (cause) {
      return {
        status: "failed",
        prefetched: 0,
        error: cause instanceof Error ? cause.message : String(cause),
        cause: toErrorInfo(cause),
      };
    }
  }

  function prefetchAllWhenIdle(
    urls: readonly string[],
  ): Promise<MobilePrefetchResult> {
    if (idle !== undefined) {
      return new Promise((resolve) => {
        idle(() => void prefetchAll(urls).then(resolve));
      });
    }
    if (setTimeoutFn !== undefined) {
      return new Promise((resolve) => {
        setTimeoutFn(() => void prefetchAll(urls).then(resolve), 0);
      });
    }
    return prefetchAll(urls);
  }

  return { supported, register, prefetchAll, prefetchAllWhenIdle };
}

function createMessageChannel(): MessageChannelLike {
  if (typeof MessageChannel === "undefined") {
    throw new Error("MessageChannel 不可用");
  }
  return new MessageChannel() as unknown as MessageChannelLike;
}

function isPrefetchResult(value: unknown): value is MobilePrefetchResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Partial<MobilePrefetchResult>;
  return (result.status === "accepted" || result.status === "failed") &&
    typeof result.prefetched === "number";
}
