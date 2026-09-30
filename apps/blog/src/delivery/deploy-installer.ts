import { join } from 'node:path';
import type { DeployPorts } from './deploy-package.ts';

/** 把服务器安装器打包成单文件 mjs(esbuild 走 nix,不改仓库依赖)。 */
export async function runDeployInstaller(ports: DeployPorts, options: { dryRun: boolean }): Promise<number> {
  const entry = join(ports.root, 'apps', 'blog-deploy', 'src', 'main.ts');
  const output = join(ports.root, 'deploy', 'dist', 'blog-deploy.mjs');
  const args = [
    'run',
    'nixpkgs#esbuild',
    '--',
    entry,
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node18',
    `--outfile=${output}`,
  ];
  const releaseVersion = process.env.BLOG_DEPLOY_RELEASE_VERSION;
  if (releaseVersion !== undefined) {
    if (!/^\d+\.\d+\.\d+$/.test(releaseVersion)) {
      ports.reporter.fail(`installer 版本非法:${releaseVersion}`);
      return 10;
    }
    args.push(`--define:__BLOG_DEPLOY_RELEASE_VERSION__=${JSON.stringify(releaseVersion)}`);
  }
  if (options.dryRun) {
    ports.reporter.info(`nix ${args.join(' ')}`);
    return 0;
  }
  await ports.fs.mkdir(join(ports.root, 'deploy', 'dist'));
  const build = await ports.process.run('nix', args, ports.root);
  if (build.code !== 0) {
    ports.reporter.fail(`installer 打包失败(exit ${build.code})`);
    ports.reporter.info((build.stderr || build.stdout).trim().slice(-2000));
    return 20;
  }
  const smoke = await ports.process.run('node', [output, '--help'], ports.root);
  if (smoke.code !== 0) {
    ports.reporter.fail(`installer --help 冒烟失败(exit ${smoke.code})`);
    ports.reporter.info((smoke.stderr || smoke.stdout).trim().slice(-2000));
    return 20;
  }
  ports.reporter.ok(`安装器已生成:${output}`);
  return 0;
}
