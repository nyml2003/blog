import { join } from 'node:path';
import type { FsPort, ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { EffectPort } from '@fluvient-cli/cli-kit/effects.ts';
import { processStepEffect, reportPlan } from '@fluvient-cli/cli-kit/effects.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';
import { checkPackageNeutrality } from './package-guard.ts';

export async function runPackageCheck(
  workspace: Workspace,
  process: ProcessPort,
  fs: FsPort,
  reporter: Reporter,
  effects: EffectPort,
): Promise<boolean> {
  reporter.section('ops package check');
  let passed = true;

  const packagesRoot = join(workspace.root, 'packages');
  const files = (await fs.files(packagesRoot)).filter(
    (file) => file.endsWith('.ts') && !file.includes('node_modules'),
  );
  const sources = new Map<string, string>();
  for (const file of files) sources.set(file, await fs.read(file));
  const violations = checkPackageNeutrality(files, (file) => sources.get(file) ?? '');
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
