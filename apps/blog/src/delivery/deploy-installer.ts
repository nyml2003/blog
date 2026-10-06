import { join } from 'node:path';
import { err, ok, type Result } from '@fluvient/core';
import { effectFailure, reversibleEffect, reportPlan, type EffectFailure } from '@fluvient-cli/cli-kit/effects.ts';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from '@fluvient-cli/cli-kit/errors.ts';
import type { DeployPorts } from './deploy-package.ts';

// 与 deploy-package 保持一致:失败输出保留足够长度,避免截断吞掉关键错误行。
const FAILURE_DETAIL_CHARS = 12_000;

function reportFailureDetail(ports: DeployPorts, output: string): void {
  const detail = output.trim();
  if (!detail) return;
  for (const line of detail.slice(-FAILURE_DETAIL_CHARS).split('\n')) {
    ports.reporter.info(line);
  }
}

/** 把服务器安装器打包成单文件 mjs(esbuild 走 nix,不改仓库依赖)。 */
export async function runDeployInstaller(ports: DeployPorts): Promise<number> {
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
      return EXIT_USAGE;
    }
    args.push(`--define:__BLOG_DEPLOY_RELEASE_VERSION__=${JSON.stringify(releaseVersion)}`);
  }

  // 显式 `Promise<void>` 注解表明端口方法没有可读的返回值。
  const ensureDirectory = (path: string): Promise<void> => ports.fs.mkdir(path);
  const pack = reversibleEffect<void, EffectFailure>({
    describe: () => ({ summary: `nix ${args.join(' ')}` }),
    execute: async (): Promise<Result<void, EffectFailure>> => {
      await ensureDirectory(join(ports.root, 'deploy', 'dist'));
      const build = await ports.process.run('nix', args, ports.root);
      if (build.code !== 0) {
        ports.reporter.fail(`installer 打包失败(exit ${build.code})`);
        reportFailureDetail(ports, build.stderr || build.stdout);
        return err(effectFailure(`installer 打包失败(exit ${build.code})`));
      }
      const smoke = await ports.process.run('node', [output, '--help'], ports.root);
      if (smoke.code !== 0) {
        ports.reporter.fail(`installer --help 冒烟失败(exit ${smoke.code})`);
        reportFailureDetail(ports, smoke.stderr || smoke.stdout);
        return err(effectFailure(`installer --help 冒烟失败(exit ${smoke.code})`));
      }
      ports.reporter.ok(`安装器已生成:${output}`);
      return ok(undefined);
    },
  });

  const packed = await ports.effects.run(pack, undefined);
  if (!packed.ok) return EXIT_FAILURE;
  reportPlan(ports.effects, ports.reporter);
  return EXIT_OK;
}
