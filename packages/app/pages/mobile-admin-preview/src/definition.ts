import { definePage } from "@fluvient-loom/page-kit";

export const mobileAdminArticlePreviewPage = definePage({
  id: "mobile-admin-article-preview",
  platform: "mobile",
  outputPath: "mobile/pages/admin-article-preview-content/index.html",
  title: "手机预览 - 管理台",
  aliases: [
    "/admin/articles/preview/mobile.html",
    "/admin/articles/preview/mobile/content.html",
  ],
  bootstrap: true,
});
