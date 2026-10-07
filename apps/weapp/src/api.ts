import { createMobileApi } from "@blog/mobile-api";
import { createWeappNetwork } from "@blog/weapp-host";

export function createWeappApi(origin: string) {
  return createMobileApi(createWeappNetwork(origin));
}
