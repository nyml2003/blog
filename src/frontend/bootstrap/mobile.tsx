import { type Result } from "@fluvient/core";
import {
  createMobileApi,
  type MobileApiFailure,
  siteRoutesSchema,
} from "@blog/mobile-api";
import type { MobilePageContext } from "@blog/mobile-shared";
import {
  DEFAULT_SERVED_PATH,
  registerMobilePrefetch,
} from "@fluvient-loom/mobile-prefetch";
import {
  createWebMobilePorts,
  mountMobileApplication,
  removeMobileAppShell,
} from "@fluvient-loom/page-kit/mobile";
import {
  isMobileHomePath,
  resolveCategoryShelfUrls,
} from "./mobile-prefetch-plan";
import { mobilePageLoaders } from "../pages.registry";
import "@blog/mobile-h5-solid-atoms/styles.css";
import "@fluvient-loom/app-shell/styles.css";
import "@blog/mobile-shared/styles.css";
import siteRoutesManifest from "../site-routes.json";

// ── 环境装配（page-kit 唯一调用点）────────────────────────────────────
function createBrowserMobileContext(): Result<
  MobilePageContext,
  MobileApiFailure
> {
  const ports = createWebMobilePorts();
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
      ...ports,
      api: createMobileApi(ports.network),
      routes: parsed.data,
    },
  };
}

// ── 挂载（id → 懒装载来自注册表，入口不枚举页面）─────────────────────
const pageId = document.documentElement.dataset.pageId ?? "";
const load = mobilePageLoaders().get(pageId);

if (load === undefined) {
  console.error(`Unknown mobile page id: "${pageId}"`);
} else {
  void load().then((factory) => {
    mountMobileApplication({
      context: createBrowserMobileContext(),
      createPage: factory,
      onContextFailure: removeMobileAppShell,
      afterMount: () => {
        void registerMobilePrefetch({
          serviceWorkerUrl: DEFAULT_SERVED_PATH,
          scope: "/m/",
          navigator: navigator.serviceWorker,
          enabled: () => isMobileHomePath(window.location.pathname),
          // 注入 fetch 必须绑定 window：window.fetch 对 this 敏感，解引用后
          // 调用（deps.fetch）会抛 Illegal invocation（探针实测）。
          resolveUrls: () =>
            resolveCategoryShelfUrls({ fetch: window.fetch.bind(window) }),
          marker: {
            statusKey: "mobilePrefetch",
            countKey: "mobilePrefetchCount",
          },
        });
      },
    });
  });
}
