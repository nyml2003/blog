#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolveWorkspace } from '../framework/workspace.ts';
import { reflectCommandRegistry, type CommandContext } from '../framework/commands.ts';
import { NodeProcess, NodeProcessSupervisor, ConsoleRuntimeLog, NodeSignals } from '../infrastructure/process.ts';
import { NodeFs } from '../infrastructure/fs.ts';
import { TcpPortProbe, TcpReadiness } from '../infrastructure/net.ts';
import { WorkspaceBinaries } from '../infrastructure/binaries.ts';
import { TerminalReporter } from '../infrastructure/reporter.ts';
import { commandDefinitions, groupDefinitions } from '../commands/registry.ts';
import { runCli } from '../framework/runner.ts';

export { commandDefinitions, groupDefinitions } from '../commands/registry.ts';

const workspace = resolveWorkspace(import.meta.url);
const environment = Object.freeze({ ...process.env });
const fs = new NodeFs();
const processPort = new NodeProcess();
const reporter = new TerminalReporter();
const registry = reflectCommandRegistry(commandDefinitions, groupDefinitions);

export function createContext(
  dryRun: boolean,
  json: boolean,
  injectedEnvironment: Readonly<Record<string, string | undefined>> = environment,
): CommandContext {
  return {
    workspace,
    process: processPort,
    supervisor: new NodeProcessSupervisor(),
    fs,
    reporter,
    log: new ConsoleRuntimeLog(json),
    probe: new TcpPortProbe(),
    readiness: new TcpReadiness(),
    binaries: new WorkspaceBinaries(fs, workspace.root),
    signals: new NodeSignals(),
    environment: injectedEnvironment,
    dryRun,
    json,
  };
}

export async function main(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  return runCli(args, { registry, reporter, createContext });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 20;
  });
}
