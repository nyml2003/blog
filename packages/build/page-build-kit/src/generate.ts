import type { PageRegistration } from "./types.ts";

export const siteRoutesManifestFilename = "site-routes.json";

// canonical alias 固定取 aliases[0]：清单值不再人工挑选，
// 需要更换 canonical 时调整登记中 alias 的声明顺序。
// 输出与宿主 git 跟踪的清单逐字节比对（守卫在宿主测试内）。
export function generateSiteRoutesManifest(
  registrations: readonly PageRegistration[],
): string {
  const routes: Record<string, string> = {};
  for (const page of registrations) {
    routes[page.id] = page.aliases[0];
  }
  return `${JSON.stringify({ version: 1, routes }, undefined, 2)}\n`;
}
