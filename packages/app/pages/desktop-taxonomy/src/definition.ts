import { definePage } from "@fluvient-loom/page-kit";
export const desktopAdminArticleTypesPage = definePage({
  id: "desktop-admin-article-types",
  platform: "desktop",
  outputPath: "desktop/pages/admin-article-types/index.html",
  title: "分类与发布工作台 - 管理台",
  aliases: ["/admin/content/workspace.html", "/admin/article-types/index.html"],
});
export const desktopAdminTermsPage = definePage({
  id: "desktop-admin-terms",
  platform: "desktop",
  outputPath: "desktop/pages/admin-terms/index.html",
  title: "分类与发布工作台 - 管理台",
  aliases: ["/admin/terms/index.html"],
});
