import { type Result } from "@fluvient/core";
import {
  createWebDesktopPorts,
  mountDesktopApplication,
} from "@fluvient-loom/page-kit/desktop";
import { type Component } from "solid-js";
import {
  createDesktopApi,
  type DesktopApiFailure,
  type SiteRoutes,
  siteRoutesSchema,
} from "../../desktop/foundation/api";
import type { DesktopPageContext } from "../../desktop/foundation/context";
// 路由清单在构建期由 pages.registry 投影生成（与后端 /api/public/site-routes 同源，
// 有重新生成比对守卫），直接内嵌进包，首绘不再等待网络请求；端点保留给外部消费。
import siteRoutesManifest from "../../site-routes.json";

// bootstrap 是 page-kit 的唯一调用点：端口装配在包内完成，
// 这里只组合应用声明（api 工厂、内嵌清单）并挂载页面。
function embeddedSiteRoutes(): Result<SiteRoutes, DesktopApiFailure> {
  const parsed = siteRoutesSchema.safeParse(siteRoutesManifest);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: "protocol",
        message: "内嵌路由清单不符合协议",
        code: undefined,
        status: undefined,
        issues: parsed.error.issues.map(
          (issue) => issue.path.join(".") || issue.message,
        ),
      },
    };
  }
  return { ok: true, value: parsed.data };
}

export function createBrowserDesktopContext(): Result<
  DesktopPageContext,
  DesktopApiFailure
> {
  const ports = createWebDesktopPorts();
  const routes = embeddedSiteRoutes();
  if (!routes.ok) return { ok: false, error: routes.error };
  return {
    ok: true,
    value: {
      api: createDesktopApi(ports.network),
      routes: routes.value,
      navigation: ports.navigation,
    },
  };
}

export function mountDesktopPage(
  createPage: (context: DesktopPageContext) => Component,
): void {
  mountDesktopApplication({
    context: createBrowserDesktopContext(),
    createPage,
  });
}
