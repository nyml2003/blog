import { createDataTask, err, ok } from "../../../kernel";
import { cancellationFailure } from "../../../kernel/cancellation";
import type { DataTask, NetworkPort, NetworkRequest } from "../../../kernel/ports";
import type { Result } from "../../../kernel/result";
import { z } from "zod";
import { siteRoutesSchema, tShelfSchema, type DesktopApi, type DesktopApiFailure, type TShelfInput } from "./types";

const envelopeSchema = z.object({ code: z.string(), message: z.string().optional(), data: z.unknown() });
const routes = {
  siteRoutes: { endpoint: "/api/public/site-routes", sceneCode: "public.site_routes" },
  tShelf: { endpoint: "/api/public/t-shelf", sceneCode: "public.t_shelf" },
} as const;

function requestPath(endpoint: string, sceneCode: string, parameters: Record<string, string | undefined>): string {
  const search = new URLSearchParams({ sceneCode });
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  return `${endpoint}?${search}`;
}

function failure(kind: DesktopApiFailure["kind"], message: string, details: Partial<Omit<DesktopApiFailure, "kind" | "message">> = {}): DesktopApiFailure {
  return { kind, message, code: details.code, status: details.status, issues: details.issues };
}

function decode<T>(body: unknown, status: number, schema: z.ZodType<T>): Result<T, DesktopApiFailure> {
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) {
    return err(failure("protocol", "响应 envelope 不符合协议", { status, issues: envelope.error.issues.map((issue) => issue.path.join(".") || issue.message) }));
  }
  if (status < 200 || status >= 300 || envelope.data.code !== "OK") {
    return err(failure("remote", envelope.data.message ?? "请求失败", { status, code: envelope.data.code }));
  }
  const payload = schema.safeParse(envelope.data.data);
  if (!payload.success) {
    return err(failure("protocol", "响应 data 不符合协议", { status, code: envelope.data.code, issues: payload.error.issues.map((issue) => issue.path.join(".") || issue.message) }));
  }
  return ok(payload.data);
}

function getRequest(path: string): Omit<NetworkRequest, "signal"> {
  return { path, method: "GET", headers: {}, body: undefined, timeoutMs: undefined };
}

function request<T>(network: NetworkPort, input: Omit<NetworkRequest, "signal">, schema: z.ZodType<T>): DataTask<T, DesktopApiFailure> {
  return createDataTask<T, DesktopApiFailure>({
    async execute(signal) {
      const response = await network.request({ ...input, signal });
      if (!response.ok) {
        if (response.error.kind === "cancelled") return err(cancellationFailure());
        return err(failure(response.error.kind === "timeout" ? "timeout" : response.error.kind, response.error.message));
      }
      return decode(response.value.body, response.value.status, schema);
    },
    mapRejected(cause) { return failure("network", cause instanceof Error ? cause.message : "请求执行失败"); },
  });
}

export function createDesktopApi(network: NetworkPort): DesktopApi {
  return {
    siteRoutes: { get: () => request(network, getRequest(requestPath(routes.siteRoutes.endpoint, routes.siteRoutes.sceneCode, {})), siteRoutesSchema) },
    tShelf: { get: (input: TShelfInput) => request(network, getRequest(requestPath(routes.tShelf.endpoint, routes.tShelf.sceneCode, { surface: input.surface, filter_id: input.filterId })), tShelfSchema) },
  };
}
