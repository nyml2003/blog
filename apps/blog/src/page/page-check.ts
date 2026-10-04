import type { ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';

// 与 quality/commands.ts 的 runWebQuality 同构：包装
// pnpm -C src/frontend run page:check（校验器 + site-routes.json 生成比对），
// 校验器实现位于 src/frontend/page-registry/，三入口（vite 配置加载期 /
// 本命令 / 前端测试守卫）共用同一实现。
export async function runPageCheck(
  workspace: Workspace,
  process: ProcessPort,
  reporter: Reporter,
  options: { readonly dryRun: boolean },
): Promise<boolean> {
  reporter.section('ops page check');
  if (options.dryRun) {
    reporter.info('pnpm -C src/frontend run page:check');
    return true;
  }
  const label = 'pnpm page:check';
  const result = await process.run('pnpm', ['-C', 'src/frontend', 'run', 'page:check'], workspace.root);
  if (result.code !== 0) {
    reporter.fail(label);
    reporter.info(result.stderr || result.stdout);
    return false;
  }
  reporter.ok(label);
  return true;
}
