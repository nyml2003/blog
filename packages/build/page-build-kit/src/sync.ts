import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateSiteRoutesManifest } from "./generate.ts";
import type { PageRegistration } from "./types.ts";

// site-routes.json 的宿主侧同步：读取/比对/按需写盘。
// 本包属于构建链（build 域，node 环境），直接使用 node:fs。

export interface SiteRoutesManifestSync {
  readonly path: string;
  readonly changed: boolean;
  readonly expected: string;
  readonly actual: string;
}

export function syncSiteRoutesManifest(
  root: string,
  options: { readonly write: boolean },
  registrations: readonly PageRegistration[],
): SiteRoutesManifestSync {
  const path = resolve(root, "site-routes.json");
  const expected = generateSiteRoutesManifest(registrations);
  const actual = existsSync(path) ? readFileSync(path, "utf8") : "";
  const changed = actual !== expected;
  if (changed && options.write) {
    writeFileSync(path, expected);
  }
  return { path, changed, expected, actual };
}
