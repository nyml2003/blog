import { type Component } from "solid-js";
import type { NavigationPort } from "@fluvient-loom/port";
import type { MobilePageContext } from "@blog/mobile-shared";
import { route } from "@blog/mobile-shared";
import { removeMobileAppShell } from "@fluvient-loom/page-kit/mobile";
import { createFavoriteStore } from "./favorites.ts";
import { createMobileDetailPage } from "./page.tsx";
import { mobileArticleDetailPage } from "./definition.ts";

// 页面自己的组合根：从完整 context 出发组装自己的输入（参数解析、收藏、返回策略、
// 预渲染骨架清理）。注册表的 load 只按 id 路由到这里，不知道页面的内部依赖。
export function createMobileDetailEntry(context: MobilePageContext): Component {
  const params = mobileArticleDetailPage.parseParams(
    context.navigation.current().search,
  );
  return createMobileDetailPage({
    context,
    navigation: context.navigation,
    persistence: context.persistence,
    favorites: createFavoriteStore(context.persistence),
    document: context.document,
    share: context.share,
    onAppShellReady: removeMobileAppShell,
    id: params.ok ? params.value.id : undefined,
    query: params.ok ? params.value.q : "",
    api: context.api,
    articleListHref: route(context.routes, "mobile-articles"),
    onBack() {
      if (canReturnToSite(context.navigation)) {
        context.navigation.back();
        return;
      }
      context.navigation.push(route(context.routes, "mobile-articles"), undefined);
    },
  });
}

function canReturnToSite(navigation: NavigationPort): boolean {
  const referrer = navigation.referrer();
  if (!navigation.canGoBack() || referrer === "") return false;
  try {
    return new URL(referrer).origin === navigation.origin();
  } catch {
    return false;
  }
}
