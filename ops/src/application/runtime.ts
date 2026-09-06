import { join } from 'node:path';
import {
  LISTEN_HOST,
  OpsError,
  errorPayload,
  servicesPayload,
  serviceAddress,
  type ErrorDetail,
  type ServiceAddress,
} from '../domain/errors.ts';
import { allocatePort, type PortProbe } from '../domain/port-allocation.ts';
import type {
  BinaryResolver,
  FsPort,
  LogSource,
  ManagedProcess,
  ProcessExit,
  ProcessGroupPort,
  ProcessPort,
  ProcessSupervisor,
  ReadinessProbe,
  RuntimeLog,
  ServiceRole,
  SignalPort,
  SpawnRequest,
} from '../domain/ports.ts';
import { DEFAULT_SCENARIO, exitCodeForSignal, INJECTION_ENV, SERVICE_BINARIES, type BuildStep, type ModePlan } from '../domain/runtime.ts';

/** Ports handed to the runtime modes; `process.run()` keeps serving builds and checks unchanged. */
export interface RuntimePorts {
  process: ProcessPort;
  supervisor: ProcessSupervisor;
  probe: PortProbe;
  readiness: ReadinessProbe;
  binaries: BinaryResolver;
  log: RuntimeLog;
  root: string;
  fs?: FsPort;
  signals?: SignalPort;
}

export interface RunOptions { dryRun: boolean; json: boolean; graceMs?: number; readinessTimeoutMs?: number }

interface SignalOutcome { signal: NodeJS.Signals }
interface ExitOutcome { process: ManagedProcess; exit: ProcessExit }

const RECENT_LOG_LINES = 10;
const SHUTDOWN_GRACE_MS = 5_000;
const DEFAULT_READINESS_MS = 15_000;
const TEST_DB_DIR = ['target', 'test-dbs'] as const;
const frontendBuild: BuildStep = { label: 'pnpm --filter blog-web run build', command: 'pnpm', args: ['--filter', 'blog-web', 'run', 'build'], role: 'web' };
const cargoBuild: BuildStep = { label: 'cargo build --release', command: 'cargo', args: ['build', '--release'], role: 'ops' };

export function runtimeCommand(plan: ModePlan): string { return `runtime ${plan.mode}`; }

export async function runRuntimeMode(plan: ModePlan, ports: RuntimePorts, options: RunOptions): Promise<number> {
  const command = runtimeCommand(plan);
  if (options.dryRun) { printPlan(ports, options, command, plan); return 0; }

  const group = ports.supervisor.createGroup();
  // Signals are handled only once services are being brought up: during a blocking build the
  // terminal's SIGINT reaches the builder directly instead of being swallowed by ops.
  let signals = { promise: Promise.resolve<SignalOutcome>({ signal: 'SIGINT' }), unsubscribe: () => undefined };
  try {
    for (const step of plan.builds) await executeStep(step, ports);
    signals = subscribeSignals(ports);
    const watcher = await startWatchBuild(plan, ports, group);
    const addresses = await startServices(plan, ports, group, options);
    reportAddresses(ports, options, command, plan, addresses);
    return await waitModeEnd(plan, ports, group, options, signals.promise);
  } catch (error) {
    await group.stopAll('SIGTERM', options.graceMs ?? SHUTDOWN_GRACE_MS);
    reportFailure(ports, options, command, error);
    return error instanceof OpsError ? error.exitCode : 20;
  } finally {
    signals.unsubscribe();
  }
}

/** Builds `web/dist` and, when the Cargo workspace is present, the Rust delivery binaries. */
export async function runDeliveryBuild(ports: RuntimePorts, options: RunOptions): Promise<number> {
  const command = 'delivery build';
  const steps = await deliverySteps(ports);
  const plan: ModePlan = { mode: 'dev', services: [], candidates: {}, builds: steps, entry: null, dataMode: null, scenario: null, watch: false };
  if (options.dryRun) { printPlan(ports, options, command, plan); return 0; }
  try {
    for (const step of steps) await executeStep(step, ports);
    if (options.json) ports.log.json(servicesPayload(command, [], null));
    else ports.log.info('构建完成: web/dist 与 Rust 交付 binary');
    return 0;
  } catch (error) {
    reportFailure(ports, options, command, error);
    return error instanceof OpsError ? error.exitCode : 20;
  }
}

