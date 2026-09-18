import type { MobilePageContext } from "../context";
import { route } from "../context";

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly mark: string;
  readonly href: string;
}

export function mobileNavigationItems(
  context: MobilePageContext,
): readonly NavigationItem[] {
  return [
    {
      id: "home",
      label: "推荐",
      mark: "⌂",
      href: route(context.routes, "mobile-home"),
    },
    {
      id: "articles",
      label: "文章",
      mark: "▤",
      href: route(context.routes, "mobile-articles"),
    },
    {
      id: "settings",
      label: "设置",
      mark: "⚙",
      href: route(context.routes, "mobile-settings"),
    },
  ];
}
