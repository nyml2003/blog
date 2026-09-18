import { cancellationFailure } from "../../kernel/cancellation";
import { err, ok } from "../../kernel/result";
import type {
  NetworkFailure,
  NetworkPort,
  NetworkRequest,
  NetworkResponse,
} from "../../kernel/ports";

export interface BrowserNetworkOptions {
  readonly fetcher: typeof fetch;
  readonly setTimeoutFn: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimeoutFn: (handle: unknown) => void;
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

export function createBrowserNetwork(
  options: BrowserNetworkOptions,
): NetworkPort {
  return {
    async request(request: NetworkRequest) {
      if (request.signal.cancelled) return err(cancellationFailure());
      const controller = new AbortController();
      const listener = request.signal.subscribe(() => controller.abort());
      let timeoutHandle: unknown;
      let timedOut = false;
      if (request.timeoutMs !== undefined) {
        timeoutHandle = options.setTimeoutFn(() => {
          timedOut = true;
          controller.abort();
        }, request.timeoutMs);
      }
      try {
        const response = await options.fetcher(request.path, {
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
        if (timeoutHandle !== undefined) options.clearTimeoutFn(timeoutHandle);
      }
    },
  };
}
