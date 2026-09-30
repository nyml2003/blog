import { join } from 'node:path';
import type { CommandContext } from '@fluvient-cli/cli-kit/commands.ts';
import { EXIT_OK, EXIT_USAGE, OpsError } from '@fluvient-cli/cli-kit/errors.ts';
import { allocateE2ePorts, startStack, waitForStack } from './e2e.ts';

export const E2E_PERF_PROFILES = ['unthrottled', 'slow4g', 'slow3g'] as const;
export type E2ePerfProfile = (typeof E2E_PERF_PROFILES)[number];
export const E2E_PERF_DEFAULT_RUNS = 3;

export interface E2ePerfArgs {
  readonly mode?: 'integration';
  readonly origin?: string;
  readonly runs?: number;
  readonly profile?: E2ePerfProfile;
  readonly 'playwright-module': string;
  readonly 'chromium-path': string;
}

interface PerfSettings {
  readonly mode: 'integration' | 'remote';
  readonly origin: string;
  readonly runs: number;
  readonly profiles: readonly E2ePerfProfile[];
}

type NetworkConditions = { readonly download: number; readonly upload: number; readonly latency: number };

// Playwright 1.63 的 BrowserContext 不再暴露 setNetworkConditions，
// 网络档位通过该页面的 CDP Network.emulateNetworkConditions 生效（跨同标签页导航保持）。
const PROFILE_CONDITIONS: Readonly<Record<Exclude<E2ePerfProfile, 'unthrottled'>, NetworkConditions>> = {
  slow4g: { download: (1.6 * 1024 * 1024) / 8, upload: (750 * 1024) / 8, latency: 150 },
  slow3g: { download: (400 * 1024) / 8, upload: (400 * 1024) / 8, latency: 400 },
};

const VIEWPORT = { width: 390, height: 844 } as const;
// 渲染帧完成后 paint/LCP 条目才进入 performance buffer，采样前先等一拍。
// 只延迟指标收集时机，不影响已记录的 shellMs/contentMs。
const PAINT_SETTLE_MS = 300;
const ARTICLES_PAGE = '/m/articles/index.html';
const HOME_PAGE = '/m/';
const SHELL_SELECTOR = '.m-bottom-nav';
const CONTENT_SELECTOR = '.category-root-list button, .article-card';
const HOME_SETTLED_SELECTOR = '.mobile-t-shelf-content .article-card, .mobile-t-shelf-content .m-state-message';

const LCP_INIT_SCRIPT = `(() => {
  try {
    const entries = [];
    window.__perfLcp = entries;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) entries.push({ startTime: entry.startTime, size: entry.size });
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // LCP 不支持时保持字段缺失，不阻塞度量。
  }
})();`;

export interface RawResourceSample {
  readonly name: string;
  readonly durationMs: number;
  readonly transferBytes: number;
  readonly decodedBytes: number;
}

export interface RawNavigationMetrics {
  readonly html: { readonly responseEndMs: number; readonly transferBytes: number } | undefined;
  readonly firstContentfulPaintMs: number | undefined;
  readonly largestContentfulPaintMs: number | undefined;
  readonly resources: readonly RawResourceSample[];
}

export type ResourceKind = 'js' | 'css' | 'siteRoutes' | 'dataApi' | 'other';

export function classifyResource(name: string): ResourceKind {
  const path = name.split('?')[0] ?? name;
  if (path.includes('/api/public/site-routes')) return 'siteRoutes';
  if (path.includes('/api/')) return 'dataApi';
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'js';
  if (path.endsWith('.css')) return 'css';
  return 'other';
}

export interface AggregatedRunNumbers {
  readonly htmlMs: number | undefined;
  readonly js: { readonly requests: number; readonly bytes: number };
  readonly css: { readonly requests: number; readonly bytes: number };
  readonly siteRoutesMs: number | undefined;
  readonly dataApi: { readonly requests: number; readonly bytes: number; readonly totalMs: number };
  readonly requestCount: number;
  readonly transferredBytes: number;
  readonly cacheHits: number;
  readonly staticAssets: {
    readonly decodedBytes: number;
    readonly reusedDecodedBytes: number;
    readonly reuseRate: number | undefined;
  };
}

