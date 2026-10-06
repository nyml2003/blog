import { EXIT_OK, EXIT_USAGE, errorFromUnknown, OpsError, type OpsFailure } from './errors.ts';
import type { CommandArgs, CommandContext, CommandDefinition, GroupDefinition } from './commands.ts';
import type { ParameterSpec } from './parameters.ts';
import type { Reporter } from './ports.ts';
import type { OutputPort } from './output.ts';
import type { Result } from '@fluvient/core';
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
  readonly output: OutputPort;
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
  readonly output: OutputPort;
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
    output: dependencies.output,
    globalOptions: dependencies.globalOptions,
    message,
    command: path,
  });
  const exitCode = handled ?? EXIT_USAGE;
  dependencies.output.result({ status: 'failure', command: path.join(' '), exitCode, code: 'USAGE', data: { reason: message } });
  return exitCode;
}

export async function runCli(args: readonly string[], dependencies: RunnerDependencies): Promise<number> {
  const transformed = dependencies.hooks?.transformArgs?.(args) ?? args;
  const optionBoundary = transformed.indexOf('--');
  const optionTokens = optionBoundary < 0 ? transformed : transformed.slice(0, optionBoundary);
  dependencies.output.setJson(optionTokens.includes('--json'));
  const globalsResult = extractGlobalSwitches(transformed, dependencies.globalOptions);
  if ('error' in globalsResult) return reportUsageError(globalsResult.error.message, [], transformed, {}, dependencies);
  const { raw, indices, values: globals } = globalsResult;
  const event: RunnerEvent = {
    appName: dependencies.appName,
    appVersion: dependencies.appVersion,
    args: transformed,
    raw,
    path: raw,
    globals,
    registry: dependencies.registry,
    reporter: dependencies.reporter,
    output: dependencies.output,
    globalOptions: dependencies.globalOptions,
  };
  const beforeRun = await dependencies.hooks?.beforeRun?.(event);
  if (beforeRun !== undefined) return finishEarly(beforeRun, event.path, dependencies, globals.json === true);
  const group = raw.length > 0 && dependencies.registry.group(raw);
  if (group || raw.length === 0) return finishEarly((await dependencies.hooks?.beforeRun?.({ ...event, path: raw })) ?? EXIT_USAGE, raw, dependencies, globals.json === true);
  const { selected, selectedLength } = selectCommand(raw, dependencies.registry);
  if (!selected) return finishEarly((await dependencies.hooks?.onUnknownCommand?.(event)) ?? EXIT_USAGE, raw, dependencies, globals.json === true);
  const commandIndex = indices[selectedLength - 1];
  const argumentStart = commandIndex === undefined ? selectedLength : commandIndex + 1;
  const parsed = parseCommandArgs(selected.meta, transformed.slice(argumentStart), dependencies.globalOptions);
  if ('error' in parsed) return reportUsageError(parsed.error.message, selected.meta.path, transformed, globals, dependencies);
  const context = dependencies.createContext(globals);
  dependencies.output.telemetry({ name: 'command.started', data: { command: selected.meta.path.join(' ') } });
  try {
    const result: Result<{ readonly exitCode?: number }, OpsFailure> = await selected.handler(context, parsed.args);
    const exitCode = result.ok ? (result.value.exitCode ?? EXIT_OK) : result.error.exitCode;
    const command = selected.meta.path.join(' ');
    const jsonMode = globals.json === true;
    if (!(jsonMode && (command.startsWith('runtime ') || command === 'delivery build'))) dependencies.output.result({
      status: result.ok ? 'success' : 'failure',
      command,
      exitCode,
      code: result.ok ? 'OK' : result.error.code,
      data: result.ok ? result.value : { message: result.error.message, details: result.error.details },
    });
    dependencies.output.telemetry({ name: 'command.finished', data: { command, ok: result.ok, exitCode, code: result.ok ? 'OK' : result.error.code } });
    return exitCode;
  } catch (error) {
    if (error instanceof OpsError && error.code === 'USAGE') return reportUsageError(error.message, selected.meta.path, transformed, globals, dependencies);
    const failure = errorFromUnknown(error);
    dependencies.output.result({ status: 'failure', command: selected.meta.path.join(' '), exitCode: failure.exitCode, code: failure.code, data: { message: failure.message, details: failure.details } });
    return failure.exitCode;
  }
}

function finishEarly(exitCode: number, path: readonly string[], dependencies: RunnerDependencies, json: boolean): number {
  if (exitCode !== EXIT_OK || json) dependencies.output.result({ status: exitCode === EXIT_OK ? 'success' : 'failure', command: path.join(' '), exitCode, code: exitCode === EXIT_OK ? 'OK' : 'USAGE' });
  return exitCode;
}
