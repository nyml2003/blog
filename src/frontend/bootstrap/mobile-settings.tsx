import { createWebPersistence } from "@fluvient-loom/web";
// 经模型子路径而非包根：本入口由 page-bootstrap 以独立构建（无框架插件）内联，
// 其 import 图不得触达页面包根的登记（definition.load 会拖入需要 JSX 的 page.tsx）。
import { readMobileSettings } from "@blog/page-mobile-settings/persistence";
import { defaultMobileSettings } from "@blog/page-mobile-settings/settings-model";

let settings = defaultMobileSettings;
try {
  settings = readMobileSettings(
    createWebPersistence({ storage: window.localStorage }),
  );
} catch {
  settings = defaultMobileSettings;
}
document.documentElement.setAttribute("data-theme", settings.theme);
document.documentElement.setAttribute("data-font", settings.font);
