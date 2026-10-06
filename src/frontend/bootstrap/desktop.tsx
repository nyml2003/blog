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
import {
  desktopAdminPageViews,
  desktopPageLoaders,
  pageRegistry,
} from "../pages.registry";
import "@blog/desktop-shared/styles.css";
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

function mountStartupFailure(error: unknown): void {
  mountDesktopApplication({
    context: { ok: false, error },
    createPage: () => () => null,
  });
}

// ── 挂载（id → 懒装载来自注册表，入口不枚举页面）─────────────────────
const pageId = document.documentElement.dataset.pageId ?? "";
const registration = pageRegistry.find((page) => page.id === pageId);
const load = desktopPageLoaders().get(pageId);

if (registration?.layout === "admin") {
  const context = createBrowserDesktopContext();
  if (!context.ok) {
    mountDesktopApplication({
      context,
      createPage: () => () => null,
    });
  } else {
    const value = context.value;
    // 管理端壳按需加载：公开页不为管理端布局付出体积。
    void import("@blog/desktop-shared/admin")
      .then(({ createDesktopAdminApp }) => {
        mountDesktopApplication({
          context,
          createPage: () =>
            createDesktopAdminApp({
              context: value,
              initialPageId: pageId,
              views: desktopAdminPageViews(),
            }),
        });
      })
      .catch((error: unknown) => mountStartupFailure(error));
  }
} else if (load === undefined) {
  console.error(`Unknown desktop page id: "${pageId}"`);
} else {
  void load()
    .then((factory) => {
      mountDesktopApplication({
        context: createBrowserDesktopContext(),
        createPage: factory,
      });
    })
    .catch((error: unknown) => mountStartupFailure(error));
}
