import type { ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';

export const PAGE_PLATFORMS = ['mobile', 'desktop'] as const;
export type PagePlatformOption = (typeof PAGE_PLATFORMS)[number];

// 包装 pnpm -C src/frontend run page:new（脚手架 CLI 在
// src/frontend/page-registry/scaffold-new.ts，模板与校验先行的逻辑同源）。
export async function runPageNew(
  spec: { readonly platform: PagePlatformOption; readonly id: string; readonly title: string; readonly alias: string },
  workspace: Workspace,
  process: ProcessPort,
  reporter: Reporter,
  flags: { readonly dryRun: boolean },
): Promise<boolean> {
  reporter.section('ops page new');
  const args = ['-C', 'src/frontend', 'run', 'page:new', '--', '--platform', spec.platform, '--id', spec.id, '--title', spec.title, '--alias', spec.alias];
  if (flags.dryRun) {
    reporter.info(`pnpm ${args.join(' ')}`);
    return true;
  }
  const label = 'pnpm page:new';
  const result = await process.run('pnpm', args, workspace.root);
  if (result.code !== 0) {
    reporter.fail(label);
    reporter.info(result.stderr || result.stdout);
    return false;
  }
  reporter.ok(label);
  reporter.info(result.stdout);
  return true;
}