async function deliverySteps(ports: RuntimePorts): Promise<BuildStep[]> {
  const steps: BuildStep[] = [frontendBuild];
  const hasWorkspace = ports.fs ? await ports.fs.exists(join(ports.root, 'Cargo.toml')) : false;
  if (hasWorkspace) steps.push(cargoBuild);
  else ports.log.info('未找到 Cargo workspace，跳过 Rust binary 构建');
  return steps;
}

async function executeStep(step: BuildStep, ports: RuntimePorts): Promise<void> {
  ports.log.log(step.role, `$ ${step.label}`);
  const result = await ports.process.run(step.command, [...step.args], ports.root);
  emitCaptured(ports.log, step.role, result.stdout, result.stderr);
  if (result.code !== 0) {
    throw new OpsError('BUILD_FAILED', `构建失败: ${step.label} (exit ${result.code})`, [{ command: step.label, logs: recentOutput(result.stderr || result.stdout) }]);
  }
}

/**
 * `--watch` keeps rebuilding `web/dist` while the stack serves; the initial build above stays the
 * gate (FAIL-004), and a watcher that dies means BUILD_FAILED with the stack stopped (FAIL-007).
 */
async function startWatchBuild(plan: ModePlan, ports: RuntimePorts, group: ProcessGroupPort): Promise<ManagedProcess | undefined> {
  const step = plan.watchBuild;
  if (!step || step.role !== 'web') return undefined;
  ports.log.log(step.role, `$ ${step.label}`);
  const watcher = group.add(ports.supervisor.spawn({ role: 'web', command: step.command, args: [...step.args], cwd: ports.root }));
  forwardLines(ports, watcher);
  return watcher;
}

async function startServices(plan: ModePlan, ports: RuntimePorts, group: ProcessGroupPort, options: RunOptions): Promise<ServiceAddress[]> {
  const allocated = new Map<ServiceRole, number>();
  const addresses: ServiceAddress[] = [];
  for (const role of plan.services) {
    const candidate = plan.candidates[role];
    const allocation = await allocatePort({ service: role, candidate, probe: ports.probe, excluded: new Set(allocated.values()) });
    allocated.set(role, allocation.port);
    ports.log.info(`${role}: 候选端口 ${candidate}, 实际绑定 ${allocation.port}` + (allocation.attempts.length > 1 ? `（递增尝试: ${allocation.attempts.join(', ')}）` : ''));
    const request = await spawnRequest(plan, ports, role, allocated);
    const process = group.add(ports.supervisor.spawn(request));
    forwardLines(ports, process);
    await awaitReady(ports, process, allocation.port, options);
    addresses.push(serviceAddress(role, allocation.port));
  }
  return addresses;
}

async function awaitReady(ports: RuntimePorts, process: ManagedProcess, port: number, options: RunOptions): Promise<void> {
  const ready = await Promise.race([
    ports.readiness.wait(port, { timeoutMs: options.readinessTimeoutMs ?? DEFAULT_READINESS_MS, isCancelled: () => process.exited }),
    process.exit().then(() => false),
  ]);
  const exit = process.exited ? await process.exit() : { code: null, signal: null };
  if (ready && !process.exited) return;
  const cause = exit.error !== undefined || exit.code !== null || signalOf(exit) !== null
    ? ` (${describeExit(exit)})`
    : ` 未在期限内监听 ${LISTEN_HOST}:${port}`;
  throw new OpsError('SERVICE_START_FAILED', `服务启动失败: ${process.role}${cause}`, startDetails(process, exit));
}

/**
 * A running mode never ends on its own: only ops-initiated shutdown (a signal) may finish it. Any
 * member that leaves the process table while the mode is running — nonzero, signalled, or a plain
 * `exit 0` — is a `CHILD_EXITED` and stops the rest. Exits caused by our own stopAll are not
 * classified, because that path already returns the signal's exit code.
 */
