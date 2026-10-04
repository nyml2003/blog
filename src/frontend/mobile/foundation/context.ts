import { type DataResource } from "@fluvient-loom/query";
import type { WebMobilePorts } from "@fluvient-loom/page-kit/mobile";
import type { MobileApi, SiteRoutes } from "./api";

// 端口形状的唯一声明在 page-kit/mobile（WebMobilePorts）；
// 端内 context 只追加应用声明（api 客户端与路由清单）。
export interface MobilePageContext extends WebMobilePorts {
  readonly api: MobileApi;
  readonly routes: SiteRoutes;
}

export interface MobileRouteContext {
  readonly routes: SiteRoutes;
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

export type MobileResource<T, E> = DataResource<T, E>;
