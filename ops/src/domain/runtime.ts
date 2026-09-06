import type { LogSource, ServiceRole } from './ports.ts';

export type RuntimeMode = 'dev' | 'backend' | 'integration';
export type DataMode = 'mock' | 'test';

/** Named mock scenarios (WORKSTREAM-OPS-RUNTIME-MOCK); selection is CLI-only, never env or file. */
export const MOCK_SCENARIOS = ['default', 'empty', 'slow', 'server-error', 'malformed-response'] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];
export const DEFAULT_SCENARIO: MockScenario = 'default';

export const DEFAULT_PORTS: Readonly<Record<ServiceRole, number>> = { web: 5173, product: 8080, data: 8081, mock: 9090 };

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

export interface BuildStep { label: string; command: string; args: readonly string[]; role: 'web' | 'ops' }

export interface ModePlan {
  mode: RuntimeMode;
  /** Services in dependency order; port allocation and spawn follow the same order. */
  services: readonly ServiceRole[];
  candidates: Readonly<Record<ServiceRole, number>>;
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

export interface ModeOptions {
  scenario?: string;
  dataMode?: string;
  webPort?: number;
  productPort?: number;
  dataPort?: number;
  mockPort?: number;
  watch?: boolean;
}

export function scenarioError(value: string | number | boolean): string | undefined {
  const name = String(value);
  return (MOCK_SCENARIOS as readonly string[]).includes(name) ? undefined : `未知场景: ${name}（可选: ${MOCK_SCENARIOS.join(', ')}）`;
}

export function dataModeError(value: string | number | boolean): string | undefined {
  const name = String(value);
  return name === 'mock' || name === 'test' ? undefined : `非法的 --data 取值: ${name}（可选: mock, test）`;
}

function candidateFor(role: ServiceRole, options: ModeOptions): number {
  switch (role) {
    case 'web': return options.webPort ?? DEFAULT_PORTS.web;
    case 'product': return options.productPort ?? DEFAULT_PORTS.product;
    case 'data': return options.dataPort ?? DEFAULT_PORTS.data;
    case 'mock': return options.mockPort ?? DEFAULT_PORTS.mock;
  }
}

const frontendBuild: BuildStep = { label: 'pnpm --filter blog-web run build', command: 'pnpm', args: ['--filter', 'blog-web', 'run', 'build'], role: 'web' };
const frontendWatchBuild: BuildStep = { label: 'pnpm --filter blog-web run build --watch', command: 'pnpm', args: ['--filter', 'blog-web', 'run', 'build', '--watch'], role: 'web' };

/** Pure mode → {services, candidate ports, builds} mapping; the matrix in SPEC-OPS-RUNTIME-001. */
export function planMode(mode: RuntimeMode, options: ModeOptions = {}): ModePlan {
  if (mode === 'dev') {
    return {
      mode,
      services: ['mock', 'web'],
      candidates: { mock: candidateFor('mock', options), web: candidateFor('web', options) },
      builds: [],
      entry: 'web',
      dataMode: null,
      scenario: toScenario(options.scenario),
      watch: false,
    };
  }
  const watch = mode === 'integration' && options.watch === true;
  return {
    mode,
    services: ['data', 'product'],
    candidates: { data: candidateFor('data', options), product: candidateFor('product', options) },
    builds: mode === 'integration' ? [frontendBuild] : [],
    watchBuild: watch ? frontendWatchBuild : undefined,
    entry: mode === 'integration' ? 'product' : null,
    dataMode: mode === 'integration' ? 'test' : toDataMode(options.dataMode),
    scenario: null,
    watch,
  };
}

function toScenario(value: string | undefined): MockScenario {
  const name = value ?? DEFAULT_SCENARIO;
  return (MOCK_SCENARIOS as readonly string[]).includes(name) ? name as MockScenario : DEFAULT_SCENARIO;
}

function toDataMode(value: string | undefined): DataMode {
  return value === 'test' ? 'test' : 'mock';
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
