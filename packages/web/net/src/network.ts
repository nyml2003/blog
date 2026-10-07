import { createHttpKernel, type HttpError, type HttpKernelOptions } from "@fluvient-loom/web-http";
import {
  cancellationFailure,
  err,
  ok,
  toErrorInfo,
  type CancellationFailure,
  type SerializableResult,
} from "@fluvient/core";
import type {
  NetworkFailure,
  NetworkPort,
  NetworkRequest,
  NetworkResponse,
} from "@fluvient-loom/port";

export type FetchNetworkOptions = HttpKernelOptions;

type NetworkOutcome = SerializableResult<NetworkResponse, NetworkFailure | CancellationFailure>;
type KernelFailure = HttpError | CancellationFailure;

function asKernelFailure(error: unknown): KernelFailure {
  if (typeof error === "object" && error !== null && "kind" in error) {
    if ((error as { kind: unknown }).kind === "cancelled") return cancellationFailure();
    const candidate = error as {
      kind?: unknown;
      message?: unknown;
      retryable?: unknown;
      cause?: unknown;
    };
    if (isHttpErrorKind(candidate.kind) && typeof candidate.message === "string") {
      return {
        kind: candidate.kind,
        message: candidate.message,
        retryable: candidate.retryable === true,
        cause: candidate.cause === undefined ? undefined : toErrorInfo(candidate.cause),
      };
    }
  }
  return { kind: "transport", message: String(error), retryable: true, cause: toErrorInfo(error) };
}

function isHttpErrorKind(value: unknown): value is HttpError["kind"] {
  return (
    value === "dns" ||
    value === "tls" ||
    value === "connection" ||
    value === "reset" ||
    value === "timeout" ||
    value === "status" ||
    value === "transport"
  );
}

function toNetworkFailure(error: KernelFailure): NetworkFailure | CancellationFailure {
  if (error.kind === "cancelled") return cancellationFailure();
  return {
    kind: error.kind === "timeout" ? "timeout" : "network",
    message: error.message,
    cause: error.cause,
  };
}

/**
 * The single NetworkPort implementation over web-standard fetch, built on the
 * shared HTTP kernel. Runs in the browser and in Node alike — host packages
 * (@fluvient-loom/web, @fluvient-loom/node) no longer ship their own copies.
 * JSON-encodes request bodies and JSON-decodes responses, like the previous
 * per-host adapters did.
 */
export function createFetchNetwork(options: FetchNetworkOptions = {}): NetworkPort {
  const http = createHttpKernel(options);
  return {
    async request(request: NetworkRequest): Promise<NetworkOutcome> {
      const response = await http.request({
        url: request.path,
        method: request.method,
        headers: request.headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        timeouts: request.timeoutMs === undefined ? undefined : { totalMs: request.timeoutMs },
        signal: request.signal,
      });
      if (!response.ok) return err(toNetworkFailure(response.error));
      let text: string;
      try {
        text = await response.value.readText();
      } catch (error) {
        return err(toNetworkFailure(asKernelFailure(error)));
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch (cause) {
        return err({
          kind: "protocol",
          message: cause instanceof Error ? cause.message : String(cause),
          cause: toErrorInfo(cause),
        });
      }
      return ok({
        status: response.value.status,
        headers: response.value.headers,
        body,
      });
    },
  };
}
