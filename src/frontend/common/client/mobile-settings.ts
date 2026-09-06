import type { SynchronousStorage } from "../data/storage";

export type MobileTheme = "paper" | "dark" | "sepia";
export type MobileFont = "sans" | "serif" | "mono";
export type MobileSettings = {
  readonly theme: MobileTheme;
  readonly font: MobileFont;
};

type SettingOption<Value extends string> = {
  readonly value: Value;
  readonly label: string;
};

export const mobileSettingsKeys = {
  theme: "blog.mobile.theme",
  font: "blog.mobile.font",
} as const;

export const defaultMobileSettings: MobileSettings = {
  theme: "paper",
  font: "sans",
};

export const mobileSettingsOptions = {
  themes: [
    { value: "paper", label: "纸张" },
    { value: "dark", label: "暗色" },
    { value: "sepia", label: "sepia" },
  ] as const satisfies readonly SettingOption<MobileTheme>[],
  fonts: [
    { value: "sans", label: "无衬线" },
    { value: "serif", label: "衬线" },
    { value: "mono", label: "等宽" },
  ] as const satisfies readonly SettingOption<MobileFont>[],
};

export function isMobileTheme(value: unknown): value is MobileTheme {
  return mobileSettingsOptions.themes.some((option) => option.value === value);
}

export function isMobileFont(value: unknown): value is MobileFont {
  return mobileSettingsOptions.fonts.some((option) => option.value === value);
}

export function normalizeMobileSettings(
  theme: unknown,
  font: unknown,
): MobileSettings {
  return {
    theme: isMobileTheme(theme) ? theme : defaultMobileSettings.theme,
    font: isMobileFont(font) ? font : defaultMobileSettings.font,
  };
}

function readValue(storage: SynchronousStorage, key: string) {
  const result = storage.read(key);
  if (!result.ok) return undefined;
  return result.value;
}

export function createMobileSettingsClient(storage: SynchronousStorage) {
  return {
    options: mobileSettingsOptions,
    read(): MobileSettings {
      return normalizeMobileSettings(
        readValue(storage, mobileSettingsKeys.theme),
        readValue(storage, mobileSettingsKeys.font),
      );
    },
    saveTheme(theme: MobileTheme) {
      return storage.write(mobileSettingsKeys.theme, theme);
    },
    saveFont(font: MobileFont) {
      return storage.write(mobileSettingsKeys.font, font);
    },
  };
}

export type MobileSettingsClient = ReturnType<typeof createMobileSettingsClient>;
