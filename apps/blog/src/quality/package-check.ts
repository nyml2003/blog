import type { FsPort, PathPort, ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { EffectPort } from '@fluvient-cli/cli-kit/effects.ts';
import { processStepEffect, reportPlan } from '@fluvient-cli/cli-kit/effects.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';
import { checkPackageDependencies, checkPackageNeutrality, type PackageManifestForCheck } from './package-guard.ts';

export async function runPackageCheck(
  workspace: Workspace,
  process: ProcessPort,
  fs: FsPort,
  path: PathPort,
  reporter: Reporter,
  effects: EffectPort,
): Promise<boolean> {
  reporter.section('ops package check');
  let passed = true;

  const allFiles = (await fs.files(workspace.root)).filter((file) => !file.includes('node_modules'));
  const files = allFiles.filter((file) => /\.(ts|tsx|js|jsx|mjs|css)$/.test(file) && !/(?:^|\/)(?:dist|target|coverage)\//.test(file));
  const sources = new Map<string, string>();
  for (const file of files) sources.set(file, await fs.read(file));
  const manifestFiles = allFiles.filter((file) => file.endsWith('/package.json'));
  const manifestData: PackageManifestForCheck[] = [];
  for (const file of manifestFiles) {
    try {
      const value = JSON.parse(await fs.read(file)) as {
        name?: unknown;
        dependencies?: Record<string, unknown>;
        devDependencies?: Record<string, unknown>;
        peerDependencies?: Record<string, unknown>;
        optionalDependencies?: Record<string, unknown>;
      };
      if (typeof value.name !== 'string') continue;
      manifestData.push({
        file,
        name: value.name,
        dependencies: new Set(Object.keys(value.dependencies ?? {})),
        development: new Set(Object.keys(value.devDependencies ?? {})),
        peers: new Set(Object.keys(value.peerDependencies ?? {})),
        optional: new Set(Object.keys(value.optionalDependencies ?? {})),
      });
    } catch {
      reporter.fail(`${file}: package.json 不是合法 JSON`);
    }
  }
  const violations = [
    ...checkPackageNeutrality(files.filter((file) => file.startsWith(`${workspace.root}/packages/`)), (file) => sources.get(file) ?? ''),
    ...checkPackageDependencies(
      files.filter((file) => file.includes('/packages/')),
      (file) => sources.get(file) ?? '',
      manifestData,
    ),
  ];
  for (const violation of violations) {
    passed = false;
    reporter.fail(`${violation.file}: ${violation.message}`);
  }
  if (!violations.length) reporter.ok('platform neutrality guard');

  const smoke = await effects.run(processStepEffect({ process, reporter }, {
    label: 'package smoke (@fluvient-loom lifecycle + Node adapter)',
    command: 'pnpm',
    args: ['exec', 'tsx', 'apps/blog/test/packages/package-smoke.ts'],
    cwd: workspace.root,
  }, 'pnpm exec tsx apps/blog/test/packages/package-smoke.ts'), undefined);
  if (!smoke.ok) passed = false;

  const result = await effects.run(processStepEffect({ process, reporter }, {
    label: 'pnpm check (typecheck + test)',
    command: 'pnpm',
    args: ['run', 'check'],
    cwd: workspace.root,
  }, 'pnpm run check'), undefined);
  if (!result.ok) passed = false;
  reportPlan(effects, reporter);
  return passed;
}
