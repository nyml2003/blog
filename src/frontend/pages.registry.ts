import { desktopArticlesPage } from "@blog/page-desktop-articles";
import { desktopAdminArticlePreviewPage } from "@blog/page-desktop-admin-preview";
import { desktopAdminHomePage } from "@blog/page-desktop-admin-home";
import {
  desktopAdminArticleEditPage,
  desktopAdminArticleNewPage,
} from "@blog/page-desktop-editor";
import { desktopAdminEditorGuidePage } from "@blog/page-desktop-editor-guide";
import { desktopAdminLoginPage } from "@blog/page-desktop-login";
import {
  desktopAdminArticleTypesPage,
  desktopAdminTermsPage,
} from "@blog/page-desktop-taxonomy";
import { desktopDetailPage } from "@blog/page-desktop-detail";
import { desktopHomePage } from "@blog/page-desktop-home";
import { mobileAdminArticlePreviewPage } from "@blog/page-mobile-admin-preview";
import { mobileArticleDetailPage } from "@blog/page-mobile-detail";
import {
  mobileArticlesPage,
  mobileArticleListPage,
} from "@blog/page-mobile-articles";
import { mobileHomePage } from "@blog/page-mobile-home";
import { mobileSettingsPage } from "@blog/page-mobile-settings";
import type { DesktopPageContext } from "@blog/desktop-shared";
import type { MobilePageContext } from "@blog/mobile-shared";
import type {
  PageFactory,
  PagePlatform,
  PageRegistration,
  PageRoute,
} from "@fluvient-loom/page-build-kit";
import { pageRoutes as flattenPageRoutes } from "@fluvient-loom/page-build-kit";

export type { PagePlatform, PageRegistration, PageRoute };

// 显式注册（接口而非模板）：一页 = 一个页面包声明 + 这里两行（import + 数组项）。
// 页面包经 definePage 产出完整登记（元数据 + 运行时懒装载 load）；本数组是
// 「有哪些页面」的唯一枚举——构建投影与入口装配全部由此派生，不再有第二份清单。
// 保持 as const（不写宽化注解）让每个登记保留平台字面量与上下文类型。

export const pageRegistry = [
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

/** 运行时装配视图：id → 懒装载（bootstrap entry 的唯一页面映射来源）。 */
export function desktopPageLoaders(): ReadonlyMap<
  string,
  () => Promise<PageFactory<DesktopPageContext>>
> {
  const loaders = new Map<
    string,
    () => Promise<PageFactory<DesktopPageContext>>
  >();
  for (const page of pageRegistry) {
    if (page.platform === "desktop") loaders.set(page.id, page.load);
  }
  return loaders;
}

/** 同 desktopPageLoaders，供 mobile 入口使用。 */
export function mobilePageLoaders(): ReadonlyMap<
  string,
  () => Promise<PageFactory<MobilePageContext>>
> {
  const loaders = new Map<
    string,
    () => Promise<PageFactory<MobilePageContext>>
  >();
  for (const page of pageRegistry) {
    if (page.platform === "mobile") loaders.set(page.id, page.load);
  }
  return loaders;
}

/** 宿主便捷包装：默认作用于本注册表（包内 pageRoutes 为显式纯函数）。 */
export function pageRoutes(
  registrations: readonly PageRegistration[] = pageRegistry,
): readonly PageRoute[] {
  return flattenPageRoutes(registrations);
}
