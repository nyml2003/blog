import type { AppShellSpec } from "@fluvient-loom/app-shell";

// 页面契约模块：页面包的唯一依赖点。页面的抽象单位是接口——
// 写页面 = 实现这里的类型，没有模板、没有生成器、没有工具碰人的源文件。
// 构建链（@fluvient-loom/page-build-kit）re-export 这些类型并消费。

export const PAGE_MOUNT_ELEMENT_ID = "app";

export interface MountDocumentLike {
  getElementById(elementId: string): HTMLElement | null;
}

/** 解析页面挂载点；缺失即抛错（模块求值中止，页面无渲染）。 */
export function requireMountTarget(
  document: MountDocumentLike,
  elementId: string = PAGE_MOUNT_ELEMENT_ID,
): HTMLElement {
  const element = document.getElementById(elementId);
  if (element === null) {
    throw new Error(`Page mount element "#${elementId}" is missing`);
  }
  return element;
}

export interface SiteRoutesLike {
  readonly routes: Readonly<Record<string, string>>;
}

/** 语义路由解析：id 缺失或空值即抛错（与宿主 foundation 的 route() 同语义）。 */
export function siteRoute<Routes extends SiteRoutesLike>(
  routes: Routes,
  id: string,
): string {
  const value = routes.routes[id];
  if (value === undefined || value === "")
    throw new Error(`site route not available: ${id}`);
  return value;
}

/** 语义路由 + 查询串（与宿主 foundation 的 routeWithQuery() 同语义）。 */
export function siteRouteWithQuery<Routes extends SiteRoutesLike>(
  routes: Routes,
  id: string,
  parameters: Readonly<Record<string, string | number>>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters))
    search.set(key, String(value));
  const query = search.toString();
  return query === ""
    ? siteRoute(routes, id)
    : `${siteRoute(routes, id)}?${query}`;
}

export type PagePlatform = "desktop" | "mobile";

/** 页面登记：页面存在 ⇔ 页面包声明了这份契约。 */
export interface PageRegistration {
  readonly id: string;
  readonly platform: PagePlatform;
  readonly outputPath: string;
  readonly entry: string;
  readonly title: string;
  readonly description: string | undefined;
  readonly aliases: readonly string[];
  readonly bootstrap: boolean;
  readonly shell?: AppShellSpec;
}

export interface PageRoute {
  readonly alias: string;
  readonly outputPath: string;
}

/** 把登记展平为 alias → outputPath 的有序投影。 */
export function pageRoutes(
  registrations: readonly PageRegistration[],
): readonly PageRoute[] {
  return registrations.flatMap((page) =>
    page.aliases.map((alias) => ({ alias, outputPath: page.outputPath })),
  );
}

/** 页面作者入口：可选字段给默认值，产出完整 PageRegistration。 */
export interface DefinePageInput {
  readonly id: string;
  readonly platform: PagePlatform;
  readonly outputPath: string;
  readonly entry: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly description?: string;
  readonly bootstrap?: boolean;
  readonly shell?: AppShellSpec;
}

export function definePage(definition: DefinePageInput): PageRegistration {
  return {
    id: definition.id,
    platform: definition.platform,
    outputPath: definition.outputPath,
    entry: definition.entry,
    title: definition.title,
    description: definition.description,
    aliases: definition.aliases,
    bootstrap: definition.bootstrap ?? false,
    shell: definition.shell,
  };
}
