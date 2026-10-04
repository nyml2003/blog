import { type Result } from "@fluvient/core";
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
import { desktopPageLoaders } from "../pages.registry";
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

// ── 挂载（id → 懒装载来自注册表，入口不枚举页面）─────────────────────
const pageId = document.documentElement.dataset.pageId ?? "";
const load = desktopPageLoaders().get(pageId);

if (load === undefined) {
  console.error(`Unknown desktop page id: "${pageId}"`);
} else {
  void load().then((factory) => {
    mountDesktopApplication({
      context: createBrowserDesktopContext(),
      createPage: factory,
    });
  });
}
