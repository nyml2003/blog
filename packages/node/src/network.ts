import { cancellationFailure, err, ok } from "@fluvient/core";
import type {
  NetworkFailure,
  NetworkPort,
  NetworkRequest,
  NetworkResponse,
} from "@fluvient-loom/port";

type FetchLike = typeof fetch;
type SetTimeoutLike = (callback: () => void, delayMs: number) => unknown;
type ClearTimeoutLike = (handle: unknown) => void;

export interface NodeNetworkOptions {
  /**
   * Node's global fetch implements the Web standard; inject to override or
   * fake in tests. No Node-specific imports (undici / node:http) by design.
   */
  readonly fetcher?: FetchLike;
  readonly setTimeoutFn?: SetTimeoutLike;
  readonly clearTimeoutFn?: ClearTimeoutLike;
}

function failure(kind: NetworkFailure["kind"], cause: unknown): NetworkFailure {
  return {
    kind,
    message: cause instanceof Error ? cause.message : String(cause),
  };
}

function headersOf(headers: Headers): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export function createNodeNetwork(
  options: NodeNetworkOptions = {},
): NetworkPort {
  const fetcher: FetchLike | undefined =
    options.fetcher ?? (typeof fetch === "function" ? fetch : undefined);
  const setTimeoutFn: SetTimeoutLike | undefined =
    options.setTimeoutFn ??
    (typeof setTimeout === "function" ? setTimeout : undefined);
  const clearTimeoutFn: ClearTimeoutLike | undefined =
    options.clearTimeoutFn ??
    (typeof clearTimeout === "function"
      ? (handle: unknown) =>
          clearTimeout(handle as Parameters<typeof clearTimeout>[0])
      : undefined);
  if (fetcher === undefined) {
    throw new Error(
      "createNodeNetwork: 全局 fetch 不存在，须显式注入 options.fetcher",
    );
  }
  if (setTimeoutFn === undefined || clearTimeoutFn === undefined) {
    throw new Error(
      "createNodeNetwork: 标准定时器不存在，须显式注入 options.setTimeoutFn / clearTimeoutFn",
    );
  }

  return {
    async request(request: NetworkRequest) {
      if (request.signal.cancelled) return err(cancellationFailure());
      const controller = new AbortController();
      const listener = request.signal.subscribe(() => controller.abort());
      let timeoutHandle: unknown;
      let timedOut = false;
      if (request.timeoutMs !== undefined) {
        timeoutHandle = setTimeoutFn(() => {
          timedOut = true;
          controller.abort();
        }, request.timeoutMs);
      }
      // AbortSignal does not notify subscribers that attach after the abort
      // (Node dispatches the event eagerly), and an injected fetcher may hang
      // forever instead of honouring the signal — race the fetcher against an
      // abort gate that also covers the already-aborted case.
      const aborted = new Promise<never>((_, reject) => {
        const abortError = () => new DOMException("Aborted", "AbortError");
        if (controller.signal.aborted) reject(abortError());
        else controller.signal.addEventListener("abort", () => reject(abortError()));
      });
      try {
        const response = await Promise.race([
          fetcher(request.path, {
            method: request.method,
            headers: request.headers,
            body:
              request.body === undefined
                ? undefined
                : JSON.stringify(request.body),
            signal: controller.signal,
          }),
          aborted,
        ]);
        let body: unknown;
        try {
          body = await response.json();
        } catch (cause) {
          return err(failure("protocol", cause));
        }
        const result: NetworkResponse = {
          status: response.status,
          headers: headersOf(response.headers),
          body,
        };
        return ok(result);
      } catch (cause) {
        if (request.signal.cancelled) return err(cancellationFailure());
        if (timedOut) return err(failure("timeout", cause));
        return err(failure("network", cause));
      } finally {
        listener.release();
        if (timeoutHandle !== undefined) clearTimeoutFn(timeoutHandle);
      }
    },
  };
}
