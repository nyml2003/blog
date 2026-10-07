import { createWeappPersistence } from "@blog/weapp-host";
import { mobileSettingsKey, parseMobileSettings } from "@fluvient-loom/mobile-foundation";

export function readWeappSettings() {
  const result = createWeappPersistence().read(mobileSettingsKey);
  return parseMobileSettings(result.ok ? result.value : undefined);
}
