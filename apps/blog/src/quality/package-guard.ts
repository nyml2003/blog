import type { Violation } from './architecture.ts';

const IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

const PLATFORM_GLOBAL_PATTERN =
  /\b(?:window|document|localStorage|sessionStorage|navigator|globalThis)\s*[.[]/;

const PACKAGE_SRC_PATTERN = /\/packages\/([^/]+)\/src\/.*\.ts$/;

/** Packages owned by the separate Node-based ops CLI, rather than Loom. */
const CLI_PACKAGES = new Set(['cli-core', 'cli-kit', 'cli-plugins']);

/** Host adapters are allowed to reference the platform they adapt. */
const HOST_ADAPTER_PACKAGES = new Set(['web', 'gesture-web', 'mobile-prefetch']);

/** UI packages may depend on their rendering framework by design. */
const PACKAGE_IMPORT_ALLOWLIST = new Map([
  ['mobile-h5-solid-atoms', new Set(['solid-js'])],
]);

function isAllowed(packageName: string, specifier: string): boolean {
  return (
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier.startsWith('@fluvient-loom/') ||
    PACKAGE_IMPORT_ALLOWLIST.get(packageName)?.has(specifier) === true
  );
}

/**
 * Platform-neutrality guard for the @fluvient-loom kernel packages: files
 * under packages/<pkg>/src may only import relatively or from the same
 * scope, and may not touch platform globals. Tests and tooling scripts are
 * out of scope by design — the contract covers package runtime sources only.
 */
export function checkPackageNeutrality(
  files: readonly string[],
  readSource: (file: string) => string,
): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const normalized = file.replaceAll('\\', '/');
    const match = PACKAGE_SRC_PATTERN.exec(normalized);
    if (!match) continue;
    const packageName = match[1];
    if (CLI_PACKAGES.has(packageName)) continue;
    const hostAdapter = HOST_ADAPTER_PACKAGES.has(packageName);
    const source = readSource(file);
    for (const importMatch of source.matchAll(IMPORT_PATTERN)) {
      const specifier = importMatch[1] ?? importMatch[2];
      if (specifier !== undefined && !isAllowed(packageName, specifier)) {
        violations.push({
          file,
          message: `非中立依赖 "${specifier}"：包 src/ 只允许相对导入与 @fluvient-loom/* 内部导入`,
        });
      }
    }
    if (!hostAdapter && PLATFORM_GLOBAL_PATTERN.test(source)) {
      violations.push({
        file,
        message:
          '平台全局访问（window/document/localStorage/sessionStorage/navigator/globalThis）不允许出现在内核包 src/',
      });
    }
  }
  return violations;
}
