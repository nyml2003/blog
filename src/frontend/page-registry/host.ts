import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  generateSiteRoutesManifest,
  insertRegistration,
  type PageRegistration,
  planScaffoldPage,
  type ScaffoldIo,
  type ScaffoldPlan,
  siteRoutesManifestFilename,
  validatePageRegistry,
  writeScaffold,
} from "@fluvient-loom/page-build-kit";
import { pageRegistry } from "../pages.registry.ts";

// 宿主 glue：把真实 fs/进程能力接进 page-build-kit 的注入点。
// 包本体保持纯函数（平台中立门禁要求），Node 侧副作用全部收敛在这里。
export const frontendRoot = resolve(import.meta.dirname, "..");

export function realEntryExists(entry: string): boolean {
  return existsSync(resolve(frontendRoot, entry.replace(/^\//, "")));
}

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

/** 脚手架在宿主源码树里的两个补丁目标（注册表与冻结清单）。 */
export const scaffoldFixturePaths = {
  registry: "pages.registry.ts",
  frozenRoutes: "tests/vite-plugins/page-template.test.ts",
} as const;

export function createRealScaffoldIo(root: string): ScaffoldIo {
  return {
    read: (path) => readFileSync(resolve(root, path), "utf8"),
    write: (path, content) => {
      const target = resolve(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    },
    exists: (path) => existsSync(resolve(root, path)),
    format: (paths) => {
      const result = spawnSync(
        "pnpm",
        ["exec", "biome", "format", "--write", ...paths],
        { cwd: root, encoding: "utf8" },
      );
      if (result.status !== 0) {
        throw new Error(`biome format 失败：${result.stderr}`);
      }
    },
  };
}

export interface ScaffoldOutcome {
  readonly written: readonly string[];
  readonly issues: readonly string[];
}

/** 脚手架编排：计划（校验先行）→ 写入 → 重新生成路由清单。 */
export function scaffoldNewPage(
  spec: Parameters<typeof planScaffoldPage>[0],
  root: string,
  io: ScaffoldIo = createRealScaffoldIo(root),
  registrations: readonly PageRegistration[] = pageRegistry,
): ScaffoldOutcome {
  const { plan, issues } = planScaffoldPage(
    spec,
    registrations,
    realEntryExists,
  );
  if (plan === undefined) return { written: [], issues };
  const writeResult = writeScaffold(plan, io, scaffoldFixturePaths);
  if (writeResult.issues.length > 0) {
    return { written: [], issues: writeResult.issues };
  }
  syncSiteRoutesManifest(
    root,
    { write: true },
    insertRegistration(registrations, plan.registration),
  );
  return {
    written: [
      ...plan.files.map((file) => file.path),
      scaffoldFixturePaths.registry,
      scaffoldFixturePaths.frozenRoutes,
      siteRoutesManifestFilename,
    ],
    issues: [],
  };
}

export type { PageRegistration, ScaffoldPlan };
export { validatePageRegistry };
