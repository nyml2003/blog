import { queryClient, executeQuery } from "./core";
import {
  configureSiteRoutes,
  siteRouteRequired,
  withQuery,
} from "../../common/client/site-routes";
import type { AdminSessionRoutePaths } from "../../common/client/admin-session-browser";

/**
 * 页面路由清单引导（SPEC-SITE-ROUTES-001）。
 *
 * `definePage` 在渲染前调用 `bootstrapSiteRoutes`；清单值只来自
 * `/api/public/site-routes`，页面与组件经由下方语义化取用函数获得路径，
 * 不持有路由 id 或 URL 字面量。失败允许重试（pending 会被清除）。
 */

let bootstrapped = false;
let pending: Promise<void> | undefined;

const load = async (): Promise<void> => {
  const result = await executeQuery(() => queryClient.siteRoutes.get());
  if (!result.ok) {
    pending = undefined;
    throw result.error;
  }
  configureSiteRoutes({ ...result.value.routes });
  bootstrapped = true;
};

export const bootstrapSiteRoutes = (): Promise<void> => {
  if (bootstrapped) return Promise.resolve();
  pending ??= load();
  return pending;
};

export const siteRoutesReady = (): boolean => bootstrapped;

/** 管理端会话跳转路径（登录页与 401 重定向共用）。 */
export const adminSessionPaths = (): AdminSessionRoutePaths => ({
  loginPath: siteRouteRequired("desktop-admin-login"),
  homePath: siteRouteRequired("desktop-admin-home"),
});

// ---- 语义化导航取用：页面只表达意图，路径值一律来自后端清单 ----

export const publicHomeHref = (): string =>
  siteRouteRequired("desktop-public-home");
export const publicArchiveHref = (): string =>
  siteRouteRequired("desktop-public-articles");
export const publicArticleDetailHref = (id: number | string): string =>
  withQuery(siteRouteRequired("desktop-public-detail"), { id });

export const adminHomeHref = (): string =>
  siteRouteRequired("desktop-admin-home");
export const adminLoginHref = (): string =>
  siteRouteRequired("desktop-admin-login");
export const adminArticleNewHref = (): string =>
  siteRouteRequired("desktop-admin-article-new");
export const adminArticleEditHref = (id: number | string): string =>
  withQuery(siteRouteRequired("desktop-admin-article-edit"), { id });
export const adminWorkspaceHref = (): string =>
  siteRouteRequired("desktop-admin-article-types");
export const adminEditorGuideHref = (): string =>
  siteRouteRequired("desktop-admin-editor-guide");
export const adminArticlePreviewMobileHref = (id: number | string): string =>
  withQuery(siteRouteRequired("mobile-admin-article-preview"), { id });

export const mobileHomeHref = (): string => siteRouteRequired("mobile-home");
export const mobileArticlesHref = (): string =>
  siteRouteRequired("mobile-articles");
export const mobileArticleListHref = (): string =>
  siteRouteRequired("mobile-article-list");
export const mobileArticleDetailHref = (id: number | string): string =>
  withQuery(siteRouteRequired("mobile-article-detail"), { id });
export const mobileSettingsHref = (): string =>
  siteRouteRequired("mobile-settings");

export { withQuery };
