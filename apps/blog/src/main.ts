#!/usr/bin/env node
import packageInfo from '../package.json' with { type: 'json' };
import { createCliApp, isEntry, runEntry } from '@fluvient-cli/cli-kit/index.ts';
import { corePlugin } from '@fluvient-cli/cli-core/plugin.ts';
import { dryRunPlugin, jsonPlugin, usagePlugin, versionPlugin } from '@fluvient-cli/cli-plugins';
import { blogPlugin, blogUnknownCommand } from './plugin.ts';

export { commandDefinitions, groupDefinitions } from './registry.ts';


const app = createCliApp({
  name: 'ops',
  description: '博客开发工具链',
  version: packageInfo.version,
  entry: import.meta.url,
  plugins: [corePlugin(), usagePlugin({ unknownCommand: blogUnknownCommand }), versionPlugin(), dryRunPlugin(), jsonPlugin(), blogPlugin()],
});

export const main = (args?: readonly string[]) => app.run(args);

if (isEntry(import.meta.url)) runEntry(main);
