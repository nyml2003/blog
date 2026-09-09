/**
 * 页面路由清单的进程内缓存与同步访问（SPEC-SITE-ROUTES-001）。
 *
 * 路径值只有一个来源：后端 `/api/public/site-routes` 下发的清单（引导期由
 * `solid/queries/site-routes.ts` 写入）。本模块与调用方都不持有页面路径字面量；
 * 引导完成前访问视为编程错误，直接抛出而不是回退到任何前端路径。
 */

export type SiteRoutesMap = Readonly<Record<string, string>>;

let configured: SiteRoutesMap | undefined;

export const configureSiteRoutes = (routes: SiteRoutesMap): void => {
  configured = routes;
};

export const siteRoutesReady = (): boolean => configured !== undefined;

export const siteRouteRequired = (key: string): string => {
  const path = configured?.[key];
  if (path === undefined) {
    throw new Error(`site route not available: ${key}`);
  }
  return path;
};

/** 以查询参数拼接导航地址；路径基值必须来自清单，不接受字面量。 */
export const withQuery = (
  path: string,
  params: Readonly<Record<string, string | number>>,
): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== undefined) search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded === "" ? path : `${path}?${encoded}`;
};
