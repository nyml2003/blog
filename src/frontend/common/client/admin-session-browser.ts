const ADMIN_LOGIN_PATH = "/admin/login.html";
const ADMIN_HOME_PATH = "/admin/index.html";
const ADMIN_API_PREFIX = "/api/admin/";
const ADMIN_SESSION_PATH = "/api/admin/session";
export const ADMIN_SESSION_EXPIRED_EVENT = "blog:admin-session-expired";

export type AdminLocationSnapshot = {
  readonly origin: string;
  readonly pathname: string;
  readonly search: string;
};

export type AdminAuthFetchOptions = {
  readonly fetcher: typeof fetch;
  readonly readLocation: () => AdminLocationSnapshot;
  readonly beforeRedirect: () => void;
  readonly replaceLocation: (path: string) => void;
};

export const safeAdminNext = (
  candidate: string | null,
  origin: string,
): string => {
  if (candidate === null || !candidate.startsWith("/admin/")) {
    return ADMIN_HOME_PATH;
  }
  if (/\\|%5c/i.test(candidate)) return ADMIN_HOME_PATH;

  let parsed: URL;
  try {
    parsed = new URL(candidate, origin);
  } catch {
    return ADMIN_HOME_PATH;
  }

  const isSafeOrigin = parsed.origin === origin;
  const isAdminPath = parsed.pathname.startsWith("/admin/");
  const isLoginPath = parsed.pathname === ADMIN_LOGIN_PATH;
  if (!isSafeOrigin || !isAdminPath || isLoginPath) return ADMIN_HOME_PATH;
  return `${parsed.pathname}${parsed.search}`;
};

export const adminNextFromLocation = (
  location: AdminLocationSnapshot,
): string =>
  safeAdminNext(`${location.pathname}${location.search}`, location.origin);

export const adminNextFromSearch = (search: string, origin: string): string => {
  const candidate = new URLSearchParams(search).get("next");
  return safeAdminNext(candidate, origin);
};

export const adminLoginPath = (location: AdminLocationSnapshot): string => {
  const next = adminNextFromLocation(location);
  return `${ADMIN_LOGIN_PATH}?${new URLSearchParams({ next })}`;
};

const requestUrl = (
  input: RequestInfo | URL,
  origin: string,
): URL | undefined => {
  try {
    if (input instanceof Request) return new URL(input.url, origin);
    return new URL(input.toString(), origin);
  } catch {
    return undefined;
  }
};

export const isProtectedAdminApiRequest = (
  input: RequestInfo | URL,
  origin: string,
): boolean => {
  const url = requestUrl(input, origin);
  if (url === undefined || url.origin !== origin) return false;
  return (
    url.pathname.startsWith(ADMIN_API_PREFIX) &&
    url.pathname !== ADMIN_SESSION_PATH
  );
};

export const createAdminAuthFetch =
  (options: AdminAuthFetchOptions): typeof fetch =>
  async (input, init) => {
    const response = await options.fetcher.call(globalThis, input, init);
    if (response.status !== 401) return response;

    const location = options.readLocation();
    if (!isProtectedAdminApiRequest(input, location.origin)) return response;
    options.beforeRedirect();
    options.replaceLocation(adminLoginPath(location));
    return response;
  };
