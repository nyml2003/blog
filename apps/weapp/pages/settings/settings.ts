import { createWeappPersistence } from "../../src/runtime.ts";
import { defaultMobileSettings, mobileSettingsKey, mobileSettingsOptions, parseMobileSettings, type MobileFont, type MobileTheme } from "../../src/runtime.ts";

type SettingsData = { themes: readonly MobileTheme[]; fonts: readonly MobileFont[]; theme: MobileTheme; font: MobileFont; themeIndex: number; fontIndex: number };
type SettingsPage = WeappPageThis<SettingsData> & {
  applyTheme(theme: string): void;
  save(key: "theme" | "font", value: string): void;
};

Page<SettingsData>({
  data: { themes: mobileSettingsOptions.themes, fonts: mobileSettingsOptions.fonts, ...defaultMobileSettings, themeIndex: 0, fontIndex: 0 },
  onLoad(this: SettingsPage) {
    const saved = createWeappPersistence().read(mobileSettingsKey);
    const settings = parseMobileSettings(saved.ok ? saved.value : undefined);
    const theme = settings.theme;
    const font = settings.font;
    this.setData({ theme, font, themeIndex: this.data.themes.indexOf(theme), fontIndex: this.data.fonts.indexOf(font) });
    this.applyTheme(theme);
  },
  applyTheme(this: SettingsPage, theme: string) {
    const dark = theme === "dark";
    wx.setNavigationBarColor({ frontColor: dark ? "#ffffff" : "#000000", backgroundColor: dark ? "#20252b" : theme === "sepia" ? "#f4ecd8" : "#f4f1ea" });
  },
  save(this: SettingsPage, key: "theme" | "font", value: string) {
    const persistence = createWeappPersistence();
    const old = persistence.read(mobileSettingsKey);
    const record = parseMobileSettings(old.ok ? old.value : undefined);
    persistence.write({ key: mobileSettingsKey, value: JSON.stringify({ ...record, [key]: value }) });
  },
  theme(this: SettingsPage, e: WeappEvent<{ value: number }>) {
    const value = this.data.themes[e.detail.value];
    if (!value) return;
    this.setData({ themeIndex: e.detail.value, theme: value });
    this.applyTheme(value);
    this.save("theme", value);
  },
  font(this: SettingsPage, e: WeappEvent<{ value: number }>) {
    const value = this.data.fonts[e.detail.value];
    if (!value) return;
    this.setData({ fontIndex: e.detail.value, font: value });
    this.save("font", value);
  },
});
