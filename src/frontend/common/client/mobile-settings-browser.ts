import { createSynchronousStorage } from "../data/storage";
import { createMobileSettingsClient } from "./mobile-settings";

export const browserMobileSettingsClient = createMobileSettingsClient(
  createSynchronousStorage(() => window.localStorage),
);