export function aggregateNavigationMetrics(raw: RawNavigationMetrics): AggregatedRunNumbers {
  let jsRequests = 0;
  let jsBytes = 0;
  let cssRequests = 0;
  let cssBytes = 0;
  let dataApiRequests = 0;
  let dataApiBytes = 0;
  let dataApiTotalMs = 0;
  let siteRoutesMs: number | undefined;
  let cacheHits = 0;
  let resourceBytes = 0;
  let staticDecodedBytes = 0;
  let staticReusedDecodedBytes = 0;
  for (const resource of raw.resources) {
    resourceBytes += resource.transferBytes;
    if (resource.decodedBytes > 0 && resource.transferBytes === 0) cacheHits += 1;
    const kind = classifyResource(resource.name);
    if (kind === 'js' || kind === 'css') {
      staticDecodedBytes += resource.decodedBytes;
      if (resource.decodedBytes > 0 && resource.transferBytes === 0) {
        staticReusedDecodedBytes += resource.decodedBytes;
      }
    }
    if (kind === 'js') {
      jsRequests += 1;
      jsBytes += resource.transferBytes;
    } else if (kind === 'css') {
      cssRequests += 1;
      cssBytes += resource.transferBytes;
    } else if (kind === 'siteRoutes') {
      siteRoutesMs = resource.durationMs;
    } else if (kind === 'dataApi') {
      dataApiRequests += 1;
      dataApiBytes += resource.transferBytes;
      dataApiTotalMs += resource.durationMs;
    }
  }
  return {
    htmlMs: raw.html?.responseEndMs,
    js: { requests: jsRequests, bytes: jsBytes },
    css: { requests: cssRequests, bytes: cssBytes },
    siteRoutesMs,
    dataApi: { requests: dataApiRequests, bytes: dataApiBytes, totalMs: dataApiTotalMs },
    requestCount: raw.resources.length,
    transferredBytes: resourceBytes + (raw.html?.transferBytes ?? 0),
    cacheHits,
    staticAssets: {
      decodedBytes: staticDecodedBytes,
      reusedDecodedBytes: staticReusedDecodedBytes,
      reuseRate: staticDecodedBytes === 0 ? undefined : staticReusedDecodedBytes / staticDecodedBytes,
    },
  };
}

export interface Stat {
  readonly median: number;
  readonly min: number;
  readonly max: number;
}

export function summarizeNumbers(values: readonly number[]): Stat | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  return { median, min: sorted[0], max: sorted[sorted.length - 1] };
}

type JourneyName = 'cold-load' | 'nav-switch';

export interface JourneyRun {
  readonly journey: JourneyName;
  readonly run: number;
  readonly shellMs: number;
  readonly contentMs: number;
  readonly firstContentfulPaintMs: number | undefined;
  readonly largestContentfulPaintMs: number | undefined;
  readonly metrics: AggregatedRunNumbers;
}

export interface JourneySummary {
  readonly journey: JourneyName;
  readonly runs: readonly JourneyRun[];
  readonly summary: {
    readonly shellMs?: Stat;
    readonly contentMs?: Stat;
    readonly firstContentfulPaintMs?: Stat;
    readonly largestContentfulPaintMs?: Stat;
    readonly transferredBytes?: Stat;
    readonly jsBytes?: Stat;
    readonly cacheHits?: Stat;
    readonly requestCount?: Stat;
    readonly staticAssetReuseRate?: Stat;
    readonly staticAssetReusedBytes?: Stat;
  };
}

export function buildJourneySummary(runs: readonly JourneyRun[]): JourneySummary {
  const defined = <T>(value: T | undefined): value is T => value !== undefined;
  return {
    journey: runs[0]?.journey ?? 'cold-load',
    runs,
    summary: {
      shellMs: summarizeNumbers(runs.map((sample) => sample.shellMs)),
      contentMs: summarizeNumbers(runs.map((sample) => sample.contentMs)),
      firstContentfulPaintMs: summarizeNumbers(runs.map((sample) => sample.firstContentfulPaintMs).filter(defined)),
      largestContentfulPaintMs: summarizeNumbers(runs.map((sample) => sample.largestContentfulPaintMs).filter(defined)),
      transferredBytes: summarizeNumbers(runs.map((sample) => sample.metrics.transferredBytes)),
      jsBytes: summarizeNumbers(runs.map((sample) => sample.metrics.js.bytes)),
      cacheHits: summarizeNumbers(runs.map((sample) => sample.metrics.cacheHits)),
      requestCount: summarizeNumbers(runs.map((sample) => sample.metrics.requestCount)),
      staticAssetReuseRate: summarizeNumbers(runs
        .map((sample) => sample.metrics.staticAssets.reuseRate)
        .filter(defined)),
      staticAssetReusedBytes: summarizeNumbers(runs.map((sample) => sample.metrics.staticAssets.reusedDecodedBytes)),
    },
  };
}

