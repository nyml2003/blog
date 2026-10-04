import { z } from "zod";
import type { DesktopPageContext } from "@blog/desktop-shared";
import { definePage } from "@fluvient-loom/page-kit";

/**
 * URL 参数：type_id 是筛选 id 的字符串形态（非空数字串且 > 0），缺失/非法回退 "all"；
 * q 是搜索词，trim 后使用，缺失为空串。
 */
const params = z.object({
  type_id: z
    .string()
    .regex(/^\d+$/)
    .refine((value) => Number(value) > 0)
    .catch("all"),
  q: z.string().trim().catch(""),
});

export const desktopArticlesPage = definePage({
  id: "desktop-public-articles",
  platform: "desktop",
  outputPath: "desktop/pages/public-articles/index.html",
  title: "文章档案 - 技术知识库",
  aliases: ["/articles/index.html"],
  params,
  load: () =>
    import("./page.tsx").then(
      (m) => (context: DesktopPageContext) =>
        m.createDesktopArticlesPage(context),
    ),
});
