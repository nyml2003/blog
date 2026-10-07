import { z } from "zod";
import type { DesktopPageContext } from "@blog/desktop-shared";
import { definePage } from "@fluvient-loom/page-contract";

/**
 * URL 参数：id 可选——缺失或非法都按"新建文章"处理（页面用 `?? 0` 作哨兵）；
 * 合法时必须是安全正整数。新建/编辑两个登记共用同一 schema。
 */
const params = z.object({
  id: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional()
    .catch(undefined),
});

export const desktopAdminArticleNewPage = definePage({
  id: "desktop-admin-article-new",
  platform: "desktop",
  outputPath: "desktop/pages/admin-article-new/index.html",
  title: "新建文章 - 管理台",
  aliases: ["/admin/articles/new.html"],
  layout: "admin",
  params,
  load: () =>
    import("./page.tsx").then(
      (m) => (context: DesktopPageContext) =>
        m.createDesktopEditorPage(context, true),
    ),
});

export const desktopAdminArticleEditPage = definePage({
  id: "desktop-admin-article-edit",
  platform: "desktop",
  outputPath: "desktop/pages/admin-article-edit/index.html",
  title: "编辑文章 - 管理台",
  aliases: ["/admin/articles/edit.html"],
  layout: "admin",
  params,
  load: () =>
    import("./page.tsx").then(
      (m) => (context: DesktopPageContext) =>
        m.createDesktopEditorPage(context, false),
    ),
});
