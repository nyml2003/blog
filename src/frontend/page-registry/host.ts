import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateSiteRoutesManifest,
  type PageRegistration,
  siteRoutesManifestFilename,
  validatePageRegistry,
} from "@fluvient-loom/page-build-kit";
import { pageRegistry } from "../pages.registry.ts";

// 宿主 glue：把真实 fs 能力接进 page-build-kit 的注入点。
// 包本体保持纯函数（平台中立门禁要求），Node 侧副作用全部收敛在这里。
export const frontendRoot = resolve(import.meta.dirname, "..");

export interface ManifestSync {
  readonly path: string;
  readonly changed: boolean;
  readonly expected: string;
  readonly actual: string;
}

export function syncSiteRoutesManifest(
  root: string,
  options: { readonly write: boolean },
  registrations: readonly PageRegistration[] = pageRegistry,
): ManifestSync {
  const path = resolve(root, siteRoutesManifestFilename);
  const expected = generateSiteRoutesManifest(registrations);
  const actual = existsSync(path) ? readFileSync(path, "utf8") : "";
  const changed = actual !== expected;
  if (changed && options.write) {
    writeFileSync(path, expected);
  }
  return { path, changed, expected, actual };
}

export { validatePageRegistry };