async function waitModeEnd(plan: ModePlan, ports: RuntimePorts, group: ProcessGroupPort, options: RunOptions, signals: Promise<SignalOutcome>): Promise<number> {
  const graceMs = options.graceMs ?? SHUTDOWN_GRACE_MS;
  const first = (await Promise.race([group.firstExit(), signals])) as ExitOutcome | SignalOutcome;
  if ('signal' in first) { await group.stopAll(first.signal, graceMs); return exitCodeForSignal(first.signal); }
  throw exitError(plan, first.process, first.exit);
}

function subscribeSignals(ports: RuntimePorts): { promise: Promise<SignalOutcome>; unsubscribe: () => void } {
  let unsubscribe: () => void = () => undefined;
  const promise = new Promise<SignalOutcome>((resolve) => {
    if (!ports.signals) return;
    unsubscribe = ports.signals.onSignal((signal) => resolve({ signal }));
  });
  return { promise, unsubscribe };
}

function signalOf(exit: ProcessExit): NodeJS.Signals | null { return exit.signal ?? null; }

function describeExit(exit: ProcessExit): string {
  if (exit.error !== undefined) return exit.error;
  if (signalOf(exit) !== null) return `signal ${signalOf(exit)}`;
  return `exit ${String(exit.code)}`;
}

function exitError(plan: ModePlan, process: ManagedProcess, exit: ProcessExit): OpsError {
  const details = startDetails(process, exit);
  if (plan.watch && process.role === 'web') {
    return new OpsError('BUILD_FAILED', `前端构建监视退出: ${process.role} (${describeExit(exit)})`, details);
  }
  return new OpsError('CHILD_EXITED', `运行中的服务退出: ${process.role} (${describeExit(exit)})`, details);
}

function startDetails(process: ManagedProcess, exit: ProcessExit): ErrorDetail[] {
  return [{ service: process.role, exitCode: exit.code, signal: signalOf(exit) ?? undefined, logs: process.recentLogs(RECENT_LOG_LINES) }];
}

function forwardLines(ports: RuntimePorts, process: ManagedProcess): void {
  process.onLine((line) => ports.log.log(line.role, line.text));
}

function emitCaptured(log: RuntimeLog, role: LogSource, stdout: string, stderr: string): void {
  for (const line of [...splitLines(stdout), ...splitLines(stderr)]) log.log(role, line);
}

function splitLines(text: string): string[] {
  return text.split('\n').map((line) => line.replace(/\r$/, '')).filter((line) => line.length > 0);
}

function recentOutput(text: string): string[] {
  return splitLines(text).slice(-RECENT_LOG_LINES);
}

async function spawnRequest(plan: ModePlan, ports: RuntimePorts, role: ServiceRole, allocated: ReadonlyMap<ServiceRole, number>): Promise<SpawnRequest> {
  const port = allocated.get(role) ?? 0;
  const env: Record<string, string> = {};
  const listen = (value: number) => `${LISTEN_HOST}:${value}`;
  const origin = (value: number) => `http://${LISTEN_HOST}:${value}`;

  if (role === 'web') {
    const mock = allocated.get('mock');
    if (mock !== undefined) env[INJECTION_ENV.apiOrigin] = origin(mock);
    return { role, command: 'pnpm', args: ['--filter', 'blog-web', 'run', 'dev', '--port', String(port)], cwd: ports.root, env };
  }

  const name = role as Exclude<ServiceRole, 'web'>;
  const binary = await ports.binaries.resolve(name);
  if (!binary) {
    throw new OpsError('SERVICE_START_FAILED', `服务未构建: ${role}（未在 target/debug 或 target/release 找到 ${SERVICE_BINARIES[name]}）；先运行 ops delivery build 或 cargo build`, [{ service: role, binary: SERVICE_BINARIES[name] }]);
  }
  const args: string[] = ['--listen', listen(port)];
  if (role === 'mock') {
    // WORKSTREAM-OPS-RUNTIME-MOCK owns the mock binary contract; the scenario stays CLI-only.
    args.push('--scenario', plan.scenario ?? DEFAULT_SCENARIO);
  }
  if (role === 'data') {
    args.push('--data-semantics', plan.dataMode ?? 'mock');
    if (plan.dataMode === 'test') env[INJECTION_ENV.databasePath] = await testDatabasePath(ports);
  }
  if (role === 'product') {
    const data = allocated.get('data');
    if (data !== undefined) env[INJECTION_ENV.dataAddr] = origin(data);
    if (plan.mode === 'integration') {
      env[INJECTION_ENV.webDir] = join(ports.root, 'web', 'dist');
      args.push('--web-dir', env[INJECTION_ENV.webDir]);
    }
  }
  return { role, command: binary, args, cwd: ports.root, env };
}

