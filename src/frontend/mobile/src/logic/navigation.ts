import type { NavigationItem } from "../../../mobile-ui/molecules";
import { siteRouteRequired } from "../../../common/client/site-routes";

/**
 * Mobile 底部导航（SPEC-SITE-ROUTES-001）：路径值来自后端路由清单，
 * 本模块保持框架无关，只在组件渲染期（引导完成后）调用取用函数。
 */
export const mobileNavigationItems = () =>
  [
    {
      id: "home",
      href: siteRouteRequired("mobile-home"),
      mark: "荐",
      label: "推荐",
    },
    {
      id: "articles",
      href: siteRouteRequired("mobile-articles"),
      mark: "库",
      label: "文章库",
    },
    {
      id: "settings",
      href: siteRouteRequired("mobile-settings"),
      mark: "设",
      label: "设置",
    },
  ] as const satisfies readonly NavigationItem[];
