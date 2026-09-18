import type { CancellationFailure, CancellationSignal } from "./cancellation";
import type { Result } from "../result";

export type NetworkMethod = "GET" | "POST" | "DELETE";

export interface NetworkRequest {
  readonly path: string;
  readonly method: NetworkMethod;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown | undefined;
  readonly timeoutMs: number | undefined;
  readonly signal: CancellationSignal;
}

export interface NetworkResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface NetworkFailure {
  readonly kind: "network" | "timeout" | "protocol";
  readonly message: string;
}

export interface NetworkPort {
  request(
    request: NetworkRequest,
  ): Promise<Result<NetworkResponse, NetworkFailure | CancellationFailure>>;
}
