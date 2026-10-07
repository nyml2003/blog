import type { DesktopPageContext } from "@blog/desktop-shared";
import { definePage } from "@fluvient-loom/page-contract";

export const desktopHomePage = definePage({
  id: "desktop-public-home",
  platform: "desktop",
  outputPath: "desktop/pages/public-home/index.html",
  title: "首页 - 技术知识库",
  aliases: ["/"],
  load: () =>
    import("./page.tsx").then(
      (m) => (context: DesktopPageContext) => m.createDesktopHomePage(context),
    ),
});
