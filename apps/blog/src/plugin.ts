import type { CliPlugin } from '@fluvient-cli/cli-kit/plugin.ts';
import type { CommandContext } from '@fluvient-cli/cli-kit/commands.ts';
import { ConsoleRuntimeLog } from '@fluvient-cli/cli-core/process.ts';
import { WorkspaceBinaries } from '@fluvient-cli/cli-core/binaries.ts';
import { commandDefinitions, groupDefinitions } from './registry.ts';
import type { RunnerEvent } from '@fluvient-cli/cli-kit/runner.ts';

export function blogUnknownCommand(event: RunnerEvent): { message: string; correction: string; path?: readonly string[] } | undefined {
  const text = event.raw.join(' ');
  if (text.startsWith('runtime serve')) return { message: '命令已删除: runtime serve', correction: `迁移到 ${event.appName} runtime integration`, path: ['runtime'] };
  if (text.startsWith('database migrate') || text === 'database') return { message: `命令已删除: ${text}`, correction: `迁移到 ${event.appName} runtime backend` };
  return undefined;
}

export function blogPlugin(): CliPlugin {
  return {
    name: 'blog',
    commands: commandDefinitions,
    groups: groupDefinitions,
    configure({ container }) {
      const workspace = container.get<import('@fluvient-cli/cli-kit/workspace.ts').Workspace>('workspace');
      const fs = container.get<import('@fluvient-cli/cli-kit/ports.ts').FsPort>('fs');
      container.bind('binaries', new WorkspaceBinaries(fs, workspace.root));
      container.bind('commandContext', (globals: Record<string, string | number | boolean>): CommandContext => ({
        workspace,
        process: container.get('process'),
        supervisor: container.get('supervisor'),
        fs,
        reporter: container.get('reporter'),
        log: new ConsoleRuntimeLog(globals.json === true),
        probe: container.get('probe'),
        readiness: container.get('readiness'),
        binaries: container.get('binaries'),
        signals: container.get('signals'),
        environment: container.get('environment'),
        dryRun: globals['dry-run'] === true,
        json: globals.json === true,
      }));
    },
  };
}
