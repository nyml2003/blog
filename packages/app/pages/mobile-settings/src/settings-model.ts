export { defaultMobileSettings, normalizeMobileSettings, type MobileFont, type MobileTheme } from "@fluvient-loom/mobile-foundation";
import type { MobileFont, MobileTheme } from "@fluvient-loom/mobile-foundation";

export interface MobileSettings {
  readonly theme: MobileTheme;
  readonly font: MobileFont;
}

export interface MobileSettingsError {
  readonly kind: "settings";
  readonly message: string;
  readonly cause?: import("@fluvient/core").ErrorInfo;
}

export const mobileSettingsKeys = {
  snapshot: "blog.mobile.settings.v1",
  theme: "blog.mobile.theme",
  font: "blog.mobile.font",
} as const;

export const mobileSettingsOptions = {
  themes: [
    { value: "paper", label: "纸张" },
    { value: "dark", label: "暗色" },
    { value: "sepia", label: "sepia" },
  ] as const,
  fonts: [
    { value: "sans", label: "无衬线" },
    { value: "serif", label: "衬线" },
    { value: "mono", label: "等宽" },
  ] as const,
};

export function isMobileTheme(value: unknown): value is MobileTheme {
  return mobileSettingsOptions.themes.some((option) => option.value === value);
}

export function isMobileFont(value: unknown): value is MobileFont {
  return mobileSettingsOptions.fonts.some((option) => option.value === value);
}