export interface ProfileResult {
  readonly profile: E2ePerfProfile;
  readonly journeys: readonly JourneySummary[];
}

export interface PerfReport {
  readonly version: 1;
  readonly kind: 'perf';
  readonly status: 'passed' | 'failed';
  readonly origin: string;
  readonly mode: 'integration' | 'remote';
  readonly createdAt: string;
  readonly settings: { readonly runs: number; readonly profiles: readonly E2ePerfProfile[]; readonly viewport: { readonly width: number; readonly height: number } };
  readonly results: readonly ProfileResult[];
  readonly error?: string;
}

interface PerfLocator {
  click(): Promise<void>;
  first(): PerfLocator;
  waitFor(): Promise<void>;
}

interface PerfPage {
  goto(url: string, options?: { readonly waitUntil?: string }): Promise<unknown>;
  getByRole(role: string, options?: { readonly name?: string; readonly exact?: boolean }): PerfLocator;
  locator(selector: string): PerfLocator;
  evaluate<T>(callback: () => T): Promise<T>;
  waitForURL(pattern: string): Promise<unknown>;
  waitForTimeout(milliseconds: number): Promise<void>;
  close(): Promise<void>;
}

interface PerfCdpSession {
  send(method: 'Network.emulateNetworkConditions', params: Record<string, number | boolean>): Promise<unknown>;
}

interface PerfContext {
  newPage(): Promise<PerfPage>;
  addInitScript(script: string): Promise<void>;
  newCDPSession(page: PerfPage): Promise<PerfCdpSession>;
  close(): Promise<void>;
}

interface PerfBrowser {
  newContext(options?: { readonly viewport?: { readonly width: number; readonly height: number } }): Promise<PerfContext>;
  close(): Promise<void>;
}

interface PerfChromiumModule {
  readonly chromium: { launch(options: { readonly headless: boolean; readonly executablePath: string }): Promise<PerfBrowser> };
}

export async function runE2ePerf(context: CommandContext, args: E2ePerfArgs): Promise<number> {
  const settings = parsePerfSettings(args);
  const artifactDir = join(context.workspace.root, 'target', 'e2e', `${Date.now()}-${process.pid}`);
  if (context.dryRun) {
    context.log.info(`dry-run: perf mobile（网络档位: ${settings.profiles.join(', ')}，每档位 ${settings.runs} 次采样）`);
    context.log.info(`度量目标: ${settings.mode === 'integration' ? `隔离 integration 栈（--mode integration），运行时自动分配隔离候选端口` : settings.origin}`);
    context.log.info(`产物目录: ${artifactDir}（perf-report.json）`);
    return EXIT_OK;
  }
  if (settings.mode === 'remote') {
    return measureRemote(context, settings, artifactDir, args);
  }
  return measureWithStack(context, settings, artifactDir, args);
}

function parsePerfSettings(args: E2ePerfArgs): PerfSettings {
  const hasMode = args.mode !== undefined;
  const hasOrigin = args.origin !== undefined;
  if (hasMode === hasOrigin) {
    throw new OpsError('USAGE', '必须且只能提供 --mode integration 或 --origin 之一', [], EXIT_USAGE);
  }
  if (hasOrigin && !/^https?:\/\//.test(args.origin ?? '')) {
    throw new OpsError('USAGE', '--origin 必须是 http:// 或 https:// 开头的完整入口 URL', [], EXIT_USAGE);
  }
  return {
    mode: hasMode ? 'integration' : 'remote',
    origin: hasOrigin ? stripTrailingSlash(args.origin ?? '') : '',
    runs: args.runs ?? E2E_PERF_DEFAULT_RUNS,
    profiles: args.profile === undefined ? [...E2E_PERF_PROFILES] : [args.profile],
  };
}

