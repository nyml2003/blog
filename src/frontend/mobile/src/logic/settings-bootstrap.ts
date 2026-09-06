import { browserMobileSettingsClient } from "../../../common/client/mobile-settings-browser";

const settings = browserMobileSettingsClient.read();
document.documentElement.setAttribute("data-theme", settings.theme);
document.documentElement.setAttribute("data-font", settings.font);
