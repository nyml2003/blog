import { join } from 'node:path';
import type { FsPort, ProcessPort, Reporter } from '../domain/ports.ts';
import type { Workspace } from '../domain/workspace.ts';
import { checkPackageNeutrality } from '../domain/package-guard.ts';

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

  const result = await process.run('pnpm', ['run', 'check'], workspace.root);
  if (result.code !== 0) {
    passed = false;
    reporter.fail('pnpm check (typecheck + test + smoke)');
    reporter.info(result.stderr || result.stdout);
  } else {
    reporter.ok('pnpm check (typecheck + test + smoke)');
  }
  return passed;
}
