import type { AppShellSpec } from "@fluvient-loom/app-shell";
import type { PageRegistration } from "../src/types.ts";

export const alwaysExists = (): boolean => true;
export const neverExists = (): boolean => false;

export const desktopShell: AppShellSpec = {
  id: "desktop-shell-test",
  platform: "desktop",
  loadingLabel: "加载中",
  shimmer: false,
  regions: [
    { id: "content", role: "main", blockSize: "100px", placeholders: [] },
  ],
};

export const fixtureRegistrations: readonly PageRegistration[] = [
  {
    id: "desktop-home",
    platform: "desktop",
    outputPath: "desktop/pages/home/index.html",
    entry: "/bootstrap/desktop/home.tsx",
    title: "首页",
    description: undefined,
    aliases: ["/"],
    bootstrap: false,
  },
  {
    id: "desktop-archive",
    platform: "desktop",
    outputPath: "desktop/pages/archive/index.html",
    entry: "/bootstrap/desktop/archive.tsx",
    title: "档案",
    description: undefined,
    aliases: ["/archive/index.html"],
    bootstrap: false,
  },
  {
    id: "mobile-home",
    platform: "mobile",
    outputPath: "mobile/pages/home/index.html",
    entry: "/bootstrap/mobile/home.tsx",
    title: "首页",
    description: undefined,
    aliases: ["/m/", "/m"],
    bootstrap: true,
  },
];

export function withPage(
  pageId: string,
  patch: Partial<PageRegistration>,
): readonly PageRegistration[] {
  return fixtureRegistrations.map((page) =>
    page.id === pageId ? { ...page, ...patch } : page,
  );
}
