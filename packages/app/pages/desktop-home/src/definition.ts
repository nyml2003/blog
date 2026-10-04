import { definePage } from "@fluvient-loom/page-kit";

export const desktopHomePage = definePage({
  id: "desktop-public-home",
  platform: "desktop",
  outputPath: "desktop/pages/public-home/index.html",
  title: "首页 - 技术知识库",
  aliases: ["/"],
});
