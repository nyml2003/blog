import { join } from 'node:path';
import type { CommandContext } from '@fluvient-cli/cli-kit/commands.ts';
import { EXIT_USAGE, OpsError } from '@fluvient-cli/cli-kit/errors.ts';
import { allocatePort, PORT_MAX, PORT_MIN } from '@fluvient-cli/cli-kit/port-allocation.ts';
import type { ManagedProcess } from '@fluvient-cli/cli-kit/ports.ts';

export const E2E_MODES = ['integration', 'dev'] as const;
export type E2eMode = (typeof E2E_MODES)[number];
export const E2E_SCENARIOS = ['empty', 'slow', 'server-error', 'malformed-response'] as const;
export type E2eScenario = (typeof E2E_SCENARIOS)[number];

interface E2ePorts {
  readonly product?: number;
  readonly data?: number;
  readonly web?: number;
  readonly mock?: number;
}

interface E2ePayload {
  readonly ok: true;
  readonly entry: string;
}

interface BrowserPage {
  goto(url: string, options?: { waitUntil?: string }): Promise<unknown>;
  getByRole(role: string, options?: { name?: string; exact?: boolean }): BrowserLocator;
  getByText(text: string, options: { exact?: boolean }): BrowserLocator;
  locator(selector: string): BrowserLocator;
  evaluate<T>(callback: () => T): Promise<T>;
  screenshot(options: { path: string; fullPage?: boolean }): Promise<void>;
  waitForTimeout(milliseconds: number): Promise<void>;
  goBack(): Promise<unknown>;
  url(): string;
  close(): Promise<void>;
  on(event: 'console', listener: (message: BrowserConsoleMessage) => void): void;
  on(event: 'pageerror', listener: (error: Error) => void): void;
}

interface BrowserConsoleMessage {
  type(): string;
  text(): string;
}

interface BrowserLocator {
  count(): Promise<number>;
  first(): BrowserLocator;
  click(): Promise<void>;
  waitFor(): Promise<void>;
  innerText(): Promise<string>;
}

interface BrowserContext {
  newPage(options?: { viewport?: { width: number; height: number } }): Promise<BrowserPage>;
}

interface Browser {
  newPage(options?: { viewport?: { width: number; height: number } }): Promise<BrowserPage>;
  newContext(options?: { viewport?: { width: number; height: number } }): Promise<BrowserContext>;
  close(): Promise<void>;
}

interface ChromiumModule {
  chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<Browser> };
}

const READINESS_TIMEOUT_MS = 20_000;

