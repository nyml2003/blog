import { definePage } from "@fluvient-loom/page-kit";
export const desktopAdminArticleNewPage = definePage({
  id: "desktop-admin-article-new",
  platform: "desktop",
  outputPath: "desktop/pages/admin-article-new/index.html",
  entry: "/bootstrap/desktop/editor-new.tsx",
  title: "新建文章 - 管理台",
  aliases: ["/admin/articles/new.html"],
});
export const desktopAdminArticleEditPage = definePage({
  id: "desktop-admin-article-edit",
  platform: "desktop",
  outputPath: "desktop/pages/admin-article-edit/index.html",
  entry: "/bootstrap/desktop/editor-edit.tsx",
  title: "编辑文章 - 管理台",
  aliases: ["/admin/articles/edit.html"],
});
