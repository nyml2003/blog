import type { Violation } from './architecture.ts';

const IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']|(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;

const PLATFORM_GLOBAL_PATTERN =
  /\b(?:window|document|localStorage|sessionStorage|navigator|globalThis|fetch|URLSearchParams|AbortController|TextDecoder|ReadableStream|Intl|crypto|wx)\s*[.(\[]?/;
const WEAPP_WEB_GLOBAL_PATTERN =
  /\b(?:window|document|localStorage|sessionStorage|navigator|globalThis|fetch|URLSearchParams|AbortController|TextDecoder|ReadableStream|Intl|crypto)\s*[.(\[]?/;

/** packages/<category>/<pkg>/src——类别目录即门禁策略（放错位置会红）。 */
const PACKAGE_SRC_PATTERN = /\/packages\/([^/]+)(?:\/pages)?\/([^/]+)\/src\/.*\.ts$/;

/** Neutral scopes kernel/web packages may import: the Loom family and the shared core kernel. */
const KERNEL_SCOPES = ['@fluvient-loom', '@fluvient/core'];

export type PackageCategory = 'ts' | 'web' | 'solid' | 'weapp' | 'cli' | 'build' | 'app';

export interface PackageManifestForCheck {
  readonly file: string;
  readonly name: string;
  readonly dependencies: ReadonlySet<string>;
  readonly development?: ReadonlySet<string>;
  readonly peers?: ReadonlySet<string>;
  readonly optional?: ReadonlySet<string>;
}

const CATEGORIES = new Set<string>([
  'ts',
  'web',
  'solid',
  'weapp',
  'cli',
  'build',
  'app',
]);

/** 随运行时同包发布的 Vite 集成（./vite 子路径）：允许构建工具导入。 */
const BUILD_INTEGRATION_PACKAGES = new Set(['mobile-prefetch']);

function isScopeAllowed(specifier: string): boolean {
  return KERNEL_SCOPES.some(
    (scope) => specifier === scope || specifier.startsWith(`${scope}/`),
  );
}

function importViolation(category: PackageCategory, pkg: string, specifier: string): string | undefined {
  if (specifier.startsWith('./') || specifier.startsWith('../')) return undefined;
  if (category === 'cli' || category === 'app') return undefined;
  if (
    BUILD_INTEGRATION_PACKAGES.has(pkg) &&
    (specifier === 'vite' || specifier.startsWith('node:'))
  ) {
    return undefined;
  }
  if (category === 'build') {
    if (specifier === 'vite' || specifier.startsWith('node:')) return undefined;
    if (isScopeAllowed(specifier)) return undefined;
    return `非中立依赖 "${specifier}"：build 域包 src/ 只允许相对导入、@fluvient/* 内部导入与 node:/vite 构建工具`;
  }
  if (category === 'solid' && specifier === 'solid-js') return undefined;
  if (isScopeAllowed(specifier)) return undefined;
  return `非中立依赖 "${specifier}"：${category} 域包 src/ 只允许相对导入与 @fluvient/* 内部导入${category === 'solid' ? '（solid 域另允许 solid-js）' : ''}（包 ${pkg}）`;
}

/**
 * Package neutrality guard, driven by directory category:
 * packages/ts/*    strict: scope imports only, no platform globals;
 * packages/web/*   scope imports, platform globals allowed (host adapters);
 * packages/solid/* scope imports + solid-js, platform globals allowed;
 * packages/cli/*   ops CLI domain, skipped;
 * packages/build/* build-chain tooling: vite/node: imports allowed, no platform globals;
 * packages/app/*   app-private packages (@blog), skipped.
 * Unknown categories fail closed (placement is the policy).
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
    const [, category, pkg] = match;
    if (!CATEGORIES.has(category)) {
      violations.push({
        file,
      message: `未知包类别 "${category}"：包必须位于 packages/{ts,web,solid,weapp,cli,build,app}/<pkg> 之下（目录即门禁策略）`,
      });
      continue;
    }
    const source = readSource(file);
    for (const importMatch of source.matchAll(IMPORT_PATTERN)) {
      const specifier = importMatch[1] ?? importMatch[2];
      const message =
        specifier !== undefined
          ? importViolation(category as PackageCategory, pkg, specifier)
          : undefined;
      if (message !== undefined) {
        violations.push({ file, message });
      }
    }
    // 平台全局检测前剥离字符串字面量：import 路径（如 "./ports/document.ts"）
    // 不是宿主访问。
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/"[^"]*"/g, '""')
      .replace(/'[^']*'/g, "''");
    const strictAppPackage = category === 'app' &&
      (pkg === 'mobile-api' || pkg === 'kernel' || pkg === 'mobile-shared');
    const platformGlobalsAllowed =
      category === 'web' || category === 'solid' || category === 'cli' || (category === 'app' && !strictAppPackage);
    const forbiddenGlobal = category === 'weapp'
      ? WEAPP_WEB_GLOBAL_PATTERN.test(codeOnly)
      : PLATFORM_GLOBAL_PATTERN.test(codeOnly);
    if (!platformGlobalsAllowed && forbiddenGlobal) {
      violations.push({
        file,
        message: `平台全局访问不允许出现在 ${category} 域包 src/（包 ${pkg}）`,
      });
    }
  }
  return violations;
}

/** Check direct source imports against the owning package manifest. */
export function checkPackageDependencies(
  files: readonly string[],
  readSource: (file: string) => string,
  manifests: readonly PackageManifestForCheck[],
): Violation[] {
  const violations: Violation[] = [];
  const used = new Map<string, Set<string>>();
  for (const file of files) {
    const normalized = file.replaceAll('\\', '/');
    const owner = manifests
      .filter((manifest) => normalized.startsWith(`${manifest.file.slice(0, -13)}/`))
      .sort((left, right) => right.file.length - left.file.length)[0];
    if (owner === undefined) continue;
    if (!used.has(owner.file)) used.set(owner.file, new Set<string>());
    for (const match of readSource(file).matchAll(IMPORT_PATTERN)) {
      const specifier = match[1] ?? match[2];
      if (specifier === undefined || specifier.startsWith('.') || specifier.startsWith('node:')) continue;
      const packageName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      const imports = used.get(owner.file) ?? new Set<string>();
      imports.add(packageName);
      used.set(owner.file, imports);
      const runtimeDeclared = owner.dependencies.has(packageName) || owner.peers?.has(packageName) || owner.optional?.has(packageName);
      const developmentFile = !normalized.startsWith(`${owner.file.slice(0, -13)}/src/`);
      if (packageName === owner.name || runtimeDeclared || (developmentFile && owner.development?.has(packageName))) continue;
      violations.push({
        file,
        message: `未声明直接依赖 "${packageName}"：包 ${owner.name} 的 package.json 必须声明源码 import 使用的依赖`,
      });
    }
  }
  for (const manifest of manifests) {
    if (!manifest.file.includes('/packages/') || !used.has(manifest.file)) continue;
    for (const dependency of manifest.dependencies) {
      if (used.get(manifest.file)?.has(dependency)) continue;
      violations.push({
        file: manifest.file,
        message: `声明但未使用直接依赖 "${dependency}"：包 ${manifest.name} 应删除该依赖或在源码中显式使用`,
      });
    }
  }
  return violations;
}
