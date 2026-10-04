import type { AppShellSpec } from "@fluvient-loom/app-shell";

// 页面登记契约：宿主（或未来的页面包）以这一形状声明"页面是什么"。
// 唯一事实源在各宿主的注册表/页面包聚合产物；本包只消费与校验。
export type PagePlatform = "desktop" | "mobile";

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

/** 把注册表展平为 alias → outputPath 的有序投影。 */
export function pageRoutes(
  registrations: readonly PageRegistration[],
): readonly PageRoute[] {
  return registrations.flatMap((page) =>
    page.aliases.map((alias) => ({ alias, outputPath: page.outputPath })),
  );
}
