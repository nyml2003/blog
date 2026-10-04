import type { DesktopPageContext } from "@blog/desktop-shared";
import { definePage } from "@fluvient-loom/page-kit";

export const desktopAdminEditorGuidePage = definePage({
  id: "desktop-admin-editor-guide",
  platform: "desktop",
  outputPath: "desktop/pages/admin-editor-guide/index.html",
  title: "编辑器使用指南 - 管理台",
  aliases: ["/admin/editor-guide/index.html"],
  load: () =>
    import("./page.tsx").then(
      (m) => (context: DesktopPageContext) =>
        m.createDesktopEditorGuidePage(context),
    ),
});
