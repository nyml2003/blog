import { defineCommand, reflectCommandRegistry, type CommandDefinition, type CommandMeta } from '@fluvient-cli/cli-kit/commands.ts';
import type { OutputPort } from '@fluvient-cli/cli-kit/output.ts';
import type { InstallerDeps, InstallerOptions, InstallerOutcome } from './main.ts';
import { createReporter } from './reporter.ts';
import { err, ok, type Result } from '@fluvient/core';
import { EXIT_OK, EXIT_USAGE, type OpsFailure } from '@fluvient-cli/cli-kit/errors.ts';

export const initMeta = {
  path: ['init'],
  summary: '初始化服务器配置',
  description: '生成 /etc/blog 目录与 blog.json(0600),打印待办清单。',
  options: [
    { name: 'config', description: '配置文件路径', model: { kind: 'path' as const }, optional: true },
    { name: 'force', description: '覆盖已有配置文件', model: { kind: 'switch' as const } },
  ],
  examples: ['node blog-deploy.mjs init', 'node blog-deploy.mjs init --force'],
  exitCodes: [{ code: EXIT_OK, meaning: '配置生成成功' }, { code: EXIT_USAGE, meaning: '参数或配置错误' }],
} satisfies CommandMeta;

export const deployMeta = {
  path: ['deploy'],
  summary: '首次部署服务器',
  description: '网络预检(DNS/TLS/Release API/资产可达)通过后,从最新稳定 build-v* Release 流式下载对应架构发布包,校验 SHA256SUMS 后安装并重启;下载带进度与有限重试。',
  options: [{ name: 'config', description: '配置文件路径', model: { kind: 'path' as const }, optional: true }],
  examples: ['node blog-deploy.mjs deploy', 'node blog-deploy.mjs deploy --dry-run'],
  exitCodes: [
    { code: 0, meaning: '部署成功或 dry-run 预检完成' },
    { code: 10, meaning: '参数或配置错误' },
    { code: 20, meaning: '预检失败/下载失败/校验失败/部署执行失败' },
  ],
} satisfies CommandMeta;

export const redeployMeta = {
  ...deployMeta,
  path: ['redeploy'],
  summary: '幂等更新服务器',
  examples: ['node blog-deploy.mjs redeploy', 'node blog-deploy.mjs redeploy --dry-run'],
} satisfies CommandMeta;

export const selfUpdateMeta = {
  path: ['self-update'],
  summary: '更新安装器自身',
  description: '网络预检通过后,从最新稳定 script-v* Release 下载安装器与 SHA256SUMS,校验并原子替换当前安装器,不会重启业务服务。',
  options: [],
  examples: ['node blog-deploy.mjs self-update', 'node blog-deploy.mjs self-update --dry-run'],
  exitCodes: [
    { code: 0, meaning: '已是最新或更新成功' },
    { code: 10, meaning: '权限或参数错误' },
    { code: 20, meaning: '预检失败/下载失败/校验失败/回滚失败' },
    { code: 30, meaning: '已有更新进程运行' },
  ],
} satisfies CommandMeta;

export type InstallerRunner = (command: string, options: InstallerOptions, deps: InstallerDeps) => Promise<InstallerOutcome>;

function installerResult(run: Promise<InstallerOutcome>): Promise<Result<{ readonly exitCode?: number }, OpsFailure>> {
  return run.then((outcome) =>
    outcome.exitCode === EXIT_OK
      ? ok({ exitCode: outcome.exitCode })
      : err({
          code: outcome.code ?? (outcome.exitCode === EXIT_USAGE ? 'USAGE' : 'EXTERNAL_COMMAND_FAILED'),
          message: outcome.message ?? 'installer command failed',
          details: outcome.retryable === undefined ? [] : [{ retryable: outcome.retryable }],
          exitCode: outcome.exitCode,
        }),
  );
}

function depsOf(context: { readonly output: OutputPort; readonly json: boolean }, kernel: InstallerDeps['kernel']): InstallerDeps {
  return {
    kernel,
    reporter: createReporter({ output: context.output, json: context.json, tty: process.stdout.isTTY === true }),
  };
}

export function installerDefinitions(kernel: InstallerDeps['kernel'], run: InstallerRunner): readonly CommandDefinition[] {
  return [
    defineCommand(initMeta, (context, args) => installerResult(run('init', { configFile: args.config, dryRun: context.dryRun, force: args.force }, depsOf(context, kernel)))),
    defineCommand(deployMeta, (context, args) => installerResult(run('deploy', { configFile: args.config, dryRun: context.dryRun, force: false }, depsOf(context, kernel)))),
    defineCommand(redeployMeta, (context, args) => installerResult(run('redeploy', { configFile: args.config, dryRun: context.dryRun, force: false }, depsOf(context, kernel)))),
    defineCommand(selfUpdateMeta, (context) => installerResult(run('self-update', { dryRun: context.dryRun, force: false }, depsOf(context, kernel)))),
  ];
}

export function installerRegistry(kernel: InstallerDeps['kernel'], run: InstallerRunner) {
  return reflectCommandRegistry(installerDefinitions(kernel, run));
}
