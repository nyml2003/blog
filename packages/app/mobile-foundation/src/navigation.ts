export interface MobileRouteTable {
  readonly routes: {
    readonly routes: Readonly<Record<string, string>>;
  };
}

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export function mobileNavigationItems(context: MobileRouteTable): readonly NavigationItem[] {
  return [
    { id: "home", label: "推荐", href: route(context, "mobile-home") },
    { id: "articles", label: "文章", href: route(context, "mobile-articles") },
    { id: "settings", label: "设置", href: route(context, "mobile-settings") },
  ];
}

export function route(context: MobileRouteTable, id: string): string {
  const value = context.routes.routes[id];
  if (value === undefined || value === "") throw new Error(`site route not available: ${id}`);
  return value;
}
