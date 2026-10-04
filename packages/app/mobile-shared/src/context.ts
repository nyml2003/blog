import type { MobileApi, SiteRoutes } from "@blog/mobile-api";
import type { WebMobilePorts } from "@fluvient-loom/page-kit/mobile";
// context 别名：包内组件与页面包经此获得与页面输入契约同名的
// 路由工具与类型（siteRoute 以 route 之名导出，调用点零改动）。
export {
  siteRoute as route,
  siteRouteWithQuery as routeWithQuery,
} from "@fluvient-loom/page-kit";

export interface MobileRouteContext {
  readonly routes: SiteRoutes;
}

export type MobilePageContext = WebMobilePorts & {
  readonly api: MobileApi;
  readonly routes: SiteRoutes;
};
