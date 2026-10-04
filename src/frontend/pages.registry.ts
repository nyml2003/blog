import { desktopArticlesPage } from "@blog/page-desktop-articles";
import { desktopAdminArticlePreviewPage } from "@blog/page-desktop-admin-preview";
import { desktopAdminHomePage } from "@blog/page-desktop-admin-home";
import { desktopAdminArticleEditPage, desktopAdminArticleNewPage } from "@blog/page-desktop-editor";
import { desktopAdminEditorGuidePage } from "@blog/page-desktop-editor-guide";
import { desktopAdminLoginPage } from "@blog/page-desktop-login";
import { desktopAdminArticleTypesPage, desktopAdminTermsPage } from "@blog/page-desktop-taxonomy";
import { desktopDetailPage } from "@blog/page-desktop-detail";
import { desktopHomePage } from "@blog/page-desktop-home";
import { mobileAdminArticlePreviewPage } from "@blog/page-mobile-admin-preview";
import { mobileArticleDetailPage } from "@blog/page-mobile-detail";
import { mobileArticlesPage, mobileArticleListPage } from "@blog/page-mobile-articles";
import { mobileHomePage } from "@blog/page-mobile-home";
import { mobileSettingsPage } from "@blog/page-mobile-settings";
import type {
  PagePlatform,
  PageRegistration,
  PageRoute,
} from "@fluvient-loom/page-build-kit";
import { pageRoutes as flattenPageRoutes } from "@fluvient-loom/page-build-kit";

export type { PagePlatform, PageRegistration, PageRoute };

// 显式注册（接口而非模板）：一页 = 一个页面包声明 + 这里两行（import + 数组项）。
// 页面包经 definePage 产出完整 PageRegistration，类型漂移在编译期暴露。

export const pageRegistry: readonly PageRegistration[] = [
  desktopHomePage,
  desktopArticlesPage,
  desktopDetailPage,
desktopAdminLoginPage,
desktopAdminHomePage,
desktopAdminArticleNewPage,
desktopAdminArticleEditPage,
desktopAdminEditorGuidePage,
desktopAdminArticleTypesPage,
desktopAdminTermsPage,
desktopAdminArticlePreviewPage,
mobileHomePage,
mobileArticlesPage,
mobileArticleListPage,
mobileArticleDetailPage,
mobileSettingsPage,
mobileAdminArticlePreviewPage,
] as const satisfies readonly PageRegistration[];

/** 宿主便捷包装：默认作用于本注册表（包内 pageRoutes 为显式纯函数）。 */
export function pageRoutes(
  registrations: readonly PageRegistration[] = pageRegistry,
): readonly PageRoute[] {
  return flattenPageRoutes(registrations);
}
