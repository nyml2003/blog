import { definePage } from "@fluvient-loom/page-kit";

// 页面包的声明出口（"."）：纯元数据，被宿主注册表在构建期 CLI/测试中 import，
// 不得携带组件实现或样式副作用——组件工厂在 "./page" 子路径。
export const desktopDetailPage = definePage({
  id: "desktop-public-detail",
  platform: "desktop",
  aliases: ["/articles/detail.html"],
  title: "文章详情 - 技术知识库",
});
