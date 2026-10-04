import { definePage } from "@fluvient-loom/page-kit";

export const mobileSettingsPage = definePage({
  id: "mobile-settings",
  platform: "mobile",
  outputPath: "mobile/pages/settings/index.html",
  entry: "/bootstrap/mobile/settings-page.tsx",
  title: "设置 - 技术知识库",
  aliases: ["/m/settings/index.html"],
  bootstrap: true,
});
