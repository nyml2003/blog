import type { CliPlugin } from '@fluvient-cli/cli-kit/plugin.ts';
import type { CommandContext } from '@fluvient-cli/cli-kit/commands.ts';
import { ConsoleRuntimeLog } from '@fluvient-cli/cli-core/process.ts';
import { WorkspaceBinaries } from '@fluvient-cli/cli-core/binaries.ts';
import { commandDefinitions, groupDefinitions } from './registry.ts';

export function blogPlugin(): CliPlugin {
  return {
    name: 'blog',
    commands: commandDefinitions,
    groups: groupDefinitions,
    configure({ container }) {
      const workspace = container.get<import('@fluvient-cli/cli-kit/workspace.ts').Workspace>('workspace');
      const fs = container.get<import('@fluvient-cli/cli-kit/ports.ts').FsPort>('fs');
      container.bind('binaries', new WorkspaceBinaries(fs, workspace.root));
      container.bind('commandContext', (dryRun: boolean, json: boolean): CommandContext => ({
        workspace,
        process: container.get('process'),
        supervisor: container.get('supervisor'),
        fs,
        reporter: container.get('reporter'),
        log: new ConsoleRuntimeLog(json),
        probe: container.get('probe'),
        readiness: container.get('readiness'),
        binaries: container.get('binaries'),
        signals: container.get('signals'),
        environment: container.get('environment'),
        dryRun,
        json,
      }));
    },
  };
}
