import type { NavigationPort } from "@fluvient-loom/port";
import type { DesktopApi, SiteRoutes } from "@blog/desktop-api";

// Desktop context 是应用声明（api 客户端消化 network，不进 context）；
// 端口装配的唯一声明在 page-kit/desktop（createWebDesktopPorts）。
export interface DesktopPageContext {
  readonly api: DesktopApi;
  readonly routes: SiteRoutes;
  readonly navigation: NavigationPort;
}

export function route(routes: SiteRoutes, id: string): string {
  const value = routes.routes[id];
  if (value === undefined || value === "")
    throw new Error(`site route not available: ${id}`);
  return value;
}

export function routeWithQuery(
  routes: SiteRoutes,
  id: string,
  parameters: Readonly<Record<string, string | number>>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters))
    search.set(key, String(value));
  const query = search.toString();
  return query === "" ? route(routes, id) : `${route(routes, id)}?${query}`;
}
