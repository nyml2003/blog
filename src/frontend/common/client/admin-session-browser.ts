const ADMIN_API_PREFIX = "/api/admin/";
const ADMIN_SESSION_PATH = "/api/admin/session";
export const ADMIN_SESSION_EXPIRED_EVENT = "blog:admin-session-expired";

/**
 * 管理端会话跳转使用的页面路径。
 * 值来自后端下发的路由清单，不在本模块持有字面量。
 */
export type AdminSessionRoutePaths = {
  readonly loginPath: string;
  readonly homePath: string;
};

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
  readonly routes: () => AdminSessionRoutePaths;
};

export const safeAdminNext = (
  candidate: string | null,
  origin: string,
  paths: AdminSessionRoutePaths,
): string => {
  if (candidate === null || !candidate.startsWith("/admin/")) {
    return paths.homePath;
  }
  if (/\\|%5c/i.test(candidate)) return paths.homePath;

  let parsed: URL;
  try {
    parsed = new URL(candidate, origin);
  } catch {
    return paths.homePath;
  }

  const isSafeOrigin = parsed.origin === origin;
  const isAdminPath = parsed.pathname.startsWith("/admin/");
  const isLoginPath = parsed.pathname === paths.loginPath;
  if (!isSafeOrigin || !isAdminPath || isLoginPath) return paths.homePath;
  return `${parsed.pathname}${parsed.search}`;
};

export const adminNextFromLocation = (
  location: AdminLocationSnapshot,
  paths: AdminSessionRoutePaths,
): string =>
  safeAdminNext(
    `${location.pathname}${location.search}`,
    location.origin,
    paths,
  );

export const adminNextFromSearch = (
  search: string,
  origin: string,
  paths: AdminSessionRoutePaths,
): string => {
  const candidate = new URLSearchParams(search).get("next");
  return safeAdminNext(candidate, origin, paths);
};

export const adminLoginPath = (
  location: AdminLocationSnapshot,
  paths: AdminSessionRoutePaths,
): string => {
  const next = adminNextFromLocation(location, paths);
  return `${paths.loginPath}?${new URLSearchParams({ next })}`;
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
    options.replaceLocation(adminLoginPath(location, options.routes()));
    return response;
  };
