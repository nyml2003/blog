import type { CommandArgs, CommandContext, CommandDefinition, GroupDefinition } from './commands.ts';
import { Container } from './container.ts';
import { reflectCommandRegistry } from './commands.ts';
import { createEffectDispatcher, type EffectMiddleware } from './effects.ts';
import { runCli, type RunnerHooks, type RunnerRegistry } from './runner.ts';
import type { ParameterSpec } from './parameters.ts';
import type { Reporter } from './ports.ts';
import type { OperationIdPort } from '@fluvient-loom/port';

export interface PluginContext {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly entry: string;
  readonly container: Container;
}

export interface CliPlugin {
  readonly name: string;
  readonly commands?: readonly CommandDefinition[];
  readonly groups?: readonly GroupDefinition[];
  readonly globalOptions?: readonly ParameterSpec[];
  /** Contributions to the effect waterfall; plugin order is middleware order. */
  readonly effectMiddlewares?: readonly ((globals: CommandArgs) => EffectMiddleware | undefined)[];
  readonly configure?: (context: PluginContext) => void;
  readonly hooks?: RunnerHooks;
}

export interface CliAppOptions {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly entry: string;
  readonly plugins: readonly CliPlugin[];
}

export interface CliApp {
  readonly run: (argv?: readonly string[]) => Promise<number>;
  readonly container: Container;
  readonly registry: RunnerRegistry;
}

export function createCliApp(options: CliAppOptions): CliApp {
  const container = new Container();
  const context: PluginContext = { name: options.name, description: options.description, version: options.version, entry: options.entry, container };
  const middlewareFactories = options.plugins.flatMap((plugin) => plugin.effectMiddlewares ?? []);
  // Bound before configure so commandContext factories can capture it; operationIds is resolved
  // lazily per run, after corePlugin's configure has run.
  container.bind('effectsPolicy', (globals: CommandArgs) => createEffectDispatcher({
    operationIds: container.get<OperationIdPort>('operationIds'),
    middlewares: middlewareFactories
      .map((factory) => factory(globals))
      .filter((middleware): middleware is EffectMiddleware => middleware !== undefined),
  }));
  for (const plugin of options.plugins) plugin.configure?.(context);
  const definitions = options.plugins.flatMap((plugin) => plugin.commands ?? []);
  const groups = options.plugins.flatMap((plugin) => plugin.groups ?? []);
  const globalOptions = options.plugins.flatMap((plugin) => plugin.globalOptions ?? []);
  const registry = reflectCommandRegistry(definitions, groups, globalOptions.map((option) => option.name));
  const reporter = container.get<Reporter>('reporter');
  const output = container.get<import('./output.ts').OutputPort>('output');
  const createContext = container.get<(globals: CommandArgs) => CommandContext>('commandContext');
  const hooks: RunnerHooks = {
    transformArgs: (args) => options.plugins.reduce((current, plugin) => plugin.hooks?.transformArgs?.(current) ?? current, args),
    beforeRun: async (event) => {
      for (const plugin of options.plugins) {
        const result = await plugin.hooks?.beforeRun?.(event);
        if (result !== undefined) return result;
      }
      return undefined;
    },
    onUnknownCommand: async (event) => {
      for (const plugin of options.plugins) {
        const result = await plugin.hooks?.onUnknownCommand?.(event);
        if (result !== undefined) return result;
      }
      return undefined;
    },
    onUsageError: async (event) => {
      for (const plugin of options.plugins) {
        const result = await plugin.hooks?.onUsageError?.(event);
        if (result !== undefined) return result;
      }
      return undefined;
    },
  };
  return {
    container,
    registry,
  run: (argv = process.argv.slice(2)) => runCli(argv, { appName: options.name, appVersion: options.version, registry, reporter, output, globalOptions, hooks, createContext }),
  };
}
