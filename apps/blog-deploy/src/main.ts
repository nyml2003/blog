#!/usr/bin/env node
import packageInfo from '../package.json' with { type: 'json' };
import { createCliApp, isEntry, runEntry } from '@fluvient-cli/cli-kit/index.ts';
import { corePlugin } from '@fluvient-cli/cli-core/plugin.ts';
import { dryRunPlugin, jsonPlugin, usagePlugin, versionPlugin } from '@fluvient-cli/cli-plugins';
import { installerPlugin } from './plugin.ts';
import type { FetchLike } from './installer/release.ts';

const installerWorkspace = {
  root: '/etc/blog',
  web: '/var/lib/blog/web',
  apps: '/var/lib/blog',
  appSource: '/etc/blog',
  appTests: '/etc/blog',
} as const;


export function createApp(fetchImpl: FetchLike = globalThis.fetch): ReturnType<typeof createCliApp> {
  return createCliApp({
    name: 'blog-deploy',
    description: '博客服务器安装器',
    version: packageInfo.version,
    entry: import.meta.url,
    plugins: [corePlugin({ workspace: installerWorkspace }), usagePlugin({ noCommandExit: 10 }), versionPlugin(), dryRunPlugin(), jsonPlugin(), installerPlugin(fetchImpl)],
  });
}

export async function main(argv: readonly string[] = process.argv.slice(2), fetchImpl: FetchLike = globalThis.fetch): Promise<number> {
  return createApp(fetchImpl).run(argv);
}

if (isEntry(import.meta.url)) runEntry(main);
