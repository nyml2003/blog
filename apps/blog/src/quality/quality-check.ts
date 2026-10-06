import type { FsPort, PathPort, ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { EffectPort } from '@fluvient-cli/cli-kit/effects.ts';
import { processStepEffect, reportPlan } from '@fluvient-cli/cli-kit/effects.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';
import { checkArchitectureBoundaries } from './architecture.ts';
export async function runCheck(workspace: Workspace, process: ProcessPort, fs: FsPort, path: PathPort, reporter: Reporter, effects: EffectPort): Promise<boolean> {
  reporter.section('blog quality check'); let passed = true;
  const run = async (label: string, command: string, args: string[], cwd: string): Promise<void> => {
    const result = await effects.run(processStepEffect({ process, reporter }, { label, command, args, cwd }, `${command} ${args.join(' ')}`), undefined);
    if (!result.ok) passed = false;
  };
  // Rust gate replaces the retired Go gate; the workspace is expected to exist, and a missing one
  // is a failure (20) rather than a silent pass.
  if (await fs.exists(path.join(workspace.root, 'src', 'Cargo.toml'))) {
    await run('cargo fmt', 'cargo', ['fmt', '--all', '--check'], path.join(workspace.root, 'src'));
    await run('cargo clippy', 'cargo', ['clippy', '--workspace', '--all-targets', '--', '-D', 'warnings'], path.join(workspace.root, 'src'));
    await run('cargo test', 'cargo', ['test', '--workspace'], path.join(workspace.root, 'src'));
  } else {
    passed = false;
    reporter.fail('cargo workspace');
    reporter.info('未找到 Cargo.toml：Rust 门禁（cargo fmt / clippy / test）无法执行');
  }
  const lintPaths = [
    'packages/cli/cli-kit/src',
    'packages/cli/cli-plugins/src',
    'packages/cli/node/src',
    'apps/blog/src/release',
    'apps/blog/src/delivery',
    'apps/blog/src/quality',
    'apps/blog/src/stats',
    'apps/blog/src/page',
    'apps/blog/src/admin',
    'apps/blog/src/content',
  ].map((relative) => path.join(workspace.root, relative));
  await run('ops lint (await/imports)', 'pnpm', ['-C', 'src/frontend', 'exec', 'oxlint', '-c', path.join(workspace.root, '.oxlintrc.json'), ...lintPaths], workspace.root);
  const appFiles = (await Promise.all([fs.files(workspace.appSource), fs.files(workspace.appTests)])).flat().filter((f) => f.endsWith('.ts'));
  for (const file of appFiles) await run(`blog syntax: ${file.replace(`${workspace.root}/`, '')}`, 'node', ['--experimental-strip-types', '--check', file], workspace.root);
  const appTests = appFiles.filter((f) => f.endsWith('.test.ts'));
  if (appTests.length) await run('blog contract tests', 'node', ['--experimental-strip-types', '--test', ...appTests], workspace.root);
  if (await fs.exists(`${workspace.web}/package.json`)) {
    await run('pnpm typecheck', 'pnpm', ['-C', 'src/frontend', 'run', 'typecheck'], workspace.root);
    await run('pnpm lint', 'pnpm', ['-C', 'src/frontend', 'run', 'lint'], workspace.root);
    await run('pnpm format:check', 'pnpm', ['-C', 'src/frontend', 'run', 'format:check'], workspace.root);
    await run('pnpm test:core', 'pnpm', ['-C', 'src/frontend', 'run', 'test:core'], workspace.root);
    await run('pnpm build', 'pnpm', ['-C', 'src/frontend', 'run', 'build'], workspace.root);
  }
  const isProjectSource = (file: string) => !/[\\/](?:node_modules|dist|target|\.generated)[\\/]/.test(file);
  const manifestFiles = (await fs.files(path.join(workspace.root, 'src'))).filter((file) => isProjectSource(file) && file.endsWith('Cargo.toml'));
  // Read source through the injected port while keeping the domain rule pure.
  const sources = new Map<string, string>();
  for (const file of manifestFiles) sources.set(file, await fs.read(file));
  const actual = checkArchitectureBoundaries(manifestFiles, (f) => sources.get(f) ?? '', path);
  for (const violation of actual) { passed = false; reporter.fail(`${violation.file}: ${violation.message}`); }
  if (!actual.length) reporter.ok('architecture boundaries');
  reportPlan(effects, reporter);
  return passed;
}
