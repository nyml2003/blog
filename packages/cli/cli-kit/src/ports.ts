export interface ProcessResult { code: number; stdout: string; stderr: string }
export interface ProcessPort {
  /** Single-shot children inherit system variables but no ambient BLOG_* values. */
  run(command: string, args: string[], cwd: string, env?: Readonly<Record<string, string>>): Promise<ProcessResult>
  /** Sensitive helpers inherit the terminal; credentials are read from the TTY, never argv. */
  runInteractive?(command: string, args: string[], cwd: string, env?: Readonly<Record<string, string>>): Promise<number>
}

/** Deterministic path arithmetic; command code must not import `node:path` directly. */
export interface PathPort {
  join(...parts: string[]): string
  normalize(path: string): string
  dirname(path: string): string
  basename(path: string): string
  extname(path: string): string
}

/** Hashing capability; command code must not import `node:crypto` directly. */
export interface HashPort {
  /** Lowercase hex SHA-256 of the given bytes. */
  sha256(content: Uint8Array): string
}
export interface FileMetadata { kind: 'file' | 'directory' | 'symlink' | 'other'; mode: number; uid: number }
export interface SecureFile { content: string; metadata: FileMetadata }
export interface FsPort {
  read(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  files(root: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;
  write?(path: string, content: string): Promise<void>;
  copy?(from: string, to: string): Promise<void>;
  readBytes?(path: string): Promise<Buffer>;
  inspect?(path: string): Promise<FileMetadata>;
  readSecure?(path: string, maxBytes: number): Promise<SecureFile>;
  effectiveUid?(): number | undefined;
}

export interface Reporter { section(title: string): void; ok(message: string): void; fail(message: string): void; info(message: string): void }
export type { OutputChannel, OutputEvent, OutputLevel, OutputLifecycleEvent, OutputLogEvent, OutputPort, OutputResultEvent, OutputTelemetryEvent } from './output.ts';
export { CaptureOutputPort, NullOutputPort } from './output.ts';

export type ServiceRole = 'web' | 'product' | 'data' | 'mock';
export type LogSource = ServiceRole | 'ops';
export type LogStream = 'stdout' | 'stderr';

/** One complete line produced by a child process, kept stream-faithful so stderr is never dropped. */
export interface LogLine { role: ServiceRole; stream: LogStream; text: string }

export interface ProcessExit { code: number | null; signal: NodeJS.Signals | null; error?: string }

export interface SpawnRequest {
  role: ServiceRole;
  command: string;
  args: readonly string[];
  cwd: string;
  /** Explicit BLOG_* allowlist for this child; ambient BLOG_* values are always removed first. */
  env?: Readonly<Record<string, string>>;
}

/** Long-running child handle: spawn record, streaming lines, exit events and signal delivery. */
export interface ManagedProcess {
  readonly role: ServiceRole;
  readonly pid: number | undefined;
  readonly exited: boolean;
  onLine(listener: (line: LogLine) => void): () => void;
  exit(): Promise<ProcessExit>;
  kill(signal?: NodeJS.Signals): Promise<void>;
  recentLogs(limit?: number): readonly string[];
}

export interface ProcessGroupPort {
  readonly members: readonly ManagedProcess[];
  add(process: ManagedProcess): ManagedProcess;
  /** Deliver `signal` to every member, wait up to `graceMs`, then SIGKILL whatever is left. */
  stopAll(signal?: NodeJS.Signals, graceMs?: number): Promise<void>;
  firstExit(): Promise<{ process: ManagedProcess; exit: ProcessExit }>;
}

export interface ProcessSupervisor {
  spawn(request: SpawnRequest): ManagedProcess;
  createGroup(): ProcessGroupPort;
}

export interface PortProbe { isFree(port: number): Promise<boolean> }

export interface ReadinessOptions { timeoutMs?: number; intervalMs?: number; isCancelled?: () => boolean }
export interface ReadinessProbe { wait(port: number, options?: ReadinessOptions): Promise<boolean> }

/** Resolves the executable for a Rust service role, or `undefined` when it has not been built. */
export interface BinaryResolver { resolve(role: Exclude<ServiceRole, 'web'>): Promise<string | undefined> }

/** Every line emitted by the runtime orchestrator carries the `[ops]` source prefix. */
export interface RuntimeLog { info(message: string): void; error(message: string): void; log(role: LogSource, message: string, stream?: LogStream): void; json(value: unknown): void }

export interface SignalPort { onSignal(handler: (signal: NodeJS.Signals) => void): () => void }
