// 纯共享逻辑：无平台全局、无 UI 实现——两端子路径各自持有自己的组件与装配
// （Desktop/Mobile UI 隔离边界在包内同样成立）。

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

// 页面包的声明契约（definePage）：页面只说"我是谁"（纯元数据，node 安全——
// 注册表在构建期 CLI/测试中被 import，不得拉起组件实现与样式副作用）；
// 组件工厂由包的 "./page" 子路径单独导出，构建域（outputPath/entry）由宿主
// 注册表聚合时补充。与 page-build-kit 的 PageRegistration 的对齐由聚合处
// 的 satisfies 编译锚定。
export interface PageMetadata {
  readonly id: string;
  readonly platform: "desktop" | "mobile";
  readonly aliases: readonly string[];
  readonly title: string;
}

export function definePage(metadata: PageMetadata): PageMetadata {
  return metadata;
}
