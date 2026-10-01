import type {
  CancellationFailure,
  CancellationSignal,
  Result,
} from "@fluvient/core";
import type {
  NetworkFailure,
  NetworkPort,
  NetworkResponse,
} from "./ports/network";

export interface JsonRequestCallOptions {
  readonly signal?: CancellationSignal;
  readonly timeoutMs?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface JsonRequester {
  get(
    path: string,
    options?: JsonRequestCallOptions,
  ): Promise<Result<NetworkResponse, NetworkFailure | CancellationFailure>>;
  post(
    path: string,
    body: unknown,
    options?: JsonRequestCallOptions,
  ): Promise<Result<NetworkResponse, NetworkFailure | CancellationFailure>>;
  delete(
    path: string,
    options?: JsonRequestCallOptions,
  ): Promise<Result<NetworkResponse, NetworkFailure | CancellationFailure>>;
}

type RequestOutcome = Result<NetworkResponse, NetworkFailure | CancellationFailure>;

/**
 * Port-level combinator: removes the five-field NetworkRequest boilerplate.
 * Returns the port's Result untouched — envelope decoding and schema
 * validation stay at the consumer (blog's api layer adds its own).
 */
export function createJsonRequester(network: NetworkPort): JsonRequester {
  const call = (
    path: string,
    method: "GET" | "POST" | "DELETE",
    body: unknown,
    options: JsonRequestCallOptions | undefined,
  ): Promise<RequestOutcome> =>
    network.request({
      path,
      method,
      headers: options?.headers ?? {},
      body,
      timeoutMs: options?.timeoutMs,
      signal: options?.signal ?? { cancelled: false, subscribe: () => ({ release() {} }) },
    });
  return {
    get: (path, options) => call(path, "GET", undefined, options),
    post: (path, body, options) => call(path, "POST", body, options),
    delete: (path, options) => call(path, "DELETE", undefined, options),
  };
}
