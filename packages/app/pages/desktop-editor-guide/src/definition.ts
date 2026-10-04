import { definePage } from "@fluvient-loom/page-kit";
export const desktopAdminEditorGuidePage = definePage({
  id: "desktop-admin-editor-guide",
  platform: "desktop",
  outputPath: "desktop/pages/admin-editor-guide/index.html",
  entry: "/bootstrap/desktop/editor-guide.tsx",
  title: "编辑器使用指南 - 管理台",
  aliases: ["/admin/editor-guide/index.html"],
});
