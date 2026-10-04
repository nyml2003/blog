import type { DesktopApi, SiteRoutes } from "@blog/desktop-api";
import type { NavigationPort } from "@fluvient-loom/port";
export {
  siteRoute as route,
  siteRouteWithQuery as routeWithQuery,
} from "@fluvient-loom/page-kit";

export interface DesktopPageContext {
  readonly api: DesktopApi;
  readonly routes: SiteRoutes;
  readonly navigation: NavigationPort;
}
