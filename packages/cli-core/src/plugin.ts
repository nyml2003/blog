import { resolveWorkspace, type Workspace } from '@fluvient-cli/cli-kit/workspace.ts';
import { NodeFs } from './fs.ts';
import { NodeProcess, NodeProcessSupervisor, ConsoleRuntimeLog, NodeSignals } from './process.ts';
import { TcpPortProbe, TcpReadiness } from './net.ts';
import { TerminalReporter } from './reporter.ts';

export function corePlugin(options: { workspace?: Workspace } = {}) {
  return {
    name: 'cli-core',
    configure({ container }: { container: import('@fluvient-cli/cli-kit/container.ts').Container }) {
      const fs = new NodeFs();
      const workspace = options.workspace ?? resolveWorkspace(import.meta.url);
      container.bind('workspace', workspace);
      container.bind('fs', fs);
      container.bind('process', new NodeProcess());
      container.bind('supervisor', new NodeProcessSupervisor());
      container.bind('reporter', new TerminalReporter());
      container.bind('probe', new TcpPortProbe());
      container.bind('readiness', new TcpReadiness());
      container.bind('signals', new NodeSignals());
      container.bind('environment', Object.freeze({ ...process.env }));
      container.bind('runtimeLog', (json: boolean) => new ConsoleRuntimeLog(json));
    },
  };
}
