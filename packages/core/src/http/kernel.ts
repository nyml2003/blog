import {
  cancellationFailure,
  type CancellationFailure,
  type CancellationSignal,
} from "../cancellation.ts";
import { err, ok, type Result } from "../result.ts";
import { classifyTransportFailure, timeoutFailure, type HttpError } from "./error.ts";
import type { HttpChunkInfo, HttpRequest, HttpResponse } from "./types.ts";

type FetchLike = typeof fetch;
type SetTimeoutLike = (callback: () => void, delayMs: number) => unknown;
type ClearTimeoutLike = (handle: unknown) => void;

export interface HttpKernelOptions {
  /** Web-standard fetch; inject to override or fake in tests. */
  readonly fetcher?: FetchLike;
  readonly setTimeoutFn?: SetTimeoutLike;
  readonly clearTimeoutFn?: ClearTimeoutLike;
}

export interface HttpKernel {
  request(request: HttpRequest): Promise<Result<HttpResponse, HttpError | CancellationFailure>>;
}

type TransferFailure = HttpError | CancellationFailure;

function headersOf(headers: Headers): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function contentLengthOf(headers: Readonly<Record<string, string>>): number | undefined {
  const raw = headers["content-length"];
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Transport kernel over web-standard fetch: phased timeouts (headers / body
 * idle / total), cooperative cancellation, chunk-level body access and
 * cause-based error classification. Any received HTTP response is a transport
 * success — status handling stays with the caller. The body may be read once.
 */
export function createHttpKernel(options: HttpKernelOptions = {}): HttpKernel {
  const fetcher: FetchLike | undefined =
    options.fetcher ?? (typeof fetch === "function" ? fetch : undefined);
  const setTimeoutFn: SetTimeoutLike | undefined =
    options.setTimeoutFn ?? (typeof setTimeout === "function" ? setTimeout : undefined);
  const clearTimeoutFn: ClearTimeoutLike | undefined =
    options.clearTimeoutFn ??
    (typeof clearTimeout === "function"
      ? (handle: unknown) => clearTimeout(handle as Parameters<typeof clearTimeout>[0])
      : undefined);
  if (fetcher === undefined) {
    throw new Error("createHttpKernel: 全局 fetch 不存在，须显式注入 options.fetcher");
  }
  if (setTimeoutFn === undefined || clearTimeoutFn === undefined) {
    throw new Error(
      "createHttpKernel: 标准定时器不存在，须显式注入 options.setTimeoutFn / options.clearTimeoutFn",
    );
  }

  return {
    async request(request: HttpRequest) {
      const signal: CancellationSignal =
        request.signal ?? { cancelled: false, subscribe: () => ({ release() {} }) };
      if (signal.cancelled) return err(cancellationFailure());

      const controller = new AbortController();
      const signalHandle = signal.subscribe(() => controller.abort());
      let timedOut = false;
      const armTimer = (delayMs: number): unknown =>
        setTimeoutFn(() => {
          timedOut = true;
          controller.abort();
        }, delayMs);
      const clearTimer = (handle: unknown): void => {
        if (handle !== undefined) clearTimeoutFn(handle);
      };

      let headersHandle: unknown;
      const totalHandle =
        request.timeouts?.totalMs === undefined ? undefined : armTimer(request.timeouts.totalMs);
      if (request.timeouts?.headersMs !== undefined) headersHandle = armTimer(request.timeouts.headersMs);

      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimer(headersHandle);
        clearTimer(totalHandle);
        signalHandle.release();
      };
      const toFailure = (cause: unknown): TransferFailure => {
        settle();
        if (signal.cancelled) return cancellationFailure();
        if (timedOut) return timeoutFailure(request.url);
        return classifyTransportFailure(cause, request.url);
      };

      // AbortSignal does not notify subscribers that attach after the abort,
      // and an injected fetcher may hang forever instead of honouring the
      // signal — race the fetcher against an abort gate covering both cases.
      const aborted = new Promise<never>((_, reject) => {
        const abortError = () => new DOMException("Aborted", "AbortError");
        if (controller.signal.aborted) reject(abortError());
        else controller.signal.addEventListener("abort", () => reject(abortError()));
      });

      let response: Response;
      // Uint8Array<ArrayBufferLike> is a valid BodyInit at runtime; only the
      // TS generic parameter mismatches the platform lib's narrower type.
      const bodyInit =
        request.body === undefined
          ? undefined
          : typeof request.body === "string"
            ? request.body
            : (request.body as BodyInit);
      try {
        response = await Promise.race([
          fetcher(request.url, {
            method: request.method ?? "GET",
            headers: request.headers,
            body: bodyInit,
            signal: controller.signal,
          }),
          aborted,
        ]);
      } catch (cause) {
        return err(toFailure(cause));
      }
      clearTimer(headersHandle);

      const headers = headersOf(response.headers);
      const contentLength = contentLengthOf(headers);
      const finalUrl = response.url === "" ? request.url : response.url;

      const readChunks = async (
        onChunk: (chunk: Uint8Array, info: HttpChunkInfo) => void | Promise<void>,
      ): Promise<HttpChunkInfo> => {
        const body = response.body;
        if (!body) {
          settle();
          return { received: 0, total: contentLength };
        }
        const reader = body.getReader();
        let received = 0;
        const info = (): HttpChunkInfo => ({ received, total: contentLength });
        for (;;) {
          let idleHandle: unknown;
          if (request.timeouts?.bodyIdleMs !== undefined) {
            idleHandle = armTimer(request.timeouts.bodyIdleMs);
          }
          let step: ReadableStreamReadResult<Uint8Array>;
          try {
            step = await Promise.race([reader.read(), aborted]);
            clearTimer(idleHandle);
          } catch (cause) {
            clearTimer(idleHandle);
            throw toFailure(cause);
          }
          if (step.done) {
            settle();
            return info();
          }
          received += step.value.byteLength;
          await onChunk(step.value, info());
        }
      };

      const response_: HttpResponse = {
        status: response.status,
        headers,
        finalUrl,
        contentLength,
        async readText() {
          const decoder = new TextDecoder();
          let text = "";
          try {
            await readChunks((chunk) => {
              text += decoder.decode(chunk, { stream: true });
            });
          } catch (cause) {
            return Promise.reject(cause);
          }
          text += decoder.decode();
          return text;
        },
        readStream(onChunk) {
          return readChunks(onChunk);
        },
      };
      return ok(response_);
    },
  };
}
