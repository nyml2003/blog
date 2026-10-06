import type { CliPlugin } from '@fluvient-cli/cli-kit/plugin.ts';
import type { CommandArgs, CommandContext } from '@fluvient-cli/cli-kit/commands.ts';
import type { EffectPort } from '@fluvient-cli/cli-kit/effects.ts';
import { createHttpKernel } from '@fluvient/core/http';
import type { FetchLike } from './installer/release.ts';
import { installerDefinitions } from './installer/registry.ts';
import { runInstallerCommand } from './installer/main.ts';
import { WorkspaceBinaries } from '@fluvient-cli/cli-core/binaries.ts';
import { OutputRuntimeLog } from '@fluvient-cli/cli-core/runtime-output.ts';

export function installerPlugin(fetchImpl: FetchLike): CliPlugin {
  return {
    name: 'installer',
    commands: installerDefinitions(createHttpKernel({ fetcher: fetchImpl }), runInstallerCommand),
    configure({ container }) {
      const workspace = container.get<import('@fluvient-cli/cli-kit/workspace.ts').Workspace>('workspace');
      const fs = container.get<import('@fluvient-cli/cli-kit/ports.ts').FsPort>('fs');
      container.bind('binaries', new WorkspaceBinaries(fs, workspace.root));
      const effectsFor = container.get<(globals: CommandArgs) => EffectPort>('effectsPolicy');
      container.bind('commandContext', (globals: CommandArgs): CommandContext => ({
        workspace,
        process: container.get('process'),
        supervisor: container.get('supervisor'),
        fs,
        path: container.get('path'),
        hash: container.get('hash'),
        reporter: container.get('reporter'),
        output: container.get('output'),
        log: new OutputRuntimeLog(container.get('output')),
        probe: container.get('probe'),
        readiness: container.get('readiness'),
        binaries: container.get('binaries'),
        signals: container.get('signals'),
        environment: container.get('environment'),
        effects: effectsFor(globals),
        dryRun: globals['dry-run'] === true,
        json: globals.json === true,
      }));
    },
  };
}
