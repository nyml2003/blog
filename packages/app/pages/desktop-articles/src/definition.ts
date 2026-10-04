import { definePage } from "@fluvient-loom/page-kit";

export const desktopArticlesPage = definePage({
  id: "desktop-public-articles",
  platform: "desktop",
  outputPath: "desktop/pages/public-articles/index.html",
  title: "文章档案 - 技术知识库",
  aliases: ["/articles/index.html"],
});
