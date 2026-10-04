import { definePage } from "@fluvient-loom/page-kit";

export const mobileHomePage = definePage({
  id: "mobile-home",
  platform: "mobile",
  outputPath: "mobile/pages/home/index.html",
  entry: "/bootstrap/mobile/home.tsx",
  title: "首页 - 技术知识库",
  aliases: ["/m/", "/m"],
  bootstrap: true,
});
