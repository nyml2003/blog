import { EXIT_USAGE, OpsError } from './errors.ts';
import type { CommandArgs, CommandContext, CommandDefinition, GroupDefinition } from './commands.ts';
import type { ParameterSpec } from './parameters.ts';
import type { Reporter } from './ports.ts';
import { extractGlobalSwitches, parseCommandArgs } from './parser.ts';

export interface RunnerRegistry {
  readonly definitions: readonly CommandDefinition[];
  readonly groupDefinitions: readonly GroupDefinition[];
  resolve(path: readonly string[]): CommandDefinition | undefined;
  group(path: readonly string[]): GroupDefinition | undefined;
}

export interface RunnerEvent {
  readonly appName: string;
  readonly appVersion: string;
  readonly args: readonly string[];
  readonly raw: readonly string[];
  readonly path: readonly string[];
  readonly globals: CommandArgs;
  readonly registry: RunnerRegistry;
  readonly reporter: Reporter;
  readonly globalOptions: readonly ParameterSpec[];
}

export interface RunnerHooks {
  readonly transformArgs?: (args: readonly string[]) => readonly string[];
  readonly beforeRun?: (event: RunnerEvent) => Promise<number | undefined> | number | undefined;
  readonly onUnknownCommand?: (event: RunnerEvent) => Promise<number | undefined> | number | undefined;
  readonly onUsageError?: (event: RunnerEvent & { readonly message: string; readonly command?: readonly string[] }) => Promise<number | undefined> | number | undefined;
}

export interface RunnerDependencies {
  readonly appName: string;
  readonly appVersion: string;
  readonly registry: RunnerRegistry;
  readonly reporter: Reporter;
  readonly globalOptions: readonly ParameterSpec[];
  readonly hooks?: RunnerHooks;
  createContext(globals: CommandArgs): CommandContext;
}

function selectCommand(raw: readonly string[], registry: RunnerRegistry) {
  let selected: CommandDefinition | undefined;
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

async function reportUsageError(message: string, path: readonly string[], args: readonly string[], globals: CommandArgs, dependencies: RunnerDependencies): Promise<number> {
  dependencies.reporter.fail(message);
  const handled = await dependencies.hooks?.onUsageError?.({
    appName: dependencies.appName,
    appVersion: dependencies.appVersion,
    args,
    raw: args,
    path,
    globals,
    registry: dependencies.registry,
    reporter: dependencies.reporter,
    globalOptions: dependencies.globalOptions,
    message,
    command: path,
  });
  return handled ?? EXIT_USAGE;
}

export async function runCli(args: readonly string[], dependencies: RunnerDependencies): Promise<number> {
  const transformed = dependencies.hooks?.transformArgs?.(args) ?? args;
  const globalsResult = extractGlobalSwitches(transformed, dependencies.globalOptions);
  if ('error' in globalsResult) return reportUsageError(globalsResult.error.message, [], transformed, {}, dependencies);
  const { raw, values: globals } = globalsResult;
  const event: RunnerEvent = {
    appName: dependencies.appName,
    appVersion: dependencies.appVersion,
    args: transformed,
    raw,
    path: raw,
    globals,
    registry: dependencies.registry,
    reporter: dependencies.reporter,
    globalOptions: dependencies.globalOptions,
  };
  const beforeRun = await dependencies.hooks?.beforeRun?.(event);
  if (beforeRun !== undefined) return beforeRun;
  const group = raw.length > 0 && dependencies.registry.group(raw);
  if (group || raw.length === 0) return (await dependencies.hooks?.beforeRun?.({ ...event, path: raw })) ?? EXIT_USAGE;
  const { selected, selectedLength } = selectCommand(raw, dependencies.registry);
  if (!selected) return (await dependencies.hooks?.onUnknownCommand?.(event)) ?? EXIT_USAGE;
  const parsed = parseCommandArgs(selected.meta, raw.slice(selectedLength));
  if ('error' in parsed) return reportUsageError(parsed.error.message, selected.meta.path, transformed, globals, dependencies);
  const context = dependencies.createContext(globals);
  try {
    return await selected.handler(context, parsed.args);
  } catch (error) {
    if (error instanceof OpsError && error.code === 'USAGE') return reportUsageError(error.message, selected.meta.path, transformed, globals, dependencies);
    throw error;
  }
}
