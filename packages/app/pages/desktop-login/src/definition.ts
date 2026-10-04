import type { DesktopPageContext } from "@blog/desktop-shared";
import { definePage } from "@fluvient-loom/page-kit";

export const desktopAdminLoginPage = definePage({
  id: "desktop-admin-login",
  platform: "desktop",
  outputPath: "desktop/pages/admin-login/index.html",
  title: "登录 - 管理台",
  aliases: ["/admin/login.html"],
  load: () =>
    import("./page.tsx").then(
      (m) => (context: DesktopPageContext) => m.createDesktopLoginPage(context),
    ),
});
