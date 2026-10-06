import type { ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { EffectPort } from '@fluvient-cli/cli-kit/effects.ts';
import { processStepEffect, reportPlan } from '@fluvient-cli/cli-kit/effects.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';

// 与 quality/commands.ts 的 runWebQuality 同构：包装
// pnpm -C src/frontend run page:check（校验器 + site-routes.json 生成比对），
// 校验器实现位于 src/frontend/page-registry/，三入口（vite 配置加载期 /
// 本命令 / 前端测试守卫）共用同一实现。
export async function runPageCheck(
  workspace: Workspace,
  process: ProcessPort,
  reporter: Reporter,
  effects: EffectPort,
): Promise<boolean> {
  reporter.section('ops page check');
  const step = { label: 'pnpm page:check', command: 'pnpm', args: ['-C', 'src/frontend', 'run', 'page:check'], cwd: workspace.root };
  const result = await effects.run(processStepEffect({ process, reporter }, step, 'pnpm -C src/frontend run page:check'), undefined);
  reportPlan(effects, reporter);
  return result.ok;
}