function stripTrailingSlash(origin: string): string {
  return origin.endsWith('/') ? origin.slice(0, -1) : origin;
}

async function measureRemote(
  context: CommandContext,
  settings: PerfSettings,
  artifactDir: string,
  args: E2ePerfArgs,
): Promise<number> {
  await context.fs.mkdir(artifactDir);
  return finishMeasurement(context, settings, artifactDir, settings.origin, args);
}

async function measureWithStack(
  context: CommandContext,
  settings: PerfSettings,
  artifactDir: string,
  args: E2ePerfArgs,
): Promise<number> {
  const ports = await allocateE2ePorts(context, 'integration');
  await context.fs.mkdir(artifactDir);
  const group = context.supervisor.createGroup();
  const signalRelease = context.signals?.onSignal((signal) => {
    void group.stopAll(signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
  });
  try {
    const stack = group.add(startStack(context, { mode: 'integration' }, ports));
    const origin = await waitForStack(stack, context, { mode: 'integration' }, ports);
    context.log.info(`性能度量栈就绪: ${origin}`);
    return await finishMeasurement(context, { ...settings, origin }, artifactDir, origin, args);
  } finally {
    signalRelease?.();
    await group.stopAll('SIGTERM');
  }
}

async function finishMeasurement(
  context: CommandContext,
  settings: PerfSettings,
  artifactDir: string,
  origin: string,
  args: E2ePerfArgs,
): Promise<number> {
  const base: Omit<PerfReport, 'status' | 'results' | 'error'> = {
    version: 1,
    kind: 'perf',
    origin,
    mode: settings.mode,
    createdAt: new Date().toISOString(),
    settings: { runs: settings.runs, profiles: settings.profiles, viewport: VIEWPORT },
  };
  try {
    const results = await runPerfMeasurement(args['playwright-module'], args['chromium-path'], origin, settings);
    await writePerfReport(context, artifactDir, { ...base, status: 'passed', results });
    for (const profile of results) printProfileSummary(context, profile);
    context.log.info(`性能度量完成，产物目录: ${artifactDir}`);
    return EXIT_OK;
  } catch (error) {
    await writePerfReport(context, artifactDir, {
      ...base,
      status: 'failed',
      results: [],
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function runPerfMeasurement(
  modulePath: string,
  chromiumPath: string,
  origin: string,
  settings: PerfSettings,
): Promise<readonly ProfileResult[]> {
  const { chromium } = (await import(modulePath)) as PerfChromiumModule;
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  try {
    const results: ProfileResult[] = [];
    for (const profile of settings.profiles) {
      const journeys: JourneySummary[] = [];
      for (const journey of ['cold-load', 'nav-switch'] as const) {
        const runs: JourneyRun[] = [];
        for (let run = 1; run <= settings.runs; run += 1) {
          runs.push(await runJourneyOnce(browser, origin, profile, journey, run));
        }
        journeys.push(buildJourneySummary(runs));
      }
      results.push({ profile, journeys });
    }
    return results;
  } finally {
    await browser.close();
  }
}

async function runJourneyOnce(
  browser: PerfBrowser,
  origin: string,
  profile: E2ePerfProfile,
  journey: JourneyName,
  run: number,
): Promise<JourneyRun> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  try {
    await context.addInitScript(LCP_INIT_SCRIPT);
    const page = await context.newPage();
    const conditions = profile === 'unthrottled' ? undefined : PROFILE_CONDITIONS[profile];
    if (conditions !== undefined) {
      const session = await context.newCDPSession(page);
      await session.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: conditions.download,
        uploadThroughput: conditions.upload,
        latency: conditions.latency,
      });
    }
    if (journey === 'nav-switch') await settleHomePage(page, origin);
    const startedAt = performance.now();
    if (journey === 'cold-load') {
      await page.goto(`${origin}${ARTICLES_PAGE}`, { waitUntil: 'domcontentloaded' });
    } else {
      await page.getByRole('link', { name: '文章', exact: true }).click();
      await page.waitForURL(`**${ARTICLES_PAGE}*`);
    }
    await page.locator(SHELL_SELECTOR).waitFor();
    const shellMs = performance.now() - startedAt;
    await page.locator(CONTENT_SELECTOR).first().waitFor();
    const contentMs = performance.now() - startedAt;
    await page.waitForTimeout(PAINT_SETTLE_MS);
    const raw = await collectNavigationMetrics(page);
    return {
      journey,
      run,
      shellMs,
      contentMs,
      firstContentfulPaintMs: raw.firstContentfulPaintMs,
      largestContentfulPaintMs: raw.largestContentfulPaintMs,
      metrics: aggregateNavigationMetrics(raw),
    };
  } finally {
    await context.close();
  }
}

async function settleHomePage(page: PerfPage, origin: string): Promise<void> {
  await page.goto(`${origin}${HOME_PAGE}`, { waitUntil: 'domcontentloaded' });
  await page.locator(HOME_SETTLED_SELECTOR).first().waitFor();
}

async function collectNavigationMetrics(page: PerfPage): Promise<RawNavigationMetrics> {
  return page.evaluate(() => {
    // Node 类型环境没有 DOM lib；这些传输字段由浏览器侧 Performance API 保证存在。
    const transferFields = (entry: PerformanceEntry) => entry as unknown as {
      readonly responseEnd: number;
      readonly transferSize: number;
      readonly decodedBodySize: number;
    };
    const navigation = performance.getEntriesByType('navigation')[0];
    const paint = performance.getEntriesByType('paint').find((entry) => entry.name === 'first-contentful-paint');
    const lcpStore = (window as typeof window & { __perfLcp?: Array<{ startTime: number }> }).__perfLcp ?? [];
    const lastLcp = lcpStore.length > 0 ? lcpStore[lcpStore.length - 1] : undefined;
    return {
      html: navigation === undefined ? undefined : {
        responseEndMs: transferFields(navigation).responseEnd,
        transferBytes: transferFields(navigation).transferSize,
      },
      firstContentfulPaintMs: paint?.startTime,
      largestContentfulPaintMs: lastLcp?.startTime,
      resources: performance.getEntriesByType('resource').map((entry) => ({
        name: entry.name,
        durationMs: entry.duration,
        transferBytes: transferFields(entry).transferSize,
        decodedBytes: transferFields(entry).decodedBodySize,
      })),
    };
  });
}

async function writePerfReport(context: CommandContext, artifactDir: string, report: PerfReport): Promise<void> {
  if (!context.fs.write) return;
  await context.fs.write(join(artifactDir, 'perf-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

function printProfileSummary(context: CommandContext, profile: ProfileResult): void {
  for (const journey of profile.journeys) {
    const shell = journey.summary.shellMs?.median;
    const content = journey.summary.contentMs?.median;
    const transferred = journey.summary.transferredBytes?.median;
    const hits = journey.summary.cacheHits?.median;
    const requests = journey.summary.requestCount?.median;
    const reuseRate = journey.summary.staticAssetReuseRate?.median;
    const reusedBytes = journey.summary.staticAssetReusedBytes?.median;
    const fcp = journey.summary.firstContentfulPaintMs?.median;
    const lcp = journey.summary.largestContentfulPaintMs?.median;
    const parts = [
      `shell 中位 ${formatMs(shell)}`,
      `content 中位 ${formatMs(content)}`,
      `FCP 中位 ${formatMs(fcp)}`,
      `LCP 中位 ${formatMs(lcp)}`,
      `传输 ${formatBytes(transferred)}`,
      `缓存命中 ${hits === undefined ? '-' : `${hits}/${requests ?? '-'}`}`,
      `JS/CSS 复用 ${formatBytes(reusedBytes)}（${reuseRate === undefined ? '-' : `${Math.round(reuseRate * 100)}%`}）`,
    ];
    context.log.info(`[${profile.profile}] ${journey.journey}: ${parts.join(' | ')}`);
  }
}

function formatMs(value: number | undefined): string {
  return value === undefined ? '-' : `${Math.round(value)}ms`;
}

function formatBytes(value: number | undefined): string {
  if (value === undefined) return '-';
  if (value < 1024) return `${value}B`;
  return `${(value / 1024).toFixed(1)}KB`;
}