export async function runE2e(
  context: CommandContext,
  args: { readonly mode: E2eMode; readonly scenario?: E2eScenario; readonly 'playwright-module': string; readonly 'chromium-path': string },
): Promise<number> {
  validateE2eArgs(args);
  const artifactDir = join(context.workspace.root, 'target', 'e2e', `${Date.now()}-${process.pid}`);
  const command = `e2e --mode ${args.mode}${args.scenario === undefined ? '' : ` --scenario ${args.scenario}`}`;
  if (context.dryRun) {
    context.log.info(`dry-run: ${command}（不启动进程、不绑定端口、不写文件）`);
    context.log.info(`产物目录: ${artifactDir}`);
    context.log.info('端口: 运行时自动分配隔离候选端口');
    return 0;
  }

  const ports = await allocateE2ePorts(context, args.mode);
  const playwrightModule = args['playwright-module'];
  const chromiumPath = args['chromium-path'];

  await context.fs.mkdir(artifactDir);
  const group = context.supervisor.createGroup();
  const signalRelease = context.signals?.onSignal((signal) => {
    void group.stopAll(signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
  });
  try {
    const stack = group.add(startStack(context, args, ports));
    const origin = await waitForStack(stack, context, args, ports);
    context.log.info(`E2E 栈就绪: ${origin}`);
    await runBrowserJourneys(playwrightModule, chromiumPath, origin, artifactDir, args.mode, args.scenario ?? 'default');
    context.log.info(`E2E 通过，产物目录: ${artifactDir}`);
    return 0;
  } finally {
    signalRelease?.();
    await group.stopAll('SIGTERM');
  }
}

function validateE2eArgs(args: { readonly mode: E2eMode; readonly scenario?: E2eScenario }): void {
  if (args.mode === 'integration' && args.scenario !== undefined) {
    throw new OpsError('USAGE', '--scenario 仅允许与 --mode dev 一起使用', [], EXIT_USAGE);
  }
  if (args.mode === 'dev' && args.scenario === undefined) {
    throw new OpsError('USAGE', '--mode dev 必须显式提供 --scenario', [], EXIT_USAGE);
  }
}

async function allocateE2ePorts(context: CommandContext, mode: E2eMode): Promise<E2ePorts> {
  const base = Math.min(PORT_MAX - 20, Math.max(PORT_MIN, PORT_MIN + 10_000 + (process.pid % 20_000)));
  if (mode === 'integration') {
    const data = await allocatePort({ service: 'data', candidate: base, probe: context.probe });
    const product = await allocatePort({ service: 'product', candidate: Math.min(PORT_MAX - 9, data.port + 11), probe: context.probe, excluded: new Set([data.port]) });
    return { data: data.port, product: product.port };
  }
  const mock = await allocatePort({ service: 'mock', candidate: base, probe: context.probe });
  const web = await allocatePort({ service: 'web', candidate: Math.min(PORT_MAX - 9, mock.port + 11), probe: context.probe, excluded: new Set([mock.port]) });
  return { mock: mock.port, web: web.port };
}

function startStack(
  context: CommandContext,
  args: { readonly mode: E2eMode; readonly scenario?: E2eScenario },
  ports: E2ePorts,
): ManagedProcess {
  const runtimeArgs = args.mode === 'integration'
    ? ['runtime', 'integration', '--content-source', 'fixture', '--product-port', String(ports.product), '--data-port', String(ports.data), '--json']
    : ['runtime', 'dev', '--scenario', args.scenario ?? 'empty', '--web-port', String(ports.web), '--mock-port', String(ports.mock), '--json'];
  return context.supervisor.spawn({
    role: args.mode === 'integration' ? 'product' : 'web',
    command: process.execPath,
    args: ['--experimental-strip-types', join(context.workspace.root, 'apps', 'blog', 'src', 'main.ts'), ...runtimeArgs],
    cwd: context.workspace.root,
  });
}

async function waitForStack(
  stack: ManagedProcess,
  context: CommandContext,
  args: { readonly mode: E2eMode },
  ports: E2ePorts,
): Promise<string> {
  let payload: E2ePayload | undefined;
  const release = stack.onLine((line) => {
    try {
      const value: unknown = JSON.parse(line.text);
      if (isE2ePayload(value)) payload = value;
    } catch {
      context.log.log(line.role, line.text);
    }
  });
  const port = args.mode === 'integration' ? ports.product : ports.web;
  if (port === undefined) throw new OpsError('SERVICE_START_FAILED', 'E2E 运行栈缺少入口端口');
  const ready = await context.readiness.wait(port, { timeoutMs: READINESS_TIMEOUT_MS, isCancelled: () => stack.exited });
  release();
  if (!ready || payload === undefined) {
    const exit = await stack.exit();
    throw new OpsError('SERVICE_START_FAILED', `E2E 运行栈未就绪(exit ${exit.code ?? 'signal'})`, [{ service: args.mode, port }]);
  }
  return payload.entry;
}

async function runBrowserJourneys(
  modulePath: string,
  chromiumPath: string,
  origin: string,
  artifactDir: string,
  mode: E2eMode,
  scenario: string,
): Promise<void> {
  const { chromium } = (await import(modulePath)) as ChromiumModule;
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const failures: string[] = [];
  try {
    if (mode === 'integration') {
      await runIntegrationJourneys(browser, origin, artifactDir, failures);
    } else {
      await runDevJourney(browser, origin, artifactDir, scenario, failures);
    }
    if (failures.length > 0) throw new OpsError('BUILD_FAILED', `浏览器页面出现未捕获错误: ${failures.join('; ')}`);
  } finally {
    await browser.close();
  }
}

async function runIntegrationJourneys(browser: Browser, origin: string, artifactDir: string, failures: string[]): Promise<void> {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await assertPage(desktop, 'desktop-articles', `${origin}/articles/index.html`, artifactDir, failures, async (page) => {
    await page.getByRole('heading', { name: '全部文章', exact: true }).waitFor();
    if (await page.locator('a.archive-row').count() === 0) throw new Error('desktop article archive is empty');
  });
  await desktop.goto(`${origin}/articles/detail.html?id=1`, { waitUntil: 'networkidle' });
  await desktop.locator('.article h1').waitFor();
  await desktop.screenshot({ path: join(artifactDir, 'desktop-detail.png'), fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await assertPage(mobile, 'mobile-articles', `${origin}/m/articles/index.html`, artifactDir, failures, async (page) => {
    await page.getByRole('heading', { name: '分类浏览', exact: true }).waitFor();
    if (await page.locator('.category-root-list button').count() === 0) throw new Error('mobile categories are empty');
    await page.locator('.category-root-list button').first().click();
    await page.waitForTimeout(50);
    if (!/category_id=/.test(page.url())) throw new Error('category selection did not update URL');
    await page.goBack();
    await page.waitForTimeout(50);
    if (/category_id=/.test(page.url())) throw new Error('browser back did not restore category URL');
  });
  await mobile.goto(`${origin}/m/articles/detail.html?id=1`, { waitUntil: 'networkidle' });
  await mobile.locator('.mobile-article h1').waitFor();
  await mobile.screenshot({ path: join(artifactDir, 'mobile-detail.png'), fullPage: true });
  await desktop.close();
  await mobile.close();
}

async function runDevJourney(browser: Browser, origin: string, artifactDir: string, scenario: string, failures: string[]): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await assertPage(page, `dev-${scenario}`, `${origin}/m/articles/index.html`, artifactDir, failures, async (current) => {
    if (scenario === 'empty') {
      await current.getByText('暂无可浏览分类', { exact: true }).waitFor();
      return;
    }
    if (scenario === 'slow') {
      await current.getByText('正在加载分类…', { exact: true }).waitFor();
      await current.locator('.category-root-list button').first().waitFor();
      return;
    }
    await current.getByRole('alert', {}).waitFor();
    const message = await current.getByRole('alert', {}).innerText();
    if (!/分类加载失败/.test(message)) throw new Error(`unexpected error state: ${message}`);
  }, scenario === 'slow' ? 'domcontentloaded' : 'networkidle');
  await page.close();
}

async function assertPage(
  page: BrowserPage,
  name: string,
  url: string,
  artifactDir: string,
  failures: string[],
  checks: (page: BrowserPage) => Promise<void>,
  waitUntil: string = 'networkidle',
): Promise<void> {
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`${name}: console ${message.text()}`);
  });
  page.on('pageerror', (error: Error) => failures.push(`${name}: pageerror ${error.message}`));
  try {
    await page.goto(url, { waitUntil });
    await checks(page);
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    if (!noOverflow) throw new Error(`${name}: horizontal overflow`);
    await page.screenshot({ path: join(artifactDir, `${name}.png`), fullPage: true });
  } catch (error) {
    await page.screenshot({ path: join(artifactDir, `${name}-failure.png`), fullPage: true }).catch(() => undefined);
    throw error;
  }
}

function isE2ePayload(value: unknown): value is E2ePayload {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === true && 'entry' in value && typeof value.entry === 'string';
}
