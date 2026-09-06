import type { ProcessPort, Reporter } from '../domain/ports.ts';
import type { Workspace } from '../domain/workspace.ts';
export async function runWebQuality(workspace: Workspace, process: ProcessPort, reporter: Reporter, task: 'lint' | 'format' | 'format:check'): Promise<boolean> {
  const script = task;
  const label = `pnpm ${task}`;
  reporter.section(`ops quality ${task}`);
  const result = await process.run('pnpm', ['-C', 'src/frontend', 'run', script], workspace.root);
  if (result.code !== 0) { reporter.fail(label); reporter.info(result.stderr || result.stdout); return false; }
  reporter.ok(label);
  return true;
}
