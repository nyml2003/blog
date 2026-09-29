#!/usr/bin/env node
import { OpsError } from './errors.ts';
import type { CommandContext, CommandDefinition, GroupDefinition } from './commands.ts';
import type { Reporter } from './ports.ts';
import { extractGlobalSwitches, parseCommandArgs } from './parser.ts';
import { renderCommandHelp } from './help.ts';

/** Exit codes are globally unified: 0 ok, 10 usage, 20 failure, 130 SIGINT, 143 SIGTERM. */
const EXIT_USAGE = 10;

/** Deleted commands keep pointing at their replacement instead of looking like a typo. */
const REMOVED_COMMAND_HINTS: Readonly<Record<string, string>> = {
  'runtime serve': 'ops runtime integration（原 serve 的"构建前端 + 后端挂载 web/dist"形态）',
  'database migrate': 'ops runtime backend 或 ops runtime integration（迁移在 Data Server 启动时自动执行）',
  database: 'ops runtime backend 或 ops runtime integration（迁移在 Data Server 启动时自动执行）',
};

export interface RunnerRegistry {
  readonly definitions: readonly CommandDefinition[];
  readonly groupDefinitions: readonly GroupDefinition[];
  resolve(path: readonly string[]): CommandDefinition | undefined;
  group(path: readonly string[]): GroupDefinition | undefined;
}

export interface RunnerDependencies {
  readonly registry: RunnerRegistry;
  readonly reporter: Reporter;
  createContext(dryRun: boolean, json: boolean): CommandContext;
}

function knownPath(path: readonly string[], registry: RunnerRegistry): boolean {
  return path.length === 0 || Boolean(registry.resolve(path)) || Boolean(registry.group(path));
}

function longestKnownPath(raw: readonly string[], registry: RunnerRegistry): readonly string[] {
  for (let length = raw.length; length >= 0; length -= 1) {
    const candidate = raw.slice(0, length);
    if (knownPath(candidate, registry)) return candidate;
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

function suggestPath(raw: readonly string[], registry: RunnerRegistry): readonly string[] | undefined {
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

function usageError(message: string, helpPath: readonly string[], correction: string, dependencies: RunnerDependencies): number {
  dependencies.reporter.fail(message);
  console.error(`如何修正: ${correction}`);
  console.error(`查看帮助: ops${helpPath.length ? ` ${helpPath.join(' ')}` : ''} --help`);
  console.log(renderCommandHelp(dependencies.registry, helpPath));
  return EXIT_USAGE;
}

function selectCommand(raw: readonly string[], registry: RunnerRegistry) {
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

export async function runCli(args: readonly string[], dependencies: RunnerDependencies): Promise<number> {
  const { registry } = dependencies;
  const globals = extractGlobalSwitches(args);
  if ('error' in globals) {
    return usageError(globals.error.message, longestKnownPath(args, registry), 'switch 只接受 --name，不接受赋值', dependencies);
  }
  const { raw, controls: { dryRun, json, help: hasHelpFlag } } = globals;
  const help = helpRequest(raw, hasHelpFlag);

  if (help) {
    if (help.invalidOption) {
      return usageError(`未知选项: ${help.invalidOption}`, longestKnownPath(help.path, registry), `移除 ${help.invalidOption}，或使用已声明的选项`, dependencies);
    }
    if (!knownPath(help.path, registry)) {
      return unknownCommand(help.path, dependencies);
    }
    console.log(renderCommandHelp(registry, help.path));
    return 0;
  }

  const group = raw.length > 0 && registry.group(raw);
  if (group) {
    console.log(renderCommandHelp(registry, raw));
    return 0;
  }

  const { selected, selectedLength } = selectCommand(raw, registry);
  if (!selected) {
    return unknownCommand(raw, dependencies);
  }

  // Route on global-free tokens, but parse original adjacency: a global switch cannot repair a missing value.
  const argumentStart = globals.indices[selectedLength - 1] + 1;
  const parsed = parseCommandArgs(selected.meta, args.slice(argumentStart));
  if ('error' in parsed) {
    return usageError(parsed.error.message, selected.meta.path, `检查参数后重试: ops ${selected.meta.path.join(' ')} --help`, dependencies);
  }

  const context = dependencies.createContext(dryRun, json);
  try {
    return await selected.handler(context, parsed.args);
  } catch (error) {
    if (error instanceof OpsError && error.code === 'USAGE') {
      return usageError(error.message, selected.meta.path, `检查参数后重试: ops ${selected.meta.path.join(' ')} --help`, dependencies);
    }
    throw error;
  }
}

function unknownCommand(raw: readonly string[], dependencies: RunnerDependencies): number {
  const { registry } = dependencies;
  const hint = removedCommandHint(raw);
  if (hint) {
    return usageError(`命令已删除: ${raw.filter((token) => !token.startsWith('-')).join(' ')}`, longestKnownPath(raw, registry), `迁移到 ${hint}`, dependencies);
  }
  const suggestion = suggestPath(raw, registry);
  const helpPath = suggestion ?? longestKnownPath(raw, registry);
  const correction = suggestion ? `尝试: ops ${suggestion.join(' ')}` : '从 ops help 查看可用命令';
  return usageError(`未知命令: ${raw.join(' ')}`, helpPath, correction, dependencies);
}
