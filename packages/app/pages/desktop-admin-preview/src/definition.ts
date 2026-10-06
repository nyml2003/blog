import { z } from "zod";
import type { DesktopPageContext } from "@blog/desktop-shared";
import { definePage } from "@fluvient-loom/page-kit";

/** URL 参数：id 必须是安全正整数；缺失/非法由页面按 invalid 态消费。 */
const params = z.object({
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export const desktopAdminArticlePreviewPage = definePage({
  id: "desktop-admin-article-preview",
  platform: "desktop",
  outputPath: "desktop/pages/admin-article-preview-desktop/index.html",
  title: "桌面预览 - 管理台",
  aliases: ["/admin/articles/preview/desktop.html"],
  layout: "admin",
  params,
  load: () =>
    import("./page.tsx").then(
      (m) => (context: DesktopPageContext) =>
        m.createDesktopAdminPreviewPage(context),
    ),
});
