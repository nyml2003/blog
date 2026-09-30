import { cancellationFailure, err, ok } from "@fluvient-loom/common";
import type {
  NetworkFailure,
  NetworkPort,
  NetworkRequest,
  NetworkResponse,
} from "@fluvient-loom/port";

type FetchLike = typeof fetch;
type SetTimeoutLike = (callback: () => void, delayMs: number) => unknown;
type ClearTimeoutLike = (handle: unknown) => void;

export interface WebNetworkOptions {
  /** Web-standard `fetch`; JSON-encodes request bodies and JSON-decodes responses. */
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

export function createWebNetwork(
  options: WebNetworkOptions = {},
): NetworkPort {
  const fetcher: FetchLike | undefined =
    options.fetcher ?? (typeof fetch === "function" ? fetch : undefined);
  const setTimeoutFn: SetTimeoutLike | undefined =
    options.setTimeoutFn ?? (typeof setTimeout === "function" ? setTimeout : undefined);
  const clearTimeoutFn: ClearTimeoutLike | undefined =
    options.clearTimeoutFn ??
    (typeof clearTimeout === "function"
      ? // Node's clearTimeout declaration rejects `unknown`; the handle is
        // always produced by the paired setTimeoutFn, so the cast is closed
        // within this adapter's type loop.
        (handle: unknown) =>
          clearTimeout(handle as Parameters<typeof clearTimeout>[0])
      : undefined);
  if (
    fetcher === undefined ||
    setTimeoutFn === undefined ||
    clearTimeoutFn === undefined
  ) {
    throw new Error(
      "createWebNetwork: 标准 fetch/定时器不存在，须显式注入对应 options",
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
      try {
        const response = await fetcher(request.path, {
          method: request.method,
          headers: request.headers,
          body:
            request.body === undefined
              ? undefined
              : JSON.stringify(request.body),
          signal: controller.signal,
        });
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
