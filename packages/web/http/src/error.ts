import { toErrorInfo, type ErrorInfo } from "@fluvient/core";

export type HttpErrorKind =
  | "dns"
  | "tls"
  | "connection"
  | "reset"
  | "timeout"
  | "status"
  | "transport";

export interface HttpError {
  readonly kind: HttpErrorKind;
  readonly message: string;
  readonly cause?: ErrorInfo;
  readonly url?: string;
  /** Present when kind is "status". */
  readonly status?: number;
  /** Transport-level retry hint; callers may apply their own policy on top. */
  readonly retryable: boolean;
}

const DNS_CODES = new Set(["ENOTFOUND", "EAI_AGAIN"]);
const TLS_CODES = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "EPROTO",
  "HAND_SHAKE_TIMEOUT",
]);
const CONNECTION_CODES = new Set(["ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH"]);
const RESET_CODES = new Set(["ECONNRESET", "EPIPE"]);

/**
 * Turns a rejected fetch (or body read) into a classified transport error.
 * Codes come from the platform resolver / TLS / socket layer exposed by undici.
 */
export function classifyTransportFailure(cause: unknown, url?: string): HttpError {
  const code = readCauseCode(cause);
  const message = cause instanceof Error ? cause.message : String(cause);
  const errorInfo = toErrorInfo(cause);
  if (code !== undefined && DNS_CODES.has(code)) {
    return { kind: "dns", message, url, retryable: code === "EAI_AGAIN", cause: errorInfo };
  }
  if (code !== undefined && TLS_CODES.has(code)) {
    return { kind: "tls", message, url, retryable: false, cause: errorInfo };
  }
  if (code !== undefined && CONNECTION_CODES.has(code)) {
    return { kind: "connection", message, url, retryable: false, cause: errorInfo };
  }
  if (code !== undefined && RESET_CODES.has(code)) {
    return { kind: "reset", message, url, retryable: true, cause: errorInfo };
  }
  return { kind: "transport", message, url, retryable: true, cause: errorInfo };
}

/** Timeout classification for aborts raised by the kernel's own timers. */
export function timeoutFailure(url?: string): HttpError {
  return { kind: "timeout", message: "transfer timed out", url, retryable: true };
}

/** HTTP status as a classified error, for callers that treat non-2xx as failure. */
export function httpStatusError(status: number, url?: string): HttpError {
  return {
    kind: "status",
    message: `HTTP ${status}`,
    url,
    status,
    retryable: status === 408 || status === 429 || (status >= 500 && status <= 599),
  };
}

function readCauseCode(cause: unknown): string | undefined {
  if (cause === null || typeof cause !== "object") return undefined;
  const direct = (cause as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  // Platform fetch rejects with a TypeError whose `cause` carries the socket code.
  const nested = (cause as { cause?: unknown }).cause;
  if (nested !== null && typeof nested === "object") {
    const inner = (nested as { code?: unknown }).code;
    if (typeof inner === "string") return inner;
  }
  return undefined;
}
