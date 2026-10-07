import { z } from "zod";
import type { MobilePageContext } from "@blog/mobile-shared";
import { definePage } from "@fluvient-loom/page-contract";

/** URL 参数：id 必须是安全正整数；缺失/非法由页面按 invalid 态消费。 */
const params = z.object({
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export const mobileAdminArticlePreviewPage = definePage({
  id: "mobile-admin-article-preview",
  platform: "mobile",
  outputPath: "mobile/pages/admin-article-preview-content/index.html",
  title: "手机预览 - 管理台",
  aliases: [
    "/admin/articles/preview/mobile.html",
    "/admin/articles/preview/mobile/content.html",
  ],
  bootstrap: true,
  params,
  load: () =>
    import("./page.tsx").then(
      (m) => (context: MobilePageContext) =>
        m.createMobileAdminPreviewPage(context),
    ),
});
