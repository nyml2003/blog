import { type Result } from "@fluvient/core";
import { type Component } from "solid-js";
import {
  createDesktopApi,
  type DesktopApiFailure,
  siteRoutesSchema,
} from "@blog/desktop-api";
import {
  createWebDesktopPorts,
  mountDesktopApplication,
} from "@fluvient-loom/page-kit/desktop";
import type { DesktopPageContext } from "@blog/desktop-shared";
import "../styles/desktop.css";
import siteRoutesManifest from "../site-routes.json";

// ── 环境装配（page-kit 唯一调用点）────────────────────────────────────
function createBrowserDesktopContext(): Result<
  DesktopPageContext,
  DesktopApiFailure
> {
  const ports = createWebDesktopPorts();
  const parsed = siteRoutesSchema.safeParse(siteRoutesManifest);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: "protocol",
        message: "内嵌路由清单不符合协议",
        code: undefined,
        status: undefined,
        issues: parsed.error.issues.map((i) => i.path.join(".") || i.message),
      },
    };
  }
  return {
    ok: true,
    value: {
      api: createDesktopApi(ports.network),
      routes: parsed.data,
      navigation: ports.navigation,
    },
  };
}

// ── 页面路由（id → 工厂，dynamic import 由 Vite code-split）──────────
type PageFactory = (context: DesktopPageContext) => Component;

const pages: Record<string, () => Promise<PageFactory>> = {
  "desktop-public-home": async () =>
    (await import("@blog/page-desktop-home/page")).createDesktopHomePage,
  "desktop-public-articles": async () =>
    (await import("@blog/page-desktop-articles/page"))
      .createDesktopArticlesPage,
  "desktop-public-detail": async () =>
    (await import("@blog/page-desktop-detail/page")).createDesktopDetailPage,
  "desktop-admin-login": async () =>
    (await import("@blog/page-desktop-login/page")).createDesktopLoginPage,
  "desktop-admin-home": async () =>
    (await import("@blog/page-desktop-admin-home/page"))
      .createDesktopAdminHomePage,
  "desktop-admin-article-new": async () => {
    const m = await import("@blog/page-desktop-editor/page");
    return (ctx) => m.createDesktopEditorPage(ctx, true);
  },
  "desktop-admin-article-edit": async () => {
    const m = await import("@blog/page-desktop-editor/page");
    return (ctx) => m.createDesktopEditorPage(ctx, false);
  },
  "desktop-admin-editor-guide": async () =>
    (await import("@blog/page-desktop-editor-guide/page"))
      .createDesktopEditorGuidePage,
  "desktop-admin-article-types": async () =>
    (await import("@blog/page-desktop-taxonomy/page"))
      .createDesktopTaxonomyPage,
  "desktop-admin-terms": async () =>
    (await import("@blog/page-desktop-taxonomy/page"))
      .createDesktopTaxonomyPage,
  "desktop-admin-article-preview": async () =>
    (await import("@blog/page-desktop-admin-preview/page"))
      .createDesktopAdminPreviewPage,
};

// ── 挂载 ────────────────────────────────────────────────────────────
const pageId = document.documentElement.dataset.pageId ?? "";
const resolve = pages[pageId];

if (resolve) {
  void resolve().then((factory) => {
    mountDesktopApplication({
      context: createBrowserDesktopContext(),
      createPage: factory,
    });
  });
} else {
  console.error(`Unknown desktop page id: "${pageId}"`);
}
