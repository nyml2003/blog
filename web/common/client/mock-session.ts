import type {
  TransportRequest,
  TransportRequestInterceptor,
} from "../data/transport";

/**
 * Composition-root-only debug injection for the dev Mock Product API.
 *
 * This module is intentionally not re-exported from `./index`: pages and domain
 * models never see the Mock session header or any Mock-specific type.
 */

const MOCK_SESSION_QUERY_KEY = "mock-session";
const MOCK_SESSION_HEADER = "X-Blog-Mock-Session";

export type MockSessionSource = () => string | undefined;

export type MockSessionInterceptorOptions = {
  readonly readSessionId: MockSessionSource;
};

const hasExplicitSession = (
  value: string | null | undefined,
): value is string => value !== null && value !== undefined && value !== "";

/**
 * Reads the explicit Mock session id from a `location.search` query string
 * (`"?mock-session=<id>"`). Returns `undefined` when no session is opted into,
 * so normal users keep sending requests without any extra header.
 */
export function readMockSessionFromLocation(
  search: string,
): string | undefined {
  const sessionId = new URLSearchParams(search).get(MOCK_SESSION_QUERY_KEY);
  if (!hasExplicitSession(sessionId)) return undefined;
  return sessionId;
}

/** Attaches the Mock session header to every request of an explicit session. */
export function createMockSessionInterceptor(
  options: MockSessionInterceptorOptions,
): TransportRequestInterceptor {
  return (request: TransportRequest) => {
    const sessionId = options.readSessionId();
    if (!hasExplicitSession(sessionId)) return request;
    return {
      ...request,
      headers: { ...request.headers, [MOCK_SESSION_HEADER]: sessionId },
    };
  };
}
