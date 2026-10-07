import { err, ok, type CancellationFailure, type SerializableResult, type ResourceHandle } from "@fluvient/core";
import type { NetworkPort, NetworkRequest, NetworkResponse, NetworkFailure, PersistencePort, PersistPlan } from "@fluvient-loom/port";

declare function setTimeout(callback: () => void, delayMs: number): number;
declare function clearTimeout(timer: number): void;

declare const wx: {
  request(options: { url: string; method: string; header: Readonly<Record<string, string>>; data?: unknown; timeout: number; success(value: { statusCode: number; header: Record<string, string>; data: unknown }): void; fail(value: { errMsg?: string }): void }): { abort(): void };
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
  reLaunch(options: { url: string }): void;
  navigateTo(options: { url: string }): void;
  navigateBack(options: { delta: number }): void;
};

export function createWeappPersistence(): PersistencePort {
  return {
    read(key) {
      try {
        const value = wx.getStorageSync(key);
        return ok(typeof value === "string" ? value : value === undefined ? undefined : JSON.stringify(value));
      } catch (cause) { return err({ kind: "persistence", operation: "read", message: String(cause) }); }
    },
    write(plan: PersistPlan) {
      try { wx.setStorageSync(plan.key, plan.value); return ok(undefined); }
      catch (cause) { return err({ kind: "persistence", operation: "write", message: String(cause) }); }
    },
    remove(key) {
      try { wx.removeStorageSync(key); return ok(undefined); }
      catch (cause) { return err({ kind: "persistence", operation: "remove", message: String(cause) }); }
    },
  };
}

export interface WeappNavigation {
  home(): void;
  articles(): void;
  settings(): void;
  detail(id: number): void;
  back(fallback: "home" | "articles"): void;
}

export function createWeappNavigation(): WeappNavigation {
  const relaunch = (url: string) => wx.reLaunch({ url });
  return {
    home: () => relaunch("/pages/home/home"),
    articles: () => relaunch("/pages/articles/articles"),
    settings: () => relaunch("/pages/settings/settings"),
    detail: (id) => wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(String(id))}` }),
    back: (fallback) => relaunch(fallback === "home" ? "/pages/home/home" : "/pages/articles/articles"),
  };
}

export function createWeappNetwork(origin: string): NetworkPort {
  return {
    async request(input) {
      // Only idempotent reads retry; cancellation also interrupts the backoff.
      const attempts = input.method === "GET" ? 3 : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (input.signal.cancelled) return err({ kind: "cancelled" });
        const result = await requestOnce(origin, input);
        if (result.ok || result.error.kind === "cancelled" || attempt === attempts - 1) return result;
        await waitForRetry(input, 250 * 2 ** attempt);
      }
      return err({ kind: "cancelled" });
    },
  };
}

function requestOnce(origin: string, input: NetworkRequest): Promise<SerializableResult<NetworkResponse, NetworkFailure | CancellationFailure>> {
  return new Promise((resolve) => {
    let settled = false;
    let subscription: ResourceHandle | undefined;
    const finish = (result: SerializableResult<NetworkResponse, NetworkFailure | CancellationFailure>) => {
      if (settled) return;
      settled = true;
      subscription?.release();
      resolve(result);
    };
    const task = wx.request({
      url: `${origin}${input.path}`,
      method: input.method,
      header: input.headers,
      data: input.body,
      timeout: input.timeoutMs ?? 10_000,
      success: (response) => finish(ok({ status: response.statusCode, headers: response.header, body: response.data })),
      fail: (failure) => finish(err({
        kind: failure.errMsg?.includes("timeout") ? "timeout" : "network",
        message: failure.errMsg || "请求失败",
      })),
    });
    if (settled) return;
    subscription = input.signal.subscribe(() => {
      finish(err({ kind: "cancelled" }));
      task.abort();
    });
  });
}

function waitForRetry(input: NetworkRequest, delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    let subscription: ResourceHandle | undefined;
    const finish = () => {
      clearTimeout(timer);
      subscription?.release();
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    subscription = input.signal.subscribe(finish);
  });
}
