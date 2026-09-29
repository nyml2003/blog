import type { CliPlugin } from '@fluvient-cli/cli-kit/plugin.ts';
import type { FetchLike } from './installer/release.ts';
import { installerDefinitions } from './installer/registry.ts';
import { runInstallerCommand } from './installer/main.ts';
import { WorkspaceBinaries } from '@fluvient-cli/cli-core/binaries.ts';
import { ConsoleRuntimeLog } from '@fluvient-cli/cli-core/process.ts';

export function installerPlugin(fetchImpl: FetchLike): CliPlugin {
  return {
    name: 'installer',
    commands: installerDefinitions(fetchImpl, runInstallerCommand),
    configure({ container }) {
      const workspace = container.get<import('@fluvient-cli/cli-kit/workspace.ts').Workspace>('workspace');
      const fs = container.get<import('@fluvient-cli/cli-kit/ports.ts').FsPort>('fs');
      container.bind('binaries', new WorkspaceBinaries(fs, workspace.root));
      container.bind('commandContext', (globals: Record<string, string | number | boolean>) => ({
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
