import { createWebPersistence } from "@fluvient-loom/web";
import {
  defaultMobileSettings,
  readMobileSettings,
} from "@blog/page-mobile-settings";

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
