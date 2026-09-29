#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { ParsedArgs } from '../framework/commands.ts';
import { extractGlobalSwitches, parseCommandArgs } from '../framework/parser.ts';
import { renderCommandHelp } from '../framework/help.ts';
import { runInstallerCommand } from '../commands/installer/main.ts';
import type { FetchLike } from '../commands/installer/release.ts';
import { deployMeta, initMeta, installerRegistry, redeployMeta } from '../commands/installer/registry.ts';

const EXIT_USAGE = 10;
const EXIT_FAILURE = 20;

const registry = installerRegistry;

function usage(): string {
  return [
    'blog-deploy - 博客服务器安装器',
    '',
    '用法:',
    '  node blog-deploy.mjs init [--config <path>] [--force]',
    '  node blog-deploy.mjs deploy|redeploy [--config <path>] [--dry-run]',
    '',
    '说明:',
    '  buildTag 固定从 blog.json 读取 latest。',
    '  --dry-run 只展示计划,不下载、不安装。',
    '  --config 默认 /etc/blog/blog.json。',
  ].join('\n');
}

function printUsageError(message: string, command?: string): number {
  console.error(message);
  console.error(usage());
  if (command && registry.resolve([command])) console.log(renderCommandHelp(registry, [command]));
  return EXIT_USAGE;
}

function normalizeAliases(argv: readonly string[]): string[] {
  return argv.map((token) => token === '-h' || token === 'help' ? '--help' : token);
}

function commandFrom(raw: readonly string[]): string | undefined {
  const command = raw[0];
  return command && registry.resolve([command]) ? command : undefined;
}

type InstallerArgs = ParsedArgs<typeof initMeta> | ParsedArgs<typeof deployMeta> | ParsedArgs<typeof redeployMeta>;

function parseInstallerArgs(command: string, raw: readonly string[]) {
  if (command === 'init') return parseCommandArgs(initMeta, raw);
  if (command === 'deploy') return parseCommandArgs(deployMeta, raw);
  return parseCommandArgs(redeployMeta, raw);
}

function installerOptions(commandArgs: InstallerArgs, dryRun: boolean) {
  return {
    configFile: commandArgs.config,
    dryRun,
    force: 'force' in commandArgs && commandArgs.force === true,
  };
}

export async function main(argv: readonly string[] = process.argv.slice(2), fetchImpl?: FetchLike): Promise<number> {
  const globals = extractGlobalSwitches(normalizeAliases(argv));
  if ('error' in globals) return printUsageError(globals.error.message);
  const { raw, controls } = globals;
  const helpRequested = controls.help;
  if (raw[0] === '--help' || raw.length === 0 && helpRequested) {
    console.log(usage());
    return 0;
  }
  const command = commandFrom(raw);
  if (!command) return helpRequested ? printUsageError(`未知命令: ${raw.join(' ')}`) : printUsageError('必须指定命令:init、deploy 或 redeploy');
  if (helpRequested) {
    console.log(renderCommandHelp(registry, [command]));
    return 0;
  }
  const parsed = parseInstallerArgs(command, raw.slice(1));
  if ('error' in parsed) return printUsageError(parsed.error.message, command);
  try {
    return await runInstallerCommand(command, installerOptions(parsed.args, controls.dryRun), fetchImpl ?? globalThis.fetch);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return EXIT_FAILURE;
  }
}

const entry = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(entry)) {
  main().then((code) => { process.exitCode = code; }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = EXIT_FAILURE;
  });
}
