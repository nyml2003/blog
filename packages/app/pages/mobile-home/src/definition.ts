import type { MobilePageContext } from "@blog/mobile-shared";
import { definePage } from "@fluvient-loom/page-contract";

export const mobileHomePage = definePage({
  id: "mobile-home",
  platform: "mobile",
  outputPath: "mobile/pages/home/index.html",
  title: "首页 - 技术知识库",
  aliases: ["/m/", "/m"],
  bootstrap: true,
  load: () =>
    import("./page.tsx").then(
      (m) => (context: MobilePageContext) => m.createMobileHomePage(context),
    ),
});
