import { createSignal } from "solid-js";
import { browserMobileSettingsClient } from "../../../common/client/mobile-settings-browser";
import {
  normalizeMobileSettings,
  type MobileFont,
  type MobileSettings,
  type MobileSettingsClient,
  type MobileTheme,
} from "../../../common/client/mobile-settings";
import type { Result } from "../../../common/data/result";
import type { StorageFailure } from "../../../common/data/storage";
import { siteRouteRequired } from "../../../common/client/site-routes";
import { mobileNavigationItems } from "./navigation";

type SettingsRoot = Pick<HTMLElement, "getAttribute" | "setAttribute">;

// The head script owns initial storage reads. Respect its fallback if blocked.
export function readAppliedSettings(root: SettingsRoot): MobileSettings {
  return normalizeMobileSettings(
    root.getAttribute("data-theme") ?? undefined,
    root.getAttribute("data-font") ?? undefined,
  );
}

export function applySettings(root: SettingsRoot, settings: MobileSettings) {
  root.setAttribute("data-theme", settings.theme);
  root.setAttribute("data-font", settings.font);
}

export function createMobileSettingsAdapter(
  client: MobileSettingsClient,
  root: SettingsRoot,
) {
  const [settings, setSettings] = createSignal(readAppliedSettings(root));
  const [persistence, setPersistence] = createSignal<
    Result<void, StorageFailure> | undefined
  >(undefined);

  function selectTheme(theme: MobileTheme) {
    const next = { ...settings(), theme };
    setSettings(next);
    applySettings(root, next);
    setPersistence(client.saveTheme(theme));
  }

  function selectFont(font: MobileFont) {
    const next = { ...settings(), font };
    setSettings(next);
    applySettings(root, next);
    setPersistence(client.saveFont(font));
  }

  return {
    settings,
    persistence,
    options: client.options,
    selectTheme,
    selectFont,
  };
}

export function useMobileSettings() {
  return createMobileSettingsAdapter(
    browserMobileSettingsClient,
    document.documentElement,
  );
}

/** 页面内容在渲染期求值：路径值来自后端路由清单。 */
export const mobileSettingsPageContent = () =>
  ({
    title: "设置",
    brand: "技术知识库",
    brandHref: siteRouteRequired("mobile-home"),
    skipLinkLabel: "跳到主要内容",
    navigationLabel: "页面导航",
    activeNavigationId: "settings",
    themeLabel: "主题风格",
    fontLabel: "正文字体",
    navigation: mobileNavigationItems(),
  }) as const;
