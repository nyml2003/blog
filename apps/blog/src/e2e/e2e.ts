import { join } from 'node:path';
import type { CommandContext } from '@fluvient-cli/cli-kit/commands.ts';
import { EXIT_OK, EXIT_USAGE, OpsError } from '@fluvient-cli/cli-kit/errors.ts';
import { allocatePort, PORT_MAX, PORT_MIN } from '@fluvient-cli/cli-kit/port-allocation.ts';
import type { ManagedProcess } from '@fluvient-cli/cli-kit/ports.ts';

export const E2E_MODES = ['integration', 'dev'] as const;
export type E2eMode = (typeof E2E_MODES)[number];
export const E2E_SCENARIOS = ['empty', 'slow', 'server-error', 'malformed-response'] as const;
export type E2eScenario = (typeof E2E_SCENARIOS)[number];

export interface E2ePorts {
  readonly product?: number;
  readonly data?: number;
  readonly web?: number;
  readonly mock?: number;
}

interface E2ePayload {
  readonly ok: true;
  readonly entry: string;
}

interface E2eReport {
  readonly version: 1;
  readonly mode: E2eMode;
  readonly scenario: string;
  readonly origin: string;
  readonly status: 'passed' | 'failed';
  readonly error?: string;
}

interface BrowserPage {
  addInitScript(script: () => void): Promise<void>;
  addInitScript<T>(script: (arg: T) => void, arg: T): Promise<void>;
  goto(url: string, options?: { waitUntil?: string }): Promise<unknown>;
  getByRole(role: string, options?: { name?: string; exact?: boolean }): BrowserLocator;
  getByLabel(text: string | RegExp, options?: { exact?: boolean }): BrowserLocator;
  getByText(text: string | RegExp, options?: { exact?: boolean }): BrowserLocator;
  locator(selector: string): BrowserLocator;
  evaluate<T>(callback: () => T): Promise<T>;
  evaluate<T, Arg>(callback: (arg: Arg) => T, arg: Arg): Promise<T>;
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
  fill(value: string): Promise<void>;
  press(key: string): Promise<void>;
  pressSequentially(text: string): Promise<void>;
  hover(): Promise<void>;
  selectOption(value: string): Promise<void>;
  inputValue(): Promise<string>;
  waitFor(): Promise<void>;
  innerText(): Promise<string>;
}

interface BrowserContext {
  newPage(options?: { viewport?: { width: number; height: number } }): Promise<BrowserPage>;
}

