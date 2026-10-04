import { definePage } from "@fluvient-loom/page-kit";

// 页面包的声明出口（"."）：完整登记契约（我是谁 + 我怎么构建），
// 纯数据、node 安全——注册表在构建期 CLI/测试中被 import，
// 不得携带组件实现或样式副作用（组件工厂在 "./page" 子路径）。
export const desktopDetailPage = definePage({
  id: "desktop-public-detail",
  platform: "desktop",
  outputPath: "desktop/pages/public-detail/index.html",
  entry: "/bootstrap/desktop/detail.tsx",
  title: "文章详情 - 技术知识库",
  aliases: ["/articles/detail.html"],
});
