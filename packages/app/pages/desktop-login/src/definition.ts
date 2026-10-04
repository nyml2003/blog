import { definePage } from "@fluvient-loom/page-kit";
export const desktopAdminLoginPage = definePage({
  id: "desktop-admin-login",
  platform: "desktop",
  outputPath: "desktop/pages/admin-login/index.html",
  entry: "/bootstrap/desktop/login.tsx",
  title: "登录 - 管理台",
  aliases: ["/admin/login.html"],
});
