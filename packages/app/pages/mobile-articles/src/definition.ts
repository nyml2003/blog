import { z } from "zod";
import type { MobilePageContext } from "@blog/mobile-shared";
import { definePage } from "@fluvient-loom/page-contract";

/**
 * URL 参数：category_id 可选（缺失/非法按"无过滤"消费，回退首个根分类）；
 * q 是搜索词，trim 后使用，缺失为空串。列表/检索两个登记共用同一 schema。
 */
const params = z.object({
  category_id: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional()
    .catch(undefined),
  q: z.string().trim().catch(""),
});

export const mobileArticlesPage = definePage({
  id: "mobile-articles",
  platform: "mobile",
  outputPath: "mobile/pages/articles/index.html",
  title: "文章库 - 技术知识库",
  aliases: ["/m/articles/index.html"],
  bootstrap: true,
  params,
  load: () =>
    import("./page.tsx").then(
      (m) => (context: MobilePageContext) =>
        m.createMobileArticlesPage(context, "全部文章"),
    ),
});

export const mobileArticleListPage = definePage({
  id: "mobile-article-list",
  platform: "mobile",
  outputPath: "mobile/pages/article-list/index.html",
  title: "文章检索 - 技术知识库",
  aliases: ["/m/articles/list.html"],
  bootstrap: true,
  params,
  load: () =>
    import("./page.tsx").then(
      (m) => (context: MobilePageContext) =>
        m.createMobileArticlesPage(context, "分类浏览"),
    ),
});