interface Browser {
  newPage(options?: { viewport?: { width: number; height: number }; javaScriptEnabled?: boolean }): Promise<BrowserPage>;
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
    return EXIT_OK;
  }

  const ports = await allocateE2ePorts(context, args.mode);
  const playwrightModule = args['playwright-module'];
  const chromiumPath = args['chromium-path'];

  await context.fs.mkdir(artifactDir);
  const group = context.supervisor.createGroup();
  const signalRelease = context.signals?.onSignal((signal) => {
    void group.stopAll(signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
  });
  let origin = 'unavailable';
  try {
    const stack = group.add(startStack(context, args, ports));
    origin = await waitForStack(stack, context, args, ports);
    context.log.info(`E2E 栈就绪: ${origin}`);
    await runBrowserJourneys(playwrightModule, chromiumPath, origin, artifactDir, args.mode, args.scenario ?? 'default');
    await writeE2eReport(context, artifactDir, {
      version: 1,
      mode: args.mode,
      scenario: args.scenario ?? 'default',
      origin,
      status: 'passed',
    });
    context.log.info(`E2E 通过，产物目录: ${artifactDir}`);
    return EXIT_OK;
  } catch (error) {
    await writeE2eReport(context, artifactDir, {
      version: 1,
      mode: args.mode,
      scenario: args.scenario ?? 'default',
      origin,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    signalRelease?.();
    await group.stopAll('SIGTERM');
  }
}

async function writeE2eReport(context: CommandContext, artifactDir: string, report: E2eReport): Promise<void> {
  if (!context.fs.write) return;
  await context.fs.write(join(artifactDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

function validateE2eArgs(args: { readonly mode: E2eMode; readonly scenario?: E2eScenario }): void {
  if (args.mode === 'integration' && args.scenario !== undefined) {
    throw new OpsError('USAGE', '--scenario 仅允许与 --mode dev 一起使用', [], EXIT_USAGE);
  }
  if (args.mode === 'dev' && args.scenario === undefined) {
    throw new OpsError('USAGE', '--mode dev 必须显式提供 --scenario', [], EXIT_USAGE);
  }
}

export async function allocateE2ePorts(context: CommandContext, mode: E2eMode): Promise<E2ePorts> {
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

export function startStack(
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

export async function waitForStack(
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
  if (!ready) {
    const exit = await stack.exit();
    throw new OpsError('SERVICE_START_FAILED', `E2E 运行栈未就绪(exit ${exit.code ?? 'signal'})`, [{ service: args.mode, port }]);
  }
  return payload?.entry ?? `http://127.0.0.1:${port}`;
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
  }, 'domcontentloaded');
  await desktop.goto(`${origin}/articles/detail.html?id=12`, { waitUntil: 'domcontentloaded' });
  await desktop.locator('h1').waitFor();
  await desktop.screenshot({ path: join(artifactDir, 'desktop-detail.png'), fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const shellOnly = await browser.newPage({
    viewport: { width: 375, height: 812 },
    javaScriptEnabled: false,
  });
  await shellOnly.goto(`${origin}/m/articles/detail.html?id=12`, { waitUntil: 'domcontentloaded' });
  const shellProbe = await shellOnly.evaluate(() => {
    const shell = document.querySelector('[data-loom-app-shell="true"]');
    const app = document.querySelector('#app');
    return {
      shellPresent: shell !== null,
      shellVisible: shell instanceof HTMLElement && getComputedStyle(shell).display !== 'none',
      appHidden: app instanceof HTMLElement && getComputedStyle(app).visibility === 'hidden',
    };
  });
  if (!shellProbe.shellPresent || !shellProbe.shellVisible || !shellProbe.appHidden) {
    throw new Error(`mobile-detail: no-JS app shell contract failed: ${JSON.stringify(shellProbe)}`);
  }
  await shellOnly.screenshot({ path: join(artifactDir, 'mobile-detail-shell-no-js.png'), fullPage: true });
  await shellOnly.close();
  await assertDetailShellVariants(browser, origin, artifactDir, failures);
  await assertPage(mobile, 'mobile-home', `${origin}/m/`, artifactDir, failures, async (page) => {
    await page.getByRole('heading', { name: '推荐阅读', exact: true }).waitFor();
    await assertShellLayout(page, 'mobile-home');
  }, 'domcontentloaded');
  await assertPage(mobile, 'mobile-articles', `${origin}/m/articles/index.html`, artifactDir, failures, async (page) => {
    await page.getByRole('heading', { name: '全部文章', exact: true }).waitFor();
    if (await page.locator('.category-root-list button').count() === 0) throw new Error('mobile categories are empty');
    await page.locator('.category-root-list button').first().click();
    await page.waitForTimeout(50);
    if (!/category_id=/.test(page.url())) throw new Error('category selection did not update URL');
    await page.evaluate(() => history.back());
    await page.waitForTimeout(50);
    if (/category_id=/.test(page.url())) throw new Error('browser back did not restore category URL');
    await assertShellLayout(page, 'mobile-articles');
    await assertStickyDocked(page, 'mobile-articles', '.category-root-list', '--shell-header-sticky-top');
  }, 'domcontentloaded');
  await assertPage(mobile, 'mobile-article-list', `${origin}/m/articles/list.html`, artifactDir, failures, async (page) => {
    await page.getByRole('heading', { name: '分类浏览', exact: true }).waitFor();
    await assertShellLayout(page, 'mobile-article-list');
    await assertStickyDocked(page, 'mobile-article-list', '.category-root-list', '--shell-header-sticky-top');
  }, 'domcontentloaded');
  await mobile.addInitScript(() => {
    let value = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
          if (!shift.hadRecentInput) value += shift.value ?? 0;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Browsers without layout-shift support leave the probe undefined.
    }
    (window as typeof window & { __appShellLayoutShift?: () => number }).__appShellLayoutShift = () => value;
  });
  await assertPage(mobile, 'mobile-detail', `${origin}/m/articles/detail.html?id=12`, artifactDir, failures, async (page) => {
    await page.locator('h1').waitFor();
    if (await page.locator('[data-loom-app-shell="true"]').count() !== 0) {
      throw new Error('mobile-detail: app shell was not removed after mount');
    }
    if (await page.locator('.m-bottom-nav').count() !== 0) {
      throw new Error('mobile-detail: bottom nav must stay hidden on detail page');
    }
    const layoutShift = await page.evaluate(() =>
      (window as typeof window & { __appShellLayoutShift?: () => number }).__appShellLayoutShift?.() ?? 0,
    );
    if (layoutShift > 0.01) {
      throw new Error(`mobile-detail: app shell layout shift too large: ${layoutShift}`);
    }
    await assertSafeAreaWiring(page, 'mobile-detail', detailSafeAreaTargets);
  }, 'domcontentloaded');
  await assertPage(mobile, 'mobile-settings', `${origin}/m/settings/index.html`, artifactDir, failures, async (page) => {
    await page.getByRole('heading', { name: '设置', exact: true }).waitFor();
    await assertBottomNavDocked(page, 'mobile-settings');
    await assertSafeAreaWiring(page, 'mobile-settings', shellSafeAreaTargets);
  }, 'domcontentloaded');
  await desktop.close();
  await mobile.close();
}

interface DetailShellVariant {
  readonly theme: 'paper' | 'dark' | 'sepia';
  readonly font: 'sans' | 'serif' | 'mono';
  readonly surface: string;
  readonly skeleton: string;
}

const detailShellVariants: readonly DetailShellVariant[] = [
  { theme: 'paper', font: 'sans', surface: 'rgb(244, 241, 234)', skeleton: 'rgb(231, 226, 217)' },
  { theme: 'dark', font: 'serif', surface: 'rgb(32, 33, 36)', skeleton: 'rgb(53, 56, 62)' },
  { theme: 'sepia', font: 'mono', surface: 'rgb(241, 230, 207)', skeleton: 'rgb(221, 206, 180)' },
];

async function assertDetailShellVariants(
  browser: Browser,
  origin: string,
  artifactDir: string,
  failures: string[],
): Promise<void> {
  for (const variant of detailShellVariants) {
    const page = await browser.newPage({ viewport: { width: variant.theme === 'sepia' ? 430 : 375, height: 812 } });
    await page.addInitScript((settings: Pick<DetailShellVariant, 'theme' | 'font'>) => {
      localStorage.setItem('blog.mobile.settings.v1', JSON.stringify(settings));
      window.fetch = () => new Promise<Response>(() => undefined);
    }, variant);
    await assertPage(
      page,
      `mobile-detail-shell-${variant.theme}-${variant.font}`,
      `${origin}/m/articles/detail.html?id=12`,
      artifactDir,
      failures,
      async (current) => {
        const probe = await current.evaluate(() => {
          const shell = document.querySelector<HTMLElement>('[data-loom-app-shell="true"]');
          const placeholder = shell?.querySelector<HTMLElement>('[data-loom-shell-placeholder="1-7"]');
          if (!shell || !placeholder) throw new Error('mobile-detail shell variant is missing');
          const shellStyle = getComputedStyle(shell);
          const placeholderStyle = getComputedStyle(placeholder);
          const region = shell.querySelector<HTMLElement>('[data-loom-shell-region-index="1"]');
          return {
            theme: document.documentElement.getAttribute('data-theme'),
            font: document.documentElement.getAttribute('data-font'),
            surface: shellStyle.backgroundColor,
            skeleton: placeholderStyle.backgroundColor,
            animation: placeholderStyle.animationName,
            shellWidth: shell.getBoundingClientRect().width,
            viewportWidth: innerWidth,
            mediaHeight: placeholder.getBoundingClientRect().height,
            regionHeight: region?.getBoundingClientRect().height ?? 0,
          };
        });
        if (probe.theme !== variant.theme || probe.font !== variant.font) {
          throw new Error(`mobile-detail shell settings did not apply: ${JSON.stringify(probe)}`);
        }
        if (probe.surface !== variant.surface || probe.skeleton !== variant.skeleton) {
          throw new Error(`mobile-detail shell colors drifted: ${JSON.stringify(probe)}`);
        }
        if (probe.animation !== 'none') throw new Error(`mobile-detail shell unexpectedly animates: ${JSON.stringify(probe)}`);
        if (probe.shellWidth !== probe.viewportWidth) throw new Error(`mobile-detail shell width drifted: ${JSON.stringify(probe)}`);
        if (Math.abs(probe.mediaHeight - 180) > 1 || probe.regionHeight < 720) {
          throw new Error(`mobile-detail shell geometry drifted: ${JSON.stringify(probe)}`);
        }
      },
      'domcontentloaded',
    );
    await page.close();
  }
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
    if (!/分类加载失败|页面初始化失败/.test(message)) throw new Error(`unexpected error state: ${message}`);
  }, scenario === 'slow' ? 'domcontentloaded' : 'networkidle', scenario === 'empty' ? [] : [500]);
  if (scenario === 'empty') {
    const wide = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await assertPage(wide, 'dev-desktop-home-wide', `${origin}/`, artifactDir, failures, async (current) => {
      await current.getByRole('heading', { name: '近期推荐', exact: true }).waitFor();
      const layout = await current.evaluate(() => {
        const root = document.querySelector('.desktop-home');
        if (!root) throw new Error('desktop home root is missing');
        const rootRect = root.getBoundingClientRect();
        return {
          rootWidth: rootRect.width,
          viewportWidth: innerWidth,
          background: getComputedStyle(document.body).backgroundColor,
        };
      });
      if (layout.rootWidth < layout.viewportWidth - 1) throw new Error(`desktop home does not cover viewport: ${JSON.stringify(layout)}`);
      if (layout.background === 'rgb(255, 255, 255)') throw new Error(`desktop home background is white: ${JSON.stringify(layout)}`);
      const rows = current.locator('.archive-row');
      if (await rows.count() > 0) {
        await rows.first().hover();
        const hovered = await current.evaluate(() => getComputedStyle(document.querySelector('.archive-row')!, '::before').transform);
        if (hovered === 'none' || hovered === 'matrix(1, 0, 0, 1, 0, 0)') throw new Error('desktop archive hover indicator did not activate');
      } else {
        const filter = current.locator('.t-shelf-filters button').first();
        await filter.hover();
        const hovered = await current.evaluate(() => getComputedStyle(document.querySelector('.t-shelf-filters button')!).color);
        if (hovered === 'rgb(24, 34, 48)' || hovered === '') throw new Error('desktop filter hover state did not activate');
      }
    });
    await assertPage(wide, 'dev-home-wide', `${origin}/m/`, artifactDir, failures, async (current) => {
      await current.getByRole('heading', { name: '推荐阅读', exact: true }).waitFor();
    });
    await assertPage(wide, 'dev-settings-wide', `${origin}/m/settings/index.html`, artifactDir, failures, async (current) => {
      await current.getByRole('heading', { name: '设置', exact: true }).waitFor();
      const theme = current.locator('select[name="theme"]');
      const font = current.locator('select[name="font"]');
      await theme.selectOption('dark');
      await font.selectOption('mono');
      await current.waitForTimeout(150);
      const attributes = await current.evaluate(() => ({
        theme: document.documentElement.getAttribute('data-theme'),
        font: document.documentElement.getAttribute('data-font'),
      }));
      if (attributes.theme !== 'dark' || attributes.font !== 'mono') {
        throw new Error(`settings did not apply: ${JSON.stringify(attributes)}`);
      }
      await current.goto(`${origin}/m/settings/index.html`, { waitUntil: 'domcontentloaded' });
      await theme.waitFor();
      if (await theme.inputValue() !== 'dark' || await font.inputValue() !== 'mono') {
        throw new Error('settings did not persist after reload');
      }
    });
    await assertPage(wide, 'dev-admin-validation', `${origin}/admin/login.html?next=%2Fadmin%2Farticles%2Fnew.html`, artifactDir, failures, async (current) => {
      await current.getByRole('heading', { name: '管理台登录', exact: true }).waitFor();
      await current.locator('#admin-password').fill('e2e-password');
      const verificationCode = current.locator('#verification-code');
      if (await verificationCode.count() > 0) {
        await verificationCode.waitFor();
        await verificationCode.fill('000000');
        if (await verificationCode.inputValue() !== '000000') await verificationCode.pressSequentially('000000');
      }
      await current.getByRole('button', { name: '登录', exact: true }).click();
      await current.goto(`${origin}/admin/articles/new.html`, { waitUntil: 'networkidle' });
      await current.getByRole('heading', { name: '新建文章', exact: true }).waitFor();

      await current.getByLabel('标题', { exact: true }).fill('E2E 管理端草稿');
      await current.getByLabel('摘要', { exact: true }).fill('E2E 管理端保存链路');
      const editor = current.locator('.cm-content');
      await editor.click();
      await editor.pressSequentially('<script>alert(1)</script>');
      await current.getByRole('button', { name: '保存到待提交批次', exact: true }).click();
      const validation = current.getByText(/正文 HTML 校验未通过/, { exact: false });
      await validation.waitFor();
      const validationMessage = await validation.innerText();
      if (!/HTML|危险|校验/.test(validationMessage)) throw new Error(`unexpected validation state: ${validationMessage}`);

    });
    await wide.close();
  }
  if (scenario === 'server-error' || scenario === 'malformed-response') {
    await assertPage(page, `dev-${scenario}-detail`, `${origin}/m/articles/detail.html?id=12`, artifactDir, failures, async (current) => {
      const alert = current.getByRole('alert', {});
      await alert.waitFor();
      const message = await alert.innerText();
      if (!/文章不存在或暂不可见|页面初始化失败/.test(message)) throw new Error(`unexpected detail error state: ${message}`);
      if (await current.locator('[data-loom-app-shell="true"]').count() !== 0) throw new Error(`dev-${scenario}-detail: app shell was not removed`);
    }, 'networkidle', [500]);
  }
  await page.close();
}

interface StickyProbe {
  readonly present: boolean;
  readonly scrollY: number;
  readonly top: number | null;
  readonly position: string | null;
  readonly offset: number;
}

interface BottomNavProbe {
  readonly present: boolean;
  readonly viewport: number;
  readonly bottomBefore: number | null;
  readonly bottomAfter: number | null;
  readonly topAfter: number | null;
}

interface SafeAreaTarget {
  readonly selector: string;
  readonly property: 'paddingTop' | 'paddingBottom';
  readonly cssVar: string;
  readonly injected: string;
  readonly expected: number;
}

interface SafeAreaProbe {
  readonly selector: string;
  readonly before: string | null;
  readonly after: string | null;
}

const shellSafeAreaTargets: readonly SafeAreaTarget[] = [
  { selector: '.mobile-header', property: 'paddingTop', cssVar: '--safe-area-top', injected: '44px', expected: 44 },
  { selector: '.m-bottom-nav', property: 'paddingBottom', cssVar: '--safe-area-bottom', injected: '34px', expected: 40 },
];

const detailSafeAreaTargets: readonly SafeAreaTarget[] = [
  { selector: '.mobile-header', property: 'paddingTop', cssVar: '--safe-area-top', injected: '44px', expected: 44 },
];

async function assertStickyDocked(page: BrowserPage, name: string, selector: string, topOffsetVar?: string): Promise<void> {
  const sticky = await page.evaluate<StickyProbe, { selector: string; offsetVar?: string }>((options) => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const element = document.querySelector(options.selector);
    const attached = element instanceof HTMLElement;
    const styles = attached ? getComputedStyle(element) : null;
    return {
      present: attached,
      scrollY: Math.round(window.scrollY),
      top: attached ? element.getBoundingClientRect().top : null,
      position: styles === null ? null : styles.position,
      offset: options.offsetVar === undefined
        ? 0
        : parseFloat(getComputedStyle(document.documentElement).getPropertyValue(options.offsetVar)),
    };
  }, { selector, offsetVar: topOffsetVar });
  if (!sticky.present || sticky.top === null || sticky.position === null) {
    throw new Error(`${name}: ${selector} is missing`);
  }
  if (sticky.scrollY < 100) throw new Error(`${name}: page too short to verify ${selector} (scrollY=${sticky.scrollY})`);
  if (Math.abs(sticky.top - sticky.offset) > 1) {
    throw new Error(`${name}: ${selector} not docked after scroll: ${JSON.stringify(sticky)}`);
  }
}

async function assertBottomNavDocked(page: BrowserPage, name: string): Promise<void> {
  const nav = await page.evaluate<BottomNavProbe>(() => {
    const element = document.querySelector('.m-bottom-nav');
    if (!(element instanceof HTMLElement)) {
      return { present: false, viewport: innerHeight, bottomBefore: null, bottomAfter: null, topAfter: null };
    }
    window.scrollTo(0, 0);
    const before = element.getBoundingClientRect();
    window.scrollTo(0, document.documentElement.scrollHeight);
    const after = element.getBoundingClientRect();
    return { present: true, viewport: innerHeight, bottomBefore: before.bottom, bottomAfter: after.bottom, topAfter: after.top };
  });
  if (!nav.present || nav.bottomBefore === null || nav.bottomAfter === null || nav.topAfter === null) {
    throw new Error(`${name}: .m-bottom-nav is missing`);
  }
  if (Math.abs(nav.bottomBefore - nav.viewport) > 1 || Math.abs(nav.bottomAfter - nav.viewport) > 1) {
    throw new Error(`${name}: bottom nav not docked to viewport bottom: ${JSON.stringify(nav)}`);
  }
  if (nav.topAfter < 0 || nav.topAfter >= nav.viewport) {
    throw new Error(`${name}: bottom nav outside viewport: ${JSON.stringify(nav)}`);
  }
}

async function assertSafeAreaWiring(page: BrowserPage, name: string, targets: readonly SafeAreaTarget[]): Promise<void> {
  const probes = await page.evaluate<readonly SafeAreaProbe[], readonly SafeAreaTarget[]>((areaTargets) => {
    const read = () => areaTargets.map((target) => {
      const element = document.querySelector(target.selector);
      return element instanceof HTMLElement ? getComputedStyle(element)[target.property] : null;
    });
    const before = read();
    const rootStyle = document.documentElement.style;
    for (const target of areaTargets) rootStyle.setProperty(target.cssVar, target.injected);
    const after = read();
    for (const target of areaTargets) rootStyle.removeProperty(target.cssVar);
    return areaTargets.map((target, index) => ({
      selector: target.selector,
      before: before[index] ?? null,
      after: after[index] ?? null,
    }));
  }, targets);
  for (const target of targets) {
    const probe = probes.find((item) => item.selector === target.selector);
    const actual = probe?.after === null || probe?.after === undefined ? null : parseFloat(probe.after);
    if (actual === null || Math.abs(actual - target.expected) > 0.5) {
      throw new Error(
        `${name}: safe-area wiring broken for ${target.selector} `
          + `(expected ${target.property}=${target.expected}px after injecting ${target.cssVar}=${target.injected}, got ${probe?.after ?? 'missing element'})`,
      );
    }
  }
}

async function assertShellLayout(page: BrowserPage, name: string): Promise<void> {
  await assertStickyDocked(page, name, '.mobile-header');
  await assertBottomNavDocked(page, name);
  await assertSafeAreaWiring(page, name, shellSafeAreaTargets);
}

async function assertPage(
  page: BrowserPage,
  name: string,
  url: string,
  artifactDir: string,
  failures: string[],
  checks: (page: BrowserPage) => Promise<void>,
  waitUntil: string = 'networkidle',
  ignoredConsoleStatuses: readonly number[] = [],
): Promise<void> {
  page.on('console', (message) => {
    const isMissingFavicon = message.text() === 'Failed to load resource: the server responded with a status of 404 (Not Found)';
    const isIgnoredStatus = ignoredConsoleStatuses.some((status) => message.text().includes(`status of ${status} (`));
    if (message.type() === 'error' && !isMissingFavicon && !isIgnoredStatus) failures.push(`${name}: console ${message.text()}`);
  });
  page.on('pageerror', (error: Error) => failures.push(`${name}: pageerror ${error.message}`));
  try {
    await page.goto(url, { waitUntil });
    await checks(page);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
      offenders: [...document.querySelectorAll('*')].filter((element) => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map((element) => ({
        tag: element.tagName,
        className: String(element.className),
        right: element.getBoundingClientRect().right,
      })),
    }));
    if (overflow.scrollWidth > overflow.viewport) throw new Error(`${name}: horizontal overflow ${JSON.stringify(overflow)}`);
    await page.screenshot({ path: join(artifactDir, `${name}.png`), fullPage: true });
  } catch (error) {
    await page.screenshot({ path: join(artifactDir, `${name}-failure.png`), fullPage: true }).catch(() => undefined);
    throw error;
  }
}

function isE2ePayload(value: unknown): value is E2ePayload {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === true && 'entry' in value && typeof value.entry === 'string';
}
