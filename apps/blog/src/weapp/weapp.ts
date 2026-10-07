import type { EffectPort } from '@fluvient-cli/cli-kit/effects.ts';
import { processStepEffect, reportPlan } from '@fluvient-cli/cli-kit/effects.ts';
import type { ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';

export async function runWeapp(
  workspace: Workspace,
  process: ProcessPort,
  reporter: Reporter,
  effects: EffectPort,
  check: boolean,
): Promise<boolean> {
  const task = check ? 'check' : 'build';
  reporter.section(`ops weapp ${task}`);
  const result = await effects.run(
    processStepEffect({ process, reporter }, {
      label: `weapp ${task}`,
      command: 'node',
      args: [`${workspace.root}/apps/weapp/build.mjs`, ...(check ? ['--check'] : [])],
      cwd: workspace.root,
    }, `node apps/weapp/build.mjs${check ? ' --check' : ''}`),
    undefined,
  );
  if (result.ok && check) {
    const typecheck = await effects.run(
      processStepEffect({ process, reporter }, {
        label: 'weapp typecheck',
        command: 'pnpm',
        args: ['exec', 'tsc', '--noEmit', '-p', 'apps/weapp/tsconfig.json'],
        cwd: workspace.root,
      }, 'pnpm exec tsc --noEmit -p apps/weapp/tsconfig.json'),
      undefined,
    );
    if (!typecheck.ok) return false;
  }
  reportPlan(effects, reporter);
  return result.ok;
}
