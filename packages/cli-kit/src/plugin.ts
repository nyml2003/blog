import type { CommandContext, CommandDefinition, GroupDefinition } from './commands.ts';
import type { Reporter } from './ports.ts';
import { Container } from './container.ts';
import { reflectCommandRegistry } from './commands.ts';
import { runCli } from './runner.ts';

export interface PluginContext {
  readonly name: string;
  readonly version: string;
  readonly container: Container;
}

export interface CliPlugin {
  readonly name: string;
  readonly commands?: readonly CommandDefinition[];
  readonly groups?: readonly GroupDefinition[];
  readonly configure?: (context: PluginContext) => void;
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
}

export function createCliApp(options: CliAppOptions): CliApp {
  const container = new Container();
  const context: PluginContext = { name: options.name, version: options.version, container };
  for (const plugin of options.plugins) plugin.configure?.(context);
  const definitions = options.plugins.flatMap((plugin) => plugin.commands ?? []);
  const groups = options.plugins.flatMap((plugin) => plugin.groups ?? []);
  const registry = reflectCommandRegistry(definitions, groups);
  const reporter = container.get<Reporter>('reporter');
  const createContext = container.get<(dryRun: boolean, json: boolean) => CommandContext>('commandContext');
  return {
    container,
    run: async (argv = process.argv.slice(2)) => {
      if (container.has('version') && (argv.includes('--version') || argv.includes('-V'))) {
        console.log(container.get<string>('version'));
        return 0;
      }
      return runCli(argv, { registry, reporter, createContext });
    },
  };
}
