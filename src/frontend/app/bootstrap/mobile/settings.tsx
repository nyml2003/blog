import { createBrowserPersistence } from "../../infrastructure/browser";
import {
  defaultMobileSettings,
  readMobileSettings,
} from "../../habitat/mobile/logic/settings";

let settings = defaultMobileSettings;
try {
  settings = readMobileSettings(createBrowserPersistence(window.localStorage));
} catch {
  settings = defaultMobileSettings;
}
document.documentElement.setAttribute("data-theme", settings.theme);
document.documentElement.setAttribute("data-font", settings.font);
