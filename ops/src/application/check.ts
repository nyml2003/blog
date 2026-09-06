import { join } from 'node:path';
import type { FsPort, ProcessPort, Reporter } from '../domain/ports.ts';
import type { Workspace } from '../domain/workspace.ts';
import { checkWebBoundaries } from '../domain/architecture.ts';
export async function runCheck(workspace: Workspace, process: ProcessPort, fs: FsPort, reporter: Reporter): Promise<boolean> {
  reporter.section('ops quality check'); let passed = true;
  const run = async (label: string, command: string, args: string[], cwd: string, outputFailure = false) => {
    const result = await process.run(command, args, cwd);
    const failed = result.code !== 0 || (outputFailure && result.stdout.trim().length > 0);
    if (!failed) reporter.ok(label); else { passed = false; reporter.fail(label); reporter.info(result.stderr || result.stdout); }
  };
  // Rust gate replaces the retired Go gate; the workspace is expected to exist, and a missing one
  // is a failure (20) rather than a silent pass.
  if (await fs.exists(join(workspace.root, 'Cargo.toml'))) {
    await run('cargo fmt', 'cargo', ['fmt', '--all', '--check'], workspace.root);
    await run('cargo clippy', 'cargo', ['clippy', '--workspace', '--all-targets', '--', '-D', 'warnings'], workspace.root);
    await run('cargo test', 'cargo', ['test', '--workspace'], workspace.root);
  } else {
    passed = false;
    reporter.fail('cargo workspace');
    reporter.info('未找到 Cargo.toml：Rust 门禁（cargo fmt / clippy / test）无法执行');
  }
  const opsFiles = (await fs.files(workspace.ops)).filter((f) => f.endsWith('.ts'));
  for (const file of opsFiles) await run(`ops syntax: ${file.replace(`${workspace.root}/`, '')}`, 'node', ['--experimental-strip-types', '--check', file], workspace.root);
  const opTests = opsFiles.filter((f) => f.endsWith('.test.ts'));
  if (opTests.length) await run('ops contract tests', 'node', ['--experimental-strip-types', '--test', ...opTests], workspace.root);
  if (await fs.exists(`${workspace.web}/package.json`)) {
    await run('pnpm typecheck', 'pnpm', ['--filter', 'blog-web', 'run', 'typecheck'], workspace.root);
    await run('pnpm lint', 'pnpm', ['--filter', 'blog-web', 'run', 'lint'], workspace.root);
    await run('pnpm format:check', 'pnpm', ['--filter', 'blog-web', 'run', 'format:check'], workspace.root);
    await run('pnpm build', 'pnpm', ['--filter', 'blog-web', 'run', 'build'], workspace.root);
  }
  const files = (await fs.files(workspace.web)).filter((f) => /\.(ts|tsx)$/.test(f));
  // Read source through the injected port while keeping the domain rule pure.
  const sources = new Map<string, string>();
  for (const file of files) sources.set(file, await fs.read(file));
  const actual = checkWebBoundaries(files, (f) => sources.get(f) ?? '');
  for (const violation of actual) { passed = false; reporter.fail(`${violation.file}: ${violation.message}`); }
  if (!actual.length) reporter.ok('web dependency boundaries');
  return passed;
}
