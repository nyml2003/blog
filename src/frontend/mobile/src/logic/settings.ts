export type MobileTheme = "paper" | "dark" | "sepia";
export type MobileFont = "sans" | "serif" | "mono";
export type MobileSettings = {
  theme: MobileTheme;
  font: MobileFont;
};

export const mobileSettingsKeys = {
  theme: "blog.mobile.theme",
  font: "blog.mobile.font",
} as const;

type SettingsStorage = Pick<Storage, "getItem" | "setItem">;
type StorageProvider = () => SettingsStorage;
type SettingsRoot = Pick<HTMLElement, "getAttribute" | "setAttribute">;

export function isMobileTheme(value: unknown): value is MobileTheme {
  return value === "paper" || value === "dark" || value === "sepia";
}

export function isMobileFont(value: unknown): value is MobileFont {
  return value === "sans" || value === "serif" || value === "mono";
}

function readStoredValue(storage: StorageProvider, key: string) {
  try {
    return storage().getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function normalizeSettings(theme: unknown, font: unknown): MobileSettings {
  return {
    theme: isMobileTheme(theme) ? theme : "paper",
    font: isMobileFont(font) ? font : "sans",
  };
}

export function readStoredSettings(storage: StorageProvider): MobileSettings {
  return normalizeSettings(
    readStoredValue(storage, mobileSettingsKeys.theme),
    readStoredValue(storage, mobileSettingsKeys.font),
  );
}

// The head script owns initial storage reads. Respect its fallback if blocked.
export function readAppliedSettings(root: SettingsRoot): MobileSettings {
  return normalizeSettings(
    root.getAttribute("data-theme") ?? undefined,
    root.getAttribute("data-font") ?? undefined,
  );
}

export function applySettings(root: SettingsRoot, settings: MobileSettings) {
  root.setAttribute("data-theme", settings.theme);
  root.setAttribute("data-font", settings.font);
}

function persistValue(storage: StorageProvider, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {
    // Applying the current selection does not depend on storage availability.
  }
}

export function persistTheme(storage: StorageProvider, theme: MobileTheme) {
  if (!isMobileTheme(theme)) return;
  persistValue(storage, mobileSettingsKeys.theme, theme);
}

export function persistFont(storage: StorageProvider, font: MobileFont) {
  if (!isMobileFont(font)) return;
  persistValue(storage, mobileSettingsKeys.font, font);
}
