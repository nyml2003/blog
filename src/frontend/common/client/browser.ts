import { createJsonTransport } from "../data/transport";
import {
  ADMIN_SESSION_EXPIRED_EVENT,
  createAdminAuthFetch,
} from "./admin-session-browser";
import { createClient } from "./api-client";
import {
  createMockSessionInterceptor,
  readMockSessionFromLocation,
} from "./mock-session";
import { siteRouteRequired } from "./site-routes";

/**
 * Browser composition root. Pages depend on domain capabilities, not transport.
 *
 * The Mock session interceptor is assembled unconditionally: it reads the
 * `mock-session` query parameter at request time and returns the request
 * untouched when the parameter is absent, so `runtime dev` shares state across
 * pages and reloads while every other run mode behaves exactly as before. That
 * is why no run-mode flag, build flag, or extra injected variable is needed
 * here — the only run configuration consumed is the Vite `BLOG_API_ORIGIN`
 * proxy target.
 */
export const browserClient = createClient(
  createJsonTransport({
    fetcher: createAdminAuthFetch({
      fetcher: fetch,
      readLocation: () => ({
        origin: location.origin,
        pathname: location.pathname,
        search: location.search,
      }),
      beforeRedirect: () =>
        window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT)),
      replaceLocation: (path) => location.replace(path),
      routes: () => ({
        loginPath: siteRouteRequired("desktop-admin-login"),
        homePath: siteRouteRequired("desktop-admin-home"),
      }),
    }),
    interceptors: [
      createMockSessionInterceptor({
        readSessionId: () => readMockSessionFromLocation(location.search),
      }),
    ],
  }),
);
