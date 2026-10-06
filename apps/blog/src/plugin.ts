import type { CliPlugin } from '@fluvient-cli/cli-kit/plugin.ts';
import type { CommandArgs, CommandContext } from '@fluvient-cli/cli-kit/commands.ts';
import type { EffectPort } from '@fluvient-cli/cli-kit/effects.ts';
import { OutputRuntimeLog } from '@fluvient-cli/cli-core/runtime-output.ts';
import { WorkspaceBinaries } from '@fluvient-cli/cli-core/binaries.ts';
import { commandDefinitions, groupDefinitions } from './registry.ts';
import type { OutputPort } from '@fluvient-cli/cli-kit/output.ts';
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
      const effectsFor = container.get<(globals: CommandArgs) => EffectPort>('effectsPolicy');
      container.bind('commandContext', (globals: CommandArgs): CommandContext => ({
        workspace,
        process: container.get('process'),
        supervisor: container.get('supervisor'),
        fs,
        reporter: container.get('reporter'),
        output: container.get<OutputPort>('output'),
        log: new OutputRuntimeLog(container.get<OutputPort>('output')),
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
