import type { MobileRouteContext } from "../context.ts";
import { route } from "../context.ts";

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export function mobileNavigationItems(
  context: MobileRouteContext,
): readonly NavigationItem[] {
  return [
    {
      id: "home",
      label: "推荐",
      href: route(context.routes, "mobile-home"),
    },
    {
      id: "articles",
      label: "文章",
      href: route(context.routes, "mobile-articles"),
    },
    {
      id: "settings",
      label: "设置",
      href: route(context.routes, "mobile-settings"),
    },
  ];
}
