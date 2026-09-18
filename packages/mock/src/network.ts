import { cancellationFailure, err, ok } from "@fluvient-loom/common";
import type {
  NetworkFailure,
  NetworkMethod,
  NetworkPort,
  NetworkRequest,
  NetworkResponse,
  SchedulerPort,
} from "@fluvient-loom/port";

export type MockResult =
  | NetworkResponse
  | {
      readonly kind: "network" | "timeout" | "protocol";
      readonly message: string;
    }
  /** Never settles — pair with a request `timeoutMs` to rehearse timeouts. */
  | { readonly kind: "hang" };

export interface MockResponseContext {
  /** The request path, including any query string. */
  readonly path: string;
  /** Captured `:param` segments when the route pattern uses them. */
  readonly params: Readonly<Record<string, string>>;
  readonly method: NetworkMethod;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface MockRoute {
  readonly method: NetworkMethod;
  /**
   * Path pattern: literal segments, or `:name` to capture one segment.
   * The query string is ignored for matching; unmatched requests settle
   * as a 404 response.
   */
  readonly path: string;
  /** Simulated transport delay before the result settles (needs a scheduler). */
  readonly delayMs?: number;
  respond(context: MockResponseContext): MockResult | Promise<MockResult>;
}

function matchRoute(
  pattern: string,
  path: string,
): Record<string, string> | undefined {
  const patternSegments = pattern.split("/").filter(Boolean);
  const pathSegments = path.split("?")[0].split("/").filter(Boolean);
  if (patternSegments.length !== pathSegments.length) return undefined;
  const params: Record<string, string> = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const expected = patternSegments[index];
    const actual = pathSegments[index];
    if (expected.startsWith(":")) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) return undefined;
  }
  return params;
}

export interface MockNetworkOptions {
  readonly scheduler?: SchedulerPort;
}

type NetworkCall = ReturnType<NetworkPort["request"]>;

function isNetworkResponse(result: MockResult): result is NetworkResponse {
  return typeof (result as NetworkResponse).status === "number";
}

export function createMockNetwork(
  routes: readonly MockRoute[],
  options: MockNetworkOptions = {},
): NetworkPort {
  const { scheduler } = options;
  return {
    async request(request: NetworkRequest) {
      if (request.signal.cancelled) return err(cancellationFailure());
      let matched: { route: MockRoute; params: Record<string, string> } | undefined;
      for (const route of routes) {
        if (route.method !== request.method) continue;
        const params = matchRoute(route.path, request.path);
        if (params !== undefined) {
          matched = { route, params };
          break;
        }
      }
      if (matched === undefined) {
        return ok({
          status: 404,
          headers: { "content-type": "application/json" },
          body: { message: `no mock route: ${request.method} ${request.path}` },
        } satisfies NetworkResponse);
      }
      const { route, params } = matched;
      if (route.delayMs !== undefined && scheduler !== undefined) {
        await new Promise<void>((resolve) => {
          scheduler.delay(resolve, route.delayMs!);
        });
      }
      if (request.signal.cancelled) return err(cancellationFailure());
      const result = await route.respond({
        path: request.path,
        params,
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      if (isNetworkResponse(result)) return ok(result);
      if (result.kind === "hang") {
        // This request never settles; transport-level timeouts are the
        // consumer's business (see createNodeNetwork's timeoutMs).
        return new Promise<never>(() => undefined) as NetworkCall;
      }
      return err(result);
    },
  };
}
