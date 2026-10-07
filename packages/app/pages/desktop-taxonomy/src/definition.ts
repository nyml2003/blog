import type { DesktopPageContext } from "@blog/desktop-shared";
import { definePage } from "@fluvient-loom/page-contract";

export const desktopAdminArticleTypesPage = definePage({
  id: "desktop-admin-article-types",
  platform: "desktop",
  outputPath: "desktop/pages/admin-article-types/index.html",
  title: "分类与发布工作台 - 管理台",
  aliases: ["/admin/content/workspace.html", "/admin/article-types/index.html"],
  layout: "admin",
  nav: { label: "分类工作台", order: 2 },
  load: () =>
    import("./page.tsx").then(
      (m) => (context: DesktopPageContext) =>
        m.createDesktopTaxonomyPage(context),
    ),
});

export const desktopAdminTermsPage = definePage({
  id: "desktop-admin-terms",
  platform: "desktop",
  outputPath: "desktop/pages/admin-terms/index.html",
  title: "分类与发布工作台 - 管理台",
  aliases: ["/admin/terms/index.html"],
  layout: "admin",
  load: () =>
    import("./page.tsx").then(
      (m) => (context: DesktopPageContext) =>
        m.createDesktopTaxonomyPage(context),
    ),
});
