import type { MobilePageContext } from "../context";
import { route } from "../context";

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export function mobileNavigationItems(
  context: MobilePageContext,
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
