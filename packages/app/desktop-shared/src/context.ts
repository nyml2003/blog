import type { DesktopApi, SiteRoutes } from "@blog/desktop-api";
import type { WebDesktopPorts } from "@fluvient-loom/page-kit/desktop";
export {
  siteRoute as route,
  siteRouteWithQuery as routeWithQuery,
} from "@fluvient-loom/page-contract";

export interface DesktopPageContext {
  readonly api: DesktopApi;
  readonly routes: SiteRoutes;
  readonly navigation: WebDesktopPorts["navigation"];
  readonly dialog: WebDesktopPorts["dialog"];
  readonly sessionStorage: WebDesktopPorts["sessionStorage"];
}
