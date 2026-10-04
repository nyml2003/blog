import { toErrorInfo } from "@fluvient/core";

export interface MobilePrefetchServiceWorkerOptions {
  readonly apiPathPrefix: string;
  readonly cacheName?: string;
  readonly ttlMs?: number;
  readonly fetcher?: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  readonly caches?: CacheStorageLike;
  readonly origin?: string;
  readonly now?: () => number;
}

export interface MobilePrefetchServiceWorker {
  install(scope: ServiceWorkerScopeLike): void;
  handleFetch(request: Request): Promise<Response>;
  handleMessage(event: MobilePrefetchMessageEvent): void;
}

export interface ServiceWorkerScopeLike {
  skipWaiting(): Promise<void>;
  addEventListener(
    type: string,
    listener: (event: ExtendableEventLike) => void,
  ): void;
}

export interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface MobilePrefetchMessageEvent {
  readonly data: unknown;
  readonly ports: readonly MessagePortLike[];
}

interface MessagePortLike {
  postMessage(message: unknown): void;
  close?(): void;
}

export interface CacheLike {
  match(request: RequestInfo | URL): Promise<Response | undefined>;
  put(request: RequestInfo | URL, response: Response): Promise<void>;
  delete(request: RequestInfo | URL): Promise<boolean>;
}

export interface CacheStorageLike {
  open(cacheName: string): Promise<CacheLike>;
}

const COMMAND = "mobile-prefetch/prefetch";
const DEFAULT_CACHE = "mobile-prefetch-v1";
const DEFAULT_TTL_MS = 60_000;
const TIMESTAMP_HEADER = "x-mobile-prefetch-stored-at";

export function createMobilePrefetchServiceWorker(
  options: MobilePrefetchServiceWorkerOptions,
): MobilePrefetchServiceWorker {
  const cacheName = options.cacheName ?? DEFAULT_CACHE;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const fetcher = options.fetcher ?? fetch;
  const cacheStorage = options.caches ?? caches;
  const now = options.now ?? Date.now;
  const origin =
    options.origin ??
    (typeof location === "undefined" ? "http://localhost" : location.origin);
  const inFlight = new Map<string, Promise<Response>>();

  function isAllowedUrl(value: string): boolean {
    const url = new URL(value, origin);
    return (
      url.origin === origin && url.pathname.startsWith(options.apiPathPrefix)
    );
  }

  async function fetchAndStore(url: string): Promise<Response> {
    const existing = inFlight.get(url);
    if (existing !== undefined)
      return existing.then((response) => response.clone());
    const task = fetcher(url, { method: "GET", credentials: "same-origin" })
      .then(async (response) => {
        if (response.ok) {
          const headers = new Headers(response.headers);
          headers.set(TIMESTAMP_HEADER, String(now()));
          const stored = new Response(await response.clone().arrayBuffer(), {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
          const cache = await cacheStorage.open(cacheName);
          await cache.put(url, stored);
        }
        return response;
      })
      .finally(() => {
        inFlight.delete(url);
      });
    inFlight.set(url, task);
    return task.then((response) => response.clone());
  }

  async function cachedResponse(
    request: Request,
  ): Promise<Response | undefined> {
    const cache = await cacheStorage.open(cacheName);
    const response = await cache.match(request);
    if (response === undefined) return undefined;
    const storedAt = Number(response.headers.get(TIMESTAMP_HEADER));
    if (!Number.isFinite(storedAt) || now() - storedAt > ttlMs) {
      await cache.delete(request);
      return undefined;
    }
    return response;
  }

  async function handleFetch(request: Request): Promise<Response> {
    if (request.method !== "GET" || !isAllowedUrl(request.url))
      return fetcher(request);
    const cached = await cachedResponse(request);
    if (cached !== undefined) return cached;
    return fetchAndStore(request.url);
  }

  async function prefetch(urls: readonly string[]): Promise<number> {
    let count = 0;
    for (const url of urls) {
      if (!isAllowedUrl(url)) continue;
      await fetchAndStore(url);
      count += 1;
    }
    return count;
  }

  function handleMessage(event: MobilePrefetchMessageEvent): void {
    if (!isCommand(event.data)) return;
    const port = event.ports[0];
    if (port === undefined) return;
    const urls = event.data.urls;
    void prefetch(urls).then(
      (count) => {
        port.postMessage({ status: "accepted", prefetched: count });
        port.close?.();
      },
      (cause: unknown) => {
        port.postMessage({
          status: "failed",
          prefetched: 0,
          error: errorMessage(cause),
          cause: toErrorInfo(cause),
        });
        port.close?.();
      },
    );
  }

  function install(scope: ServiceWorkerScopeLike): void {
    scope.addEventListener("install", (event) => {
      event.waitUntil(scope.skipWaiting());
    });
  }

  return { install, handleFetch, handleMessage };
}

function isCommand(
  value: unknown,
): value is { readonly type: string; readonly urls: readonly string[] } {
  if (typeof value !== "object" || value === null) return false;
  const command = value as { readonly type?: unknown; readonly urls?: unknown };
  return (
    command.type === COMMAND &&
    Array.isArray(command.urls) &&
    command.urls.every((url) => typeof url === "string")
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// ── SW 入口接线（应用侧 3 行的背后）─────────────────────────────────
// 平台边界：Service Worker 全局不在 DOM lib 的类型面内（也不为此把
// WebWorker lib 拉进主程序——两套 lib 互相冲突），边界处手写最小切面。
interface FetchEventLike {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}
interface MessageEventLike {
  readonly data: unknown;
  readonly ports: readonly MessagePortLike[];
}
interface ServiceWorkerGlobalLike {
  skipWaiting(): Promise<void>;
  addEventListener(
    type: "fetch",
    listener: (event: FetchEventLike) => void,
  ): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEventLike) => void,
  ): void;
  addEventListener(
    type: string,
    listener: (event: ExtendableEventLike) => void,
  ): void;
}

/**
 * 在 Service Worker 全局上完成全部接线（install 跳过等待、fetch 响应复用、
 * message 预取命令）。SW 入口文件只需：
 * `attachMobilePrefetch(self, { apiPathPrefix: "/api/..." })`。
 */
export function attachMobilePrefetch(
  scope: unknown,
  options: MobilePrefetchServiceWorkerOptions,
): void {
  const runtime = createMobilePrefetchServiceWorker(options);
  const sw = scope as ServiceWorkerGlobalLike; // 边界收窄：调用方传入 SW 全局 self
  runtime.install(sw);
  sw.addEventListener("fetch", (event) => {
    event.respondWith(runtime.handleFetch(event.request));
  });
  sw.addEventListener("message", (event) => runtime.handleMessage(event));
}
