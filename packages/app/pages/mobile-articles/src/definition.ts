import { definePage } from "@fluvient-loom/page-kit";

export const mobileArticlesPage = definePage({
  id: "mobile-articles",
  platform: "mobile",
  outputPath: "mobile/pages/articles/index.html",
  entry: "/bootstrap/mobile/articles.tsx",
  title: "文章库 - 技术知识库",
  aliases: ["/m/articles/index.html"],
  bootstrap: true,
});

export const mobileArticleListPage = definePage({
  id: "mobile-article-list",
  platform: "mobile",
  outputPath: "mobile/pages/article-list/index.html",
  entry: "/bootstrap/mobile/article-list.tsx",
  title: "文章检索 - 技术知识库",
  aliases: ["/m/articles/list.html"],
  bootstrap: true,
});
