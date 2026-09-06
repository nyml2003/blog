import type { LogSource, ServiceRole } from './ports.ts';
import { isModelValue } from './parameters.ts';
import { PORT_MIN, PORT_MAX } from './port-allocation.ts';

export type RuntimeMode = 'dev' | 'backend' | 'integration';
export const DATA_MODES = ['mock', 'test'] as const;
export type DataMode = (typeof DATA_MODES)[number];

/** Named mock scenarios (WORKSTREAM-OPS-RUNTIME-MOCK); selection is CLI-only, never env or file. */
export const MOCK_SCENARIOS = ['default', 'empty', 'slow', 'server-error', 'malformed-response'] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

/**
 * Rust binary names, matching the `[[bin]] name` entries of the workspace crates
 * (`crates/product`, `crates/data`, and the mock crate delivered by WORKSTREAM-MOCK).
 */
export const SERVICE_BINARIES: Readonly<Record<Exclude<ServiceRole, 'web'>, string>> = {
  product: 'product',
  data: 'data',
  mock: 'mock',
};

/**
 * Injection identifiers, settled with WORKSTREAM-OPS-RUNTIME-BACKEND and written back into the
 * Spec "环境变量与配置注入" table / appendix A. The services take their listen address through
 * `--listen <IP:PORT>`; `BLOG_API_ORIGIN` is the pre-existing Vite seam.
 */
export const INJECTION_ENV = {
  apiOrigin: 'BLOG_API_ORIGIN',
  dataAddr: 'BLOG_DATA_ADDR',
  webDir: 'BLOG_WEB_DIR',
  databasePath: 'BLOG_DATABASE_PATH',
} as const;

export interface BuildStep {
  label: string;
  command: string;
  args: readonly string[];
  role: 'web' | 'ops';
  /** Optional subdirectory (relative to the workspace root) the step runs in, e.g. the Cargo workspace at `src`. */
  readonly cwd?: string;
}

export interface ModePlan {
  mode: RuntimeMode;
  /** Services in dependency order; port allocation and spawn follow the same order. */
  services: readonly ServiceRole[];
  candidates: Readonly<Partial<Record<ServiceRole, number>>>;
  /** Blocking build steps that must succeed before any service is spawned. */
  builds: readonly BuildStep[];
  /** Long-running rebuild process for `--watch`; its exit is a `BUILD_FAILED`, never a normal end. */
  watchBuild?: BuildStep;
  /** Service that hosts the human entry URL, or `null` for API-only modes. */
  entry: ServiceRole | null;
  dataMode: DataMode | null;
  scenario: MockScenario | null;
  watch: boolean;
}

export type ModeOptions =
  | { mode: 'dev'; scenario: MockScenario; webPort: number; mockPort: number }
  | { mode: 'backend'; dataMode: DataMode; productPort: number; dataPort: number }
  | { mode: 'integration'; watch: boolean; productPort: number; dataPort: number };

function requirePort(port: number): number {
  if (!isModelValue({ kind: 'int32', min: PORT_MIN, max: PORT_MAX }, port)) {
    throw new Error('invalid runtime candidate port: ' + String(port));
  }
  return port;
}

const frontendBuild: BuildStep = { label: 'pnpm -C src/frontend run build', command: 'pnpm', args: ['-C', 'src/frontend', 'run', 'build'], role: 'web' };
const frontendWatchBuild: BuildStep = { label: 'pnpm -C src/frontend run build --watch', command: 'pnpm', args: ['-C', 'src/frontend', 'run', 'build', '--watch'], role: 'web' };

/** Pure mode → {services, candidate ports, builds} mapping; the matrix in SPEC-OPS-RUNTIME-001. */
export function planMode(options: ModeOptions): ModePlan {
  if (options.mode === 'dev') {
    if (!isModelValue({ kind: 'enum', values: MOCK_SCENARIOS }, options.scenario)) {
      throw new Error('invalid runtime scenario');
    }
    return {
      mode: options.mode,
      services: ['mock', 'web'],
      candidates: { mock: requirePort(options.mockPort), web: requirePort(options.webPort) },
      builds: [],
      entry: 'web',
      dataMode: null,
      scenario: options.scenario,
      watch: false,
    };
  }
  if (options.mode !== 'backend' && options.mode !== 'integration') {
    throw new Error('invalid runtime mode');
  }
  if (options.mode === 'backend' && !isModelValue({ kind: 'enum', values: DATA_MODES }, options.dataMode)) {
    throw new Error('invalid runtime data mode');
  }
  if (options.mode === 'integration' && typeof options.watch !== 'boolean') {
    throw new Error('invalid runtime watch switch');
  }
  const watch = options.mode === 'integration' && options.watch;
  return {
    mode: options.mode,
    services: ['data', 'product'],
    candidates: { data: requirePort(options.dataPort), product: requirePort(options.productPort) },
    builds: options.mode === 'integration' ? [frontendBuild] : [],
    watchBuild: watch ? frontendWatchBuild : undefined,
    entry: options.mode === 'integration' ? 'product' : null,
    dataMode: options.mode === 'integration' ? 'test' : options.dataMode,
    scenario: null,
    watch,
  };
}

/** `130` for SIGINT, `143` for SIGTERM; any other signal is treated like SIGTERM. */
export function exitCodeForSignal(signal: NodeJS.Signals): number {
  const numbers: Partial<Record<NodeJS.Signals, number>> = { SIGINT: 2, SIGTERM: 15 };
  return 128 + (numbers[signal] ?? 15);
}

const LOG_SOURCE_PATTERN = /^\[(web|product|data|mock|ops)\] /;

/**
 * LOG-001: every line carries exactly one stable source prefix. Rust services already print their
 * own `[role] ` prefix, so forwarding must not add a second one; unprefixd lines (Vite, pnpm,
 * cargo) still get the forwarding role.
 */
export function withLogPrefix(role: LogSource, message: string): string {
  return LOG_SOURCE_PATTERN.test(message) ? message : `[${role}] ${message}`;
}
