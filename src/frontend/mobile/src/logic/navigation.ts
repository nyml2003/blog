import type { NavigationItem } from "../../../mobile-ui/molecules";

export const mobileNavigationItems = [
  { id: "home", href: "/m/", mark: "荐", label: "推荐" },
  {
    id: "articles",
    href: "/m/articles/index.html",
    mark: "库",
    label: "文章库",
  },
  {
    id: "settings",
    href: "/m/settings/index.html",
    mark: "设",
    label: "设置",
  },
] as const satisfies readonly NavigationItem[];
