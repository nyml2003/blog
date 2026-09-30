import type { NavigationPort } from "../../kernel";
import type { DesktopApi, SiteRoutes } from "../api/desktop";

export interface DesktopPageContext {
  readonly api: DesktopApi;
  readonly routes: SiteRoutes;
  readonly navigation: NavigationPort;
}

export function route(routes: SiteRoutes, id: string): string {
  const value = routes.routes[id];
  if (value === undefined || value === "") throw new Error(`site route not available: ${id}`);
  return value;
}
