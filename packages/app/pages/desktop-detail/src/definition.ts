import { z } from "zod";
import type { DesktopPageContext } from "@blog/desktop-shared";
import { definePage } from "@fluvient-loom/page-kit";

/**
 * URL 参数：id 必须是安全正整数（缺失/非法 → 页面按 invalid 态消费）；
 * q 是搜索高亮词，trim 后使用，缺失为空串。
 */
const params = z.object({
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  q: z.string().trim().catch(""),
});

// 页面包的声明出口（"."）：完整登记契约（我是谁 + 怎么构建 + 怎么装载），
// 纯数据、node 安全——注册表在构建期 CLI/测试中被 import；load 里只允许
// import() 表达式，组件实现与样式副作用全部留在 "./page" 子路径。
export const desktopDetailPage = definePage({
  id: "desktop-public-detail",
  platform: "desktop",
  outputPath: "desktop/pages/public-detail/index.html",
  title: "文章详情 - 技术知识库",
  aliases: ["/articles/detail.html"],
  params,
  load: () =>
    import("./page.tsx").then(
      (m) => (context: DesktopPageContext) => m.createDesktopDetailPage(context),
    ),
});
