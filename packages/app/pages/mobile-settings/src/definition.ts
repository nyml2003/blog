import type { MobilePageContext } from "@blog/mobile-shared";
import { definePage } from "@fluvient-loom/page-contract";

export const mobileSettingsPage = definePage({
  id: "mobile-settings",
  platform: "mobile",
  outputPath: "mobile/pages/settings/index.html",
  title: "设置 - 技术知识库",
  aliases: ["/m/settings/index.html"],
  bootstrap: true,
  load: () =>
    import("./page.tsx").then(
      (m) => (context: MobilePageContext) => m.createMobileSettingsPage(context),
    ),
});
