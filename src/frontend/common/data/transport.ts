import type { DataError } from "./errors";
import { z } from "zod";
import { htmlInspectionSchema } from "../validation/article-html";
import type { DeepReadonly } from "./readonly";
import { err, ok, type Result } from "./result";

export interface TransportRequest {
  readonly path: string;
  readonly method: "GET" | "POST";
  readonly body?: unknown;
  readonly signal: AbortSignal;
  readonly timeoutMs?: number;
  /**
   * Headers already attached by the caller. Omitted headers fall back to the
   * transport defaults (a JSON body adds `Content-Type: application/json`).
   */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * A pure request transform applied by the transport before sending.
 * Interceptors must not throw and must not start side effects.
 */
export type TransportRequestInterceptor = (
  request: TransportRequest,
) => TransportRequest;

export type JsonTransportOptions = {
  readonly fetcher: typeof fetch;
  readonly interceptors: readonly TransportRequestInterceptor[];
};

export interface Transport {
  request<T>(
    request: TransportRequest,
  ): Promise<Result<DeepReadonly<T>, DataError>>;
}

const envelopeSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  data: z.unknown(),
});
const htmlFailureSchema = z.object({ htmlInspection: htmlInspectionSchema });

const NO_INTERCEPTORS: readonly TransportRequestInterceptor[] = [];

const applyInterceptors = (
  interceptors: readonly TransportRequestInterceptor[],
  request: TransportRequest,
): TransportRequest => {
  let outgoing = request;
  for (const interceptor of interceptors) outgoing = interceptor(outgoing);
  return outgoing;
};

/**
 * Creates the JSON envelope transport.
 *
 * The argument is either the fetcher to use (existing call sites) or an options
 * object that also carries request interceptors, e.g. the debug session header
 * assembled in the composition root.
 */
export function createJsonTransport(
  input: typeof fetch | JsonTransportOptions = fetch,
): Transport {
  const fetcher = typeof input === "function" ? input : input.fetcher;
  const interceptors =
    typeof input === "function" ? NO_INTERCEPTORS : input.interceptors;
  return {
    async request<T>(request: TransportRequest) {
      const outgoing = applyInterceptors(interceptors, request);
      const hasBody = outgoing.body !== undefined;
      const headers = hasBody
        ? { ...outgoing.headers, "Content-Type": "application/json" }
        : outgoing.headers;
      let timedOut = false;
      const requestController = new AbortController();
      const abortFromCaller = () => requestController.abort();
      outgoing.signal.addEventListener("abort", abortFromCaller, {
        once: true,
      });
      const timeout =
        outgoing.timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              timedOut = true;
              requestController.abort();
            }, outgoing.timeoutMs);
      try {
        const init: RequestInit = {
          method: outgoing.method,
          signal: requestController.signal,
        };
        if (headers !== undefined) init.headers = headers;
        if (hasBody) init.body = JSON.stringify(outgoing.body);
        const response = await fetcher(outgoing.path, init);
        let envelope: z.infer<typeof envelopeSchema>;
        try {
          envelope = envelopeSchema.parse(await response.json());
        } catch {
          return err({ kind: "protocol", message: "响应不是有效 JSON" });
        }
        if (!response.ok || envelope.code !== "OK") {
          if (envelope.code === "INVALID_ARTICLE_HTML") {
            const details = htmlFailureSchema.safeParse(envelope.data);
            if (!details.success || details.data.htmlInspection.valid) {
              return err({
                kind: "protocol",
                message: "HTML 校验错误响应不符合协议",
              });
            }
            return err({
              kind: "html-validation",
              message: envelope.message || "正文校验未通过",
              htmlInspection: details.data.htmlInspection,
            });
          }
          return err({
            kind: "remote",
            code: envelope.code || `HTTP_${response.status}`,
            message: envelope.message || "请求失败",
          });
        }
        // Domain response schemas validate this generic payload in Client.
        return ok(envelope.data as T);
      } catch (cause) {
        if (timedOut) return err({ kind: "timeout" });
        if (outgoing.signal.aborted) return err({ kind: "cancelled" });
        return err({
          kind: "network",
          message: cause instanceof Error ? cause.message : "网络请求失败",
        });
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
        outgoing.signal.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}
