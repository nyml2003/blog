import { definePage } from "@fluvient-loom/page-kit";
export const desktopAdminHomePage = definePage({
  id: "desktop-admin-home",
  platform: "desktop",
  outputPath: "desktop/pages/admin-home/index.html",
  entry: "/bootstrap/desktop/admin-home.tsx",
  title: "文章管理 - 管理台",
  aliases: ["/admin/index.html", "/admin", "/admin/"],
});
