export type MobileTheme = "paper" | "dark" | "sepia";
export type MobileFont = "sans" | "serif" | "mono";

export interface MobileSettings { readonly theme: MobileTheme; readonly font: MobileFont; }

export const defaultMobileSettings: MobileSettings = { theme: "paper", font: "sans" };
export const mobileSettingsOptions = {
  themes: ["paper", "dark", "sepia"] as const,
  fonts: ["sans", "serif", "mono"] as const,
};
export const mobileSettingsKey = "blog.mobile.settings.v1";

export function normalizeMobileSettings(theme: unknown, font: unknown): MobileSettings {
  return {
    theme: mobileSettingsOptions.themes.includes(theme as MobileTheme) ? theme as MobileTheme : defaultMobileSettings.theme,
    font: mobileSettingsOptions.fonts.includes(font as MobileFont) ? font as MobileFont : defaultMobileSettings.font,
  };
}

export function parseMobileSettings(raw: unknown): MobileSettings {
  if (typeof raw === "string") {
    try { return parseMobileSettings(JSON.parse(raw)); } catch { return defaultMobileSettings; }
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return defaultMobileSettings;
  const value = raw as { theme?: unknown; font?: unknown };
  return normalizeMobileSettings(value.theme, value.font);
}
