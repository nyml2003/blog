import { defineCommand, reflectCommandRegistry, type CommandDefinition, type CommandMeta } from '../../framework/commands.ts';

export const initMeta = {
  path: ['init'],
  summary: '初始化服务器配置',
  description: '生成 /etc/blog 目录与 blog.json(0600),打印待办清单。',
  options: [
    { name: 'config', description: '配置文件路径', model: { kind: 'path' as const }, optional: true },
    { name: 'force', description: '覆盖已有配置文件', model: { kind: 'switch' as const } },
  ],
  examples: ['node blog-deploy.mjs init', 'node blog-deploy.mjs init --force'],
  exitCodes: [{ code: 0, meaning: '配置生成成功' }, { code: 10, meaning: '参数或配置错误' }],
} satisfies CommandMeta;

export const deployMeta = {
  path: ['deploy'],
  summary: '首次部署服务器',
  description: '从最新稳定 build-v* Release 下载对应架构发布包,校验后安装并重启。',
  options: [{ name: 'config', description: '配置文件路径', model: { kind: 'path' as const }, optional: true }],
  examples: ['node blog-deploy.mjs deploy', 'node blog-deploy.mjs deploy --dry-run'],
  exitCodes: [{ code: 0, meaning: '部署成功或 dry-run 完成' }, { code: 10, meaning: '参数或配置错误' }, { code: 20, meaning: '部署执行失败' }],
} satisfies CommandMeta;

export const redeployMeta = {
  ...deployMeta,
  path: ['redeploy'],
  summary: '幂等更新服务器',
  examples: ['node blog-deploy.mjs redeploy', 'node blog-deploy.mjs redeploy --dry-run'],
} satisfies CommandMeta;

export const installerDefinitions: readonly CommandDefinition[] = [
  defineCommand(initMeta, () => 0),
  defineCommand(deployMeta, () => 0),
  defineCommand(redeployMeta, () => 0),
];

export const installerRegistry = reflectCommandRegistry(installerDefinitions);
