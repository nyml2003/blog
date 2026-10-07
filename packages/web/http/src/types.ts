import type { CancellationSignal } from "@fluvient/core";

export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpTimeouts {
  /** Max wait until response headers arrive (covers DNS/TCP/TLS plus server think time). */
  readonly headersMs?: number;
  /** Max idle gap between body chunks while the body is being read. */
  readonly bodyIdleMs?: number;
  /** Absolute deadline for the whole transfer, headers and body combined. */
  readonly totalMs?: number;
}

export interface HttpRequest {
  /** Absolute URL (or any specifier the injected fetcher understands). */
  readonly url: string;
  readonly method?: HttpMethod;
  readonly headers?: Readonly<Record<string, string>>;
  /** Plain bytes or text; encoding semantics belong to the caller. */
  readonly body?: string | Uint8Array;
  readonly timeouts?: HttpTimeouts;
  readonly signal?: CancellationSignal;
}

export interface HttpChunkInfo {
  readonly received: number;
  /** Total bytes when Content-Length is known; undefined otherwise. */
  readonly total: number | undefined;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  /** URL after redirects; the platform fetch follows them transparently. */
  readonly finalUrl: string;
  readonly contentLength: number | undefined;
  /** Reads the full body as text, honouring body-idle and total timeouts. */
  readText(): Promise<string>;
  /** Streams the body chunk by chunk; awaits sink callbacks; resolves with the final byte accounting. */
  readStream(onChunk: (chunk: Uint8Array, info: HttpChunkInfo) => void | Promise<void>): Promise<HttpChunkInfo>;
}
