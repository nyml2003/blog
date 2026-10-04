import type { PagePlatform, PageRegistration } from "./types.ts";

// D11 归一化形态：校验器与生成器只消费这一扁平实现列表，登记 schema 是
// 其上游适配层（当前一页一实现；将来多实现时只改适配层）。
// variant 是开放 key，供服务端分流策略寻址；当前单一实现按约定取平台名。
// platform 由 outputPath 首段派生——平台世界是目录事实，不是登记声明。
export interface PageImplementation {
  readonly pageId: string;
  readonly variant: string;
  readonly platform: PagePlatform;
  readonly outputPath: string;
  readonly entry: string;
}

const PLATFORMS = ["desktop", "mobile"] as const;

export function platformFromOutputPath(
  outputPath: string,
): PagePlatform | undefined {
  const firstSegment = outputPath.split("/")[0];
  return (PLATFORMS as readonly string[]).includes(firstSegment)
    ? (firstSegment as PagePlatform)
    : undefined;
}

export function normalizePageRegistry(
  registrations: readonly PageRegistration[],
): readonly PageImplementation[] {
  return registrations.map((page) => {
    const platform = platformFromOutputPath(page.outputPath) ?? page.platform;
    return {
      pageId: page.id,
      variant: platform,
      platform,
      outputPath: page.outputPath,
      entry: page.entry,
    };
  });
}
