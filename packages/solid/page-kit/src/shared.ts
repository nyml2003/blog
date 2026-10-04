import type { Component } from "solid-js";
import type { Result } from "@fluvient/core";
import type { AppShellSpec } from "@fluvient-loom/app-shell";
import {
  decoder,
  type SerdeFailure,
  type StandardOutput,
  type StandardSchemaV1,
} from "@fluvient-loom/serde";
import { parseQueryString } from "@fluvient-loom/serde-web";

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

/** 页面登记元数据：页面存在 ⇔ 页面包声明了这份契约（构建链消费面）。 */
export interface PageRegistration {
  readonly id: string;
  readonly platform: PagePlatform;
  readonly outputPath: string;
  readonly title: string;
  readonly description: string | undefined;
  readonly aliases: readonly string[];
  readonly bootstrap: boolean;
  readonly shell?: AppShellSpec;
}

/** 页面工厂：具体上下文类型由页面包声明，装配点按平台传入标准上下文。 */
export type PageFactory<Context> = (context: Context) => Component;

/**
 * 运行时装载入口：懒加载页面组件（Vite 按页 code-split）。
 * 这是「有哪些页面」的唯一枚举——bootstrap entry 由此派生 id → load，
 * 不再重复列页面清单。定义文件里只允许 import() 表达式与纯数据，
 * 保持 "." 出口 node 安全（构建链与测试在 node 里 import 它）。
 */
export interface PageEntry<
  Platform extends PagePlatform,
  Context,
  Params = unknown,
> extends PageRegistration {
  readonly platform: Platform;
  readonly load: () => Promise<PageFactory<Context>>;
  /** 本页声明的 URL 参数 schema（Standard Schema）；无参数的页面为 undefined。 */
  readonly params: StandardSchemaV1 | undefined;
  /** 惰性解析：调用时才跑 parser + schema；无参数 schema 的页面恒返回 ok({})。 */
  parseParams(search: string): Result<Params, SerdeFailure>;
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

/** 无参数页面的占位 schema：恒定返回空对象（page-kit 不依赖具体 schema 库）。 */
const emptyParams: StandardSchemaV1<unknown, Record<string, never>> = {
  "~standard": {
    version: 1,
    vendor: "page-kit",
    validate: () => ({ value: {} }),
  },
};

/** 页面作者入口：可选字段给默认值，产出完整登记（元数据 + 懒装载 + 参数解析）。 */
export interface DefinePageInput<
  Platform extends PagePlatform,
  Context,
  ParamsSchema extends StandardSchemaV1 | undefined = undefined,
> {
  readonly id: string;
  readonly platform: Platform;
  readonly outputPath: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly description?: string;
  readonly bootstrap?: boolean;
  readonly shell?: AppShellSpec;
  /**
   * 本页的 URL 参数 schema（Standard Schema，必须同步）。
   * 省略 = 本页不读 URL 参数，parseParams 恒返回 ok({})。
   */
  readonly params?: ParamsSchema;
  readonly load: () => Promise<PageFactory<Context>>;
}

/** 无参数页面：parseParams 恒返回 ok({})。 */
export function definePage<Platform extends PagePlatform, Context>(
  definition: DefinePageInput<Platform, Context, undefined>,
): PageEntry<Platform, Context, Record<string, never>>;
/** 带参数页面：parseParams 返回 schema 的输出类型。 */
export function definePage<
  Platform extends PagePlatform,
  Context,
  ParamsSchema extends StandardSchemaV1,
>(
  definition: DefinePageInput<Platform, Context, ParamsSchema>,
): PageEntry<Platform, Context, StandardOutput<ParamsSchema>>;
export function definePage<
  Platform extends PagePlatform,
  Context,
  ParamsSchema extends StandardSchemaV1 | undefined,
>(
  definition: DefinePageInput<Platform, Context, ParamsSchema>,
): PageEntry<Platform, Context, unknown> {
  const schema: StandardSchemaV1<unknown, unknown> =
    definition.params ?? emptyParams;
  return {
    id: definition.id,
    platform: definition.platform,
    outputPath: definition.outputPath,
    title: definition.title,
    description: definition.description,
    aliases: definition.aliases,
    bootstrap: definition.bootstrap ?? false,
    shell: definition.shell,
    params: definition.params,
    load: definition.load,
    parseParams: (search) =>
      decoder.decode({ type: schema, source: search, parser: parseQueryString }),
  };
}
