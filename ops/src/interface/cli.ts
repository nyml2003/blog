#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveWorkspace } from '../domain/workspace.ts';
import { reflectCommandRegistry } from '../domain/commands.ts';
import { OpsError } from '../domain/errors.ts';
import { NodeProcess, NodeProcessSupervisor, ConsoleRuntimeLog, NodeSignals } from '../infrastructure/process.ts';
import { NodeFs } from '../infrastructure/fs.ts';
import { TcpPortProbe, TcpReadiness } from '../infrastructure/net.ts';
import { WorkspaceBinaries } from '../infrastructure/binaries.ts';
import { TerminalReporter } from '../infrastructure/reporter.ts';
import { commandDefinitions, groupDefinitions } from './registry.ts';
import { extractGlobalSwitches, parseCommandArgs } from './parser.ts';
import { renderCommandHelp } from './help.ts';

/** Exit codes are globally unified: 0 ok, 10 usage, 20 failure, 130 SIGINT, 143 SIGTERM. */
const EXIT_USAGE = 10;
const EXIT_FAILURE = 20;

/** Deleted commands keep pointing at their replacement instead of looking like a typo. */
const REMOVED_COMMAND_HINTS: Readonly<Record<string, string>> = {
  'runtime serve': 'ops runtime integration（原 serve 的"构建前端 + 后端挂载 web/dist"形态）',
  'database migrate': 'ops runtime backend 或 ops runtime integration（迁移在 Data Server 启动时自动执行）',
  database: 'ops runtime backend 或 ops runtime integration（迁移在 Data Server 启动时自动执行）',
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const workspace = resolveWorkspace(root);
const fs = new NodeFs();
const processPort = new NodeProcess();
const reporter = new TerminalReporter();
const registry = reflectCommandRegistry(commandDefinitions, groupDefinitions);

function knownPath(path: readonly string[]): boolean {
  return path.length === 0 || Boolean(registry.resolve(path)) || Boolean(registry.group(path));
}

function longestKnownPath(raw: readonly string[]): readonly string[] {
  for (let length = raw.length; length >= 0; length -= 1) {
    const candidate = raw.slice(0, length);
    if (knownPath(candidate)) return candidate;
  }
  return [];
}

function helpRequest(raw: readonly string[], hasHelpFlag: boolean): { path: readonly string[]; invalidOption?: string } | undefined {
  if (raw.length === 0) return { path: [] };

  const startsWithHelp = raw[0] === 'help';
  const endsWithHelp = !raw.includes('--') && raw[raw.length - 1] === 'help';
  if (!startsWithHelp && !hasHelpFlag && !endsWithHelp) return undefined;

  let path = [...raw];
  if (startsWithHelp) path = path.slice(1);
  if (endsWithHelp) path = path.slice(0, -1);
  path = path.filter((token) => token !== '--help');
  const invalidOption = path.find((token) => token.startsWith('-'));
  return { path, invalidOption };
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const previous = row[j]!;
      row[j] = left[i - 1] === right[j - 1]
        ? diagonal
        : Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + 1);
      diagonal = previous;
    }
  }
  return row[right.length]!;
}

function suggestPath(raw: readonly string[]): readonly string[] | undefined {
  const tokens = raw.filter((token) => !token.startsWith('-') && token !== 'help');
  const candidates = [
    ...registry.groupDefinitions.map((group) => [...group.meta.path]),
    ...registry.definitions.map((definition) => [...definition.meta.path]),
  ];
  const ranked = candidates
    .map((path) => ({ path, distance: editDistance(tokens.join(' '), path.join(' ')) }))
    .sort((left, right) => left.distance - right.distance || left.path.join(' ').localeCompare(right.path.join(' ')));
  const best = ranked[0];
  if (!best || best.distance > Math.max(2, tokens.join(' ').length / 3)) return undefined;
  return best.path;
}

function removedCommandHint(raw: readonly string[]): string | undefined {
  for (const [path, hint] of Object.entries(REMOVED_COMMAND_HINTS)) {
    const parts = path.split(' ');
    if (parts.every((part, index) => raw[index] === part)) return hint;
  }
  return undefined;
}

function usageError(message: string, helpPath: readonly string[], correction: string): number {
  reporter.fail(message);
  console.error(`如何修正: ${correction}`);
  console.error(`查看帮助: ops${helpPath.length ? ` ${helpPath.join(' ')}` : ''} --help`);
  console.log(renderCommandHelp(registry, helpPath));
  return EXIT_USAGE;
}

function selectCommand(raw: readonly string[]) {
  let selected = undefined;
  let selectedLength = 0;
  for (const definition of registry.definitions) {
    const path = definition.meta.path;
    if (path.every((part, index) => raw[index] === part) && path.length > selectedLength) {
      selected = definition;
      selectedLength = path.length;
    }
  }
  return { selected, selectedLength };
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  const globals = extractGlobalSwitches(args);
  if ('error' in globals) {
    return usageError(globals.error.message, longestKnownPath(args), 'switch 只接受 --name，不接受赋值');
  }
  const { raw, controls: { dryRun, json, help: hasHelpFlag } } = globals;
  const help = helpRequest(raw, hasHelpFlag);

  if (help) {
    if (help.invalidOption) {
      return usageError(`未知选项: ${help.invalidOption}`, longestKnownPath(help.path), `移除 ${help.invalidOption}，或使用已声明的选项`);
    }
    if (!knownPath(help.path)) {
      return unknownCommand(help.path);
    }
    console.log(renderCommandHelp(registry, help.path));
    return 0;
  }

  const group = raw.length > 0 && registry.group(raw);
  if (group) {
    console.log(renderCommandHelp(registry, raw));
    return 0;
  }

  const { selected, selectedLength } = selectCommand(raw);
  if (!selected) {
    return unknownCommand(raw);
  }

  // Route on global-free tokens, but parse original adjacency: a global switch cannot repair a missing value.
  const argumentStart = globals.indices[selectedLength - 1] + 1;
  const parsed = parseCommandArgs(selected.meta, args.slice(argumentStart));
  if ('error' in parsed) {
    return usageError(parsed.error.message, selected.meta.path, `检查参数后重试: ops ${selected.meta.path.join(' ')} --help`);
  }

  const supervisor = new NodeProcessSupervisor();
  const context = {
    workspace,
    process: processPort,
    supervisor,
    fs,
    reporter,
    log: new ConsoleRuntimeLog(json),
    probe: new TcpPortProbe(),
    readiness: new TcpReadiness(),
    binaries: new WorkspaceBinaries(fs, workspace.root),
    signals: new NodeSignals(),
    environment: process.env,
    dryRun,
    json,
  };
  try {
    return await selected.handler(context, parsed.args);
  } catch (error) {
    if (error instanceof OpsError && error.code === 'USAGE') {
      return usageError(error.message, selected.meta.path, `检查参数后重试: ops ${selected.meta.path.join(' ')} --help`);
    }
    throw error;
  }
}

function unknownCommand(raw: readonly string[]): number {
  const hint = removedCommandHint(raw);
  if (hint) {
    return usageError(`命令已删除: ${raw.filter((token) => !token.startsWith('-')).join(' ')}`, longestKnownPath(raw), `迁移到 ${hint}`);
  }
  const suggestion = suggestPath(raw);
  const helpPath = suggestion ?? longestKnownPath(raw);
  const correction = suggestion ? `尝试: ops ${suggestion.join(' ')}` : '从 ops help 查看可用命令';
  return usageError(`未知命令: ${raw.join(' ')}`, helpPath, correction);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => { console.error(error); process.exitCode = EXIT_FAILURE; });
}