/**
 * `target/test-dbs/<pid>.db` is owned by the Data process: deleted on a clean exit, kept for
 * diagnosis. The value is an absolute file path because Data uses it as-is.
 */
async function testDatabasePath(ports: RuntimePorts): Promise<string> {
  const dir = join(ports.root, ...TEST_DB_DIR);
  if (ports.fs) await ports.fs.mkdir(dir);
  return join(dir, `${process.pid}.db`);
}

function reportAddresses(ports: RuntimePorts, options: RunOptions, command: string, plan: ModePlan, addresses: ServiceAddress[]): void {
  const entry = plan.entry ? addresses.find((address) => address.service === plan.entry)?.url ?? null : null;
  if (options.json) { ports.log.json(servicesPayload(command, addresses, entry)); return; }
  for (const address of addresses) ports.log.info(`${address.service} 就绪: ${address.url}`);
  if (entry) ports.log.info(`访问入口: ${entry}`);
}

function reportFailure(ports: RuntimePorts, options: RunOptions, command: string, error: unknown): void {
  if (options.json) ports.log.json(errorPayload(command, error));
  ports.log.error(error instanceof Error ? error.message : String(error));
  const details = error instanceof OpsError ? error.details : [];
  for (const detail of details) {
    const source = typeof detail.service === 'string' ? detail.service as LogSource : Array.isArray(detail.logs) && typeof detail.command === 'string' ? 'ops' : undefined;
    if (!source || !Array.isArray(detail.logs)) continue;
    for (const line of detail.logs as string[]) ports.log.log(source, `| ${line}`);
  }
}

/** Dry run only describes intent: processes, candidate ports and build steps, with no side effects. */
function printPlan(ports: RuntimePorts, options: RunOptions, command: string, plan: ModePlan): void {
  const entry = plan.entry ? `http://${LISTEN_HOST}:${plan.candidates[plan.entry]}` : null;
  if (options.json) {
    ports.log.json({ ok: true, command, dryRun: true, services: plan.services.map((role) => serviceAddress(role, plan.candidates[role] ?? 0)), entry, builds: plan.builds.map((step) => step.label) });
    return;
  }
  ports.log.info(`dry-run: ${command}（不启动进程、不绑定端口、不写文件）`);
  const flags = [plan.watch ? '--watch' : undefined, plan.dataMode ? `--data ${plan.dataMode}` : undefined, plan.scenario ? `--scenario ${plan.scenario}` : undefined].filter(Boolean).join(' ');
  if (plan.services.length > 0) ports.log.info(`模式: ${plan.mode}${flags ? ` ${flags}` : ''}`);
  for (const step of plan.builds) ports.log.info(`构建步骤: ${step.label}`);
  if (plan.watchBuild) ports.log.info(`构建监视: ${plan.watchBuild.label}`);
  if (plan.builds.length === 0 && !plan.watchBuild) ports.log.info('构建步骤: 无');
  if (plan.services.length === 0) {
    ports.log.info('进程: 无（只构建产物: web/dist 与 target/release）');
    ports.log.info('入口: 无');
    return;
  }
  for (const role of plan.services) ports.log.info(`进程: [${role}] 候选端口 ${plan.candidates[role]}`);
  ports.log.info(`入口: ${entry ?? '无（API-only 模式，无页面入口）'}`);
}
