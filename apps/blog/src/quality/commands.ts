import type { ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { EffectPort } from '@fluvient-cli/cli-kit/effects.ts';
import { processStepEffect, reportPlan } from '@fluvient-cli/cli-kit/effects.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';

export async function runWebQuality(workspace: Workspace, process: ProcessPort, reporter: Reporter, effects: EffectPort, task: 'lint' | 'format' | 'format:check'): Promise<boolean> {
  const label = `pnpm ${task}`;
  reporter.section(`ops quality ${task}`);
  const step = { label, command: 'pnpm', args: ['-C', 'src/frontend', 'run', task], cwd: workspace.root };
  const result = await effects.run(processStepEffect({ process, reporter }, step, `pnpm -C src/frontend run ${task}`), undefined);
  reportPlan(effects, reporter);
  return result.ok;
}
