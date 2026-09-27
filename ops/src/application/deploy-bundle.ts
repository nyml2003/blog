import { join } from 'node:path';
import type { DeployPorts } from './deploy-package.ts';

/** 把 ops CLI 打成单文件 JS,便于在任意有 Node 的机器执行(esbuild 走 nix,不改仓库依赖)。 */
export async function runDeployBundle(ports: DeployPorts, options: { dryRun: boolean }): Promise<number> {
  const entry = join(ports.root, 'ops', 'src', 'interface', 'cli.ts');
  const output = join(ports.root, 'deploy', 'dist', 'blog-deploy.mjs');
  const args = [
    'run',
    'nixpkgs#esbuild',
    '--',
    entry,
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node22',
    `--outfile=${output}`,
  ];
  if (options.dryRun) {
    ports.reporter.info(`nix ${args.join(' ')}`);
    return 0;
  }
  await ports.fs.mkdir(join(ports.root, 'deploy', 'dist'));
  const result = await ports.process.run('nix', args, ports.root);
  if (result.code !== 0) {
    ports.reporter.fail(`bundle 失败(exit ${result.code})`);
    ports.reporter.info((result.stderr || result.stdout).trim().slice(-2000));
    return 20;
  }
  ports.reporter.ok(`单文件脚本已生成:${output}`);
  return 0;
}
