import type { DesktopPageContext } from "@blog/desktop-shared";
import { definePage } from "@fluvient-loom/page-kit";

export const desktopAdminHomePage = definePage({
  id: "desktop-admin-home",
  platform: "desktop",
  outputPath: "desktop/pages/admin-home/index.html",
  title: "文章管理 - 管理台",
  aliases: ["/admin/index.html", "/admin", "/admin/"],
  layout: "admin",
  nav: { label: "文章", order: 1 },
  load: () =>
    import("./page.tsx").then(
      (m) => (context: DesktopPageContext) =>
        m.createDesktopAdminHomePage(context),
    ),
});
