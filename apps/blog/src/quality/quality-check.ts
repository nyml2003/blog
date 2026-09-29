import { join } from 'node:path';
import type { FsPort, ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';
import { checkArchitectureBoundaries } from './architecture.ts';
export async function runCheck(workspace: Workspace, process: ProcessPort, fs: FsPort, reporter: Reporter): Promise<boolean> {
  reporter.section('blog quality check'); let passed = true;
  const run = async (label: string, command: string, args: string[], cwd: string) => {
    const result = await process.run(command, args, cwd);
    const failed = result.code !== 0;
    if (!failed) reporter.ok(label); else { passed = false; reporter.fail(label); reporter.info(result.stderr || result.stdout); }
  };
  // Rust gate replaces the retired Go gate; the workspace is expected to exist, and a missing one
  // is a failure (20) rather than a silent pass.
  if (await fs.exists(join(workspace.root, 'src', 'Cargo.toml'))) {
    await run('cargo fmt', 'cargo', ['fmt', '--all', '--check'], join(workspace.root, 'src'));
    await run('cargo clippy', 'cargo', ['clippy', '--workspace', '--all-targets', '--', '-D', 'warnings'], join(workspace.root, 'src'));
    await run('cargo test', 'cargo', ['test', '--workspace'], join(workspace.root, 'src'));
  } else {
    passed = false;
    reporter.fail('cargo workspace');
    reporter.info('未找到 Cargo.toml：Rust 门禁（cargo fmt / clippy / test）无法执行');
  }
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
  const frontendFiles = (await fs.files(workspace.web)).filter((file) => isProjectSource(file) && /\.(?:ts|tsx)$/.test(file));
  const rustRoot = join(workspace.root, 'src');
  const backendFiles = (await fs.files(rustRoot)).filter((file) => isProjectSource(file) && (file.endsWith('.rs') || file.endsWith('Cargo.toml')));
  const files = [...frontendFiles, ...backendFiles];
  // Read source through the injected port while keeping the domain rule pure.
  const sources = new Map<string, string>();
  for (const file of files) sources.set(file, await fs.read(file));
  const actual = checkArchitectureBoundaries(files, (f) => sources.get(f) ?? '');
  for (const violation of actual) { passed = false; reporter.fail(`${violation.file}: ${violation.message}`); }
  if (!actual.length) reporter.ok('architecture boundaries');
  return passed;
}
