import { join } from 'node:path';
import type { FsPort, ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';
import { checkPackageNeutrality } from './package-guard.ts';

export async function runPackageCheck(
  workspace: Workspace,
  process: ProcessPort,
  fs: FsPort,
  reporter: Reporter,
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

  const smoke = await process.run(
    'pnpm',
    ['exec', 'tsx', 'apps/blog/test/packages/package-smoke.ts'],
    workspace.root,
  );
  if (smoke.code !== 0) {
    passed = false;
    reporter.fail('package smoke (@fluvient-loom lifecycle + Node adapter)');
    reporter.info(smoke.stderr || smoke.stdout);
  } else {
    reporter.ok('package smoke (@fluvient-loom lifecycle + Node adapter)');
  }

  const result = await process.run('pnpm', ['run', 'check'], workspace.root);
  if (result.code !== 0) {
    passed = false;
    reporter.fail('pnpm check (typecheck + test)');
    reporter.info(result.stderr || result.stdout);
  } else {
    reporter.ok('pnpm check (typecheck + test)');
  }
  return passed;
}
