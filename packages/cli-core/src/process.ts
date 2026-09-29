import { spawn, type ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import type {
  LogLine,
  LogSource,
  LogStream,
  ManagedProcess,
  ProcessExit,
  ProcessGroupPort,
  ProcessPort,
  ProcessResult,
  ProcessSupervisor,
  ServiceRole,
  SignalPort,
  SpawnRequest,
} from '@fluvient-cli/cli-kit/ports.ts';
import { withLogPrefix } from '@fluvient-cli/cli-kit/service-contract.ts';

const RECENT_LOG_LIMIT = 50;

/** Single-shot execution used by builds and checks; output is buffered to process exit. */
export class NodeProcess implements ProcessPort {
  run(command: string, args: string[], cwd: string, env?: Readonly<Record<string, string>>): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, env: childEnvironment(env), stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = ''; let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });
  }

  runInteractive(command: string, args: string[], cwd: string, env?: Readonly<Record<string, string>>): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, env: childEnvironment(env), stdio: 'inherit' });
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? 20));
    });
  }
}

/**
 * Long-running child handle: lines are forwarded as they arrive (never buffered to exit), a final
 * line without a trailing newline is still flushed, and stderr is captured as faithfully as stdout.
 */
export class ManagedChildProcess implements ManagedProcess {
  readonly role: ServiceRole;
  readonly pid: number | undefined;
  private readonly child: ChildProcess;
  private exitedFlag = false;
  private readonly listeners = new Set<(line: LogLine) => void>();
  private readonly recent: string[] = [];
  private readonly exitPromise: Promise<ProcessExit>;

  constructor(role: ServiceRole, child: ChildProcess) {
    this.child = child;
    this.role = role;
    this.pid = child.pid;
    this.exitPromise = new Promise<ProcessExit>((resolve) => {
      let settled = false;
      let exit: ProcessExit = { code: null, signal: null };
      const settle = (next?: ProcessExit) => {
        if (next) exit = next;
        if (settled) return;
        settled = true;
        this.exitedFlag = true;
        resolve(exit);
      };
      const spawned = child.pid !== undefined;
      child.on('error', (error: Error) => { if (!spawned) settle({ code: null, signal: null, error: error.message }); });
      child.on('exit', (code, signal) => { exit = { code, signal }; });
      child.on('close', (code, signal) => { settle({ code, signal }); });
    });
    this.attach('stdout', child.stdout);
    this.attach('stderr', child.stderr);
  }

  get exited(): boolean { return this.exitedFlag; }

  onLine(listener: (line: LogLine) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  exit(): Promise<ProcessExit> { return this.exitPromise; }

  async kill(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    if (this.exited || this.child.signalCode !== null) return;
    try { this.child.kill(signal); } catch { /* already gone */ }
    await this.exitPromise;
  }

  recentLogs(limit = 10): readonly string[] {
    return this.recent.slice(-limit);
  }

  private attach(stream: LogStream, readable: NodeJS.ReadableStream | null): void {
    if (!readable) return;
    const decoder = new StringDecoder('utf8');
    let pending = '';
    let flushed = false;
    const flush = () => {
      if (flushed) return;
      flushed = true;
      pending += decoder.end();
      if (pending.length > 0) this.emit(stream, pending);
    };
    readable.on('data', (chunk: Buffer) => {
      pending += decoder.write(chunk);
      const parts = pending.split('\n');
      pending = parts.pop() ?? '';
      for (const line of parts) this.emit(stream, line.replace(/\r$/, ''));
    });
    readable.once('close', flush);
    readable.once('end', flush);
  }

  private emit(stream: LogStream, text: string): void {
    this.recent.push(text);
    if (this.recent.length > RECENT_LOG_LIMIT) this.recent.shift();
    const line: LogLine = { role: this.role, stream, text };
    for (const listener of this.listeners) listener(line);
  }
}

/** Owns the processes of one run so a failure or a signal can stop the whole mode. */
export class ProcessGroup implements ProcessGroupPort {
  private readonly processes: ManagedProcess[] = [];
  #stopping = false;

  get members(): readonly ManagedProcess[] { return [...this.processes]; }

  add(process: ManagedProcess): ManagedProcess {
    if (!this.processes.includes(process)) this.processes.push(process);
    return process;
  }

  async stopAll(signal: NodeJS.Signals = 'SIGTERM', graceMs = 5000): Promise<void> {
    if (this.#stopping) return;
    this.#stopping = true;
    const live = this.processes.filter((process) => !process.exited);
    for (const process of live) void process.kill(signal);
    if (live.length > 0) {
      const finished = await Promise.race([
        Promise.all(live.map((process) => process.exit())).then(() => true),
        delay(graceMs).then(() => false),
      ]);
      if (!finished) {
        for (const process of live) {
          if (process.exited) continue;
          void process.kill('SIGKILL');
        }
      }
    }
    await Promise.all(this.processes.map((process) => process.exit()));
  }

  /** Resolves with the first member that leaves the process table. */
  firstExit(): Promise<{ process: ManagedProcess; exit: ProcessExit }> {
    return new Promise((resolve) => {
      for (const process of this.processes) void process.exit().then((exit) => resolve({ process, exit }));
    });
  }

  allExits(): Promise<{ process: ManagedProcess; exit: ProcessExit }[]> {
    return Promise.all(this.processes.map(async (process) => ({ process, exit: await process.exit() })));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

export class NodeProcessSupervisor implements ProcessSupervisor {
  spawn(request: SpawnRequest): ManagedProcess {
    const child = spawn(request.command, [...request.args], {
      cwd: request.cwd,
      env: childEnvironment(request.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return new ManagedChildProcess(request.role, child);
  }

  createGroup(): ProcessGroup { return new ProcessGroup(); }
}

function childEnvironment(explicit?: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('BLOG_')),
  );
  return { ...inherited, ...explicit };
}

/**
 * Runtime output channel. Human mode: child logs and `[ops]` progress on stdout, `[ops]` errors on
 * stderr. `--json` mode: stdout carries exactly one JSON object, everything else moves to stderr.
 * Prefixing is centralised here so a child line that already carries `[role] ` is never doubled.
 */
export class ConsoleRuntimeLog {
  private readonly jsonMode: boolean;

  constructor(json = false) { this.jsonMode = json; }

  info(message: string): void { this.log('ops', message); }

  error(message: string): void { console.error(withLogPrefix('ops', message)); }

  log(role: LogSource, message: string): void {
    const text = withLogPrefix(role, message);
    if (this.jsonMode) console.error(text);
    else console.log(text);
  }

  json(value: unknown): void { console.log(JSON.stringify(value)); }
}

export class NodeSignals implements SignalPort {
  onSignal(handler: (signal: NodeJS.Signals) => void): () => void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) process.on(signal, handler);
    return () => { for (const signal of signals) process.off(signal, handler); };
  }
}
