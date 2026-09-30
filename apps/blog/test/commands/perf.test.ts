import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateNavigationMetrics,
  buildJourneySummary,
  classifyResource,
  runE2ePerf,
  summarizeNumbers,
  type JourneyRun,
  type RawNavigationMetrics,
} from '../../src/e2e/perf.ts';
import type { CommandContext } from '@fluvient-cli/cli-kit/commands.ts';
import type { LogLine, ManagedProcess, ProcessExit, ProcessGroupPort, SpawnRequest } from '@fluvient-cli/cli-kit/ports.ts';

const workspace = {
  root: '/repo',
  web: '/repo/src/frontend',
  apps: '/repo/apps',
  appSource: '/repo/apps/blog/src',
  appTests: '/repo/apps/blog/test',
};

class FakeProcess implements ManagedProcess {
  readonly role = 'product' as const;
  readonly pid = 42;
  exited = false;
  killed = false;
  private readonly listeners = new Set<(line: LogLine) => void>();

  onLine(listener: (line: LogLine) => void): () => void {
    this.listeners.add(listener);
    listener({ role: this.role, stream: 'stdout', text: JSON.stringify({ ok: true, entry: 'http://127.0.0.1:24500' }) });
    return () => this.listeners.delete(listener);
  }

  async exit(): Promise<ProcessExit> {
    return { code: this.exited ? 0 : null, signal: null };
  }

  async kill(): Promise<void> {
    this.killed = true;
    this.exited = true;
  }

  recentLogs(): readonly string[] {
    return [];
  }
}

class FakeGroup implements ProcessGroupPort {
  readonly members: ManagedProcess[] = [];
  stopCount = 0;

  add(process: ManagedProcess): ManagedProcess {
    this.members.push(process);
    return process;
  }

  async stopAll(): Promise<void> {
    this.stopCount += 1;
    for (const member of this.members) await member.kill();
  }

  async firstExit(): Promise<{ process: ManagedProcess; exit: ProcessExit }> {
    const process = this.members[0];
    if (process === undefined) throw new Error('missing process');
    return { process, exit: await process.exit() };
  }
}

function context(overrides: Partial<CommandContext> = {}): CommandContext {
  const group = new FakeGroup();
  const process = new FakeProcess();
  return {
    workspace,
    process: {
      run: async () => ({ code: 0, stdout: '', stderr: '' }),
    },
    supervisor: {
      spawn: (_request: SpawnRequest) => process,
      createGroup: () => group,
    },
    fs: {
      read: async () => '',
      exists: async () => false,
      files: async () => [],
      mkdir: async () => undefined,
    },
    reporter: { section: () => undefined, ok: () => undefined, fail: () => undefined, info: () => undefined },
    log: { info: () => undefined, error: () => undefined, log: () => undefined, json: () => undefined },
    probe: { isFree: async () => true },
    readiness: { wait: async () => true },
    binaries: { resolve: async () => undefined },
    environment: {},
    dryRun: false,
    json: false,
    ...overrides,
  };
}

const stackArgs = {
  mode: 'integration' as const,
  'playwright-module': 'missing-playwright-module',
  'chromium-path': '/tmp/chromium',
};

test('perf dry-run does not probe ports, create artifacts, or start processes', async () => {
  let probed = false;
  let created = false;
  const base = context({
    dryRun: true,
    probe: { isFree: async () => { probed = true; return true; } },
    fs: { read: async () => '', exists: async () => false, files: async () => [], mkdir: async () => { created = true; } },
    supervisor: { spawn: () => { throw new Error('must not spawn'); }, createGroup: () => { throw new Error('must not create group'); } },
  });

  assert.equal(await runE2ePerf(base, stackArgs), 0);
  assert.equal(probed, false);
  assert.equal(created, false);
});

test('perf rejects --mode together with --origin', async () => {
  await assert.rejects(
    runE2ePerf(context(), { ...stackArgs, origin: 'http://127.0.0.1:9999' }),
    /必须且只能提供/,
  );
});

test('perf rejects missing --mode and --origin', async () => {
  const { mode: _mode, ...withoutMode } = stackArgs;
  await assert.rejects(runE2ePerf(context(), withoutMode), /必须且只能提供/);
});

test('perf rejects non-http origin', async () => {
  await assert.rejects(
    runE2ePerf(context(), {
      origin: 'ftp://example.com',
      'playwright-module': 'missing-playwright-module',
      'chromium-path': '/tmp/chromium',
    }),
    /--origin 必须是 http/,
  );
});

test('perf stops the runtime group when Playwright loading fails', async () => {
  const group = new FakeGroup();
  const process = new FakeProcess();
  const reports = new Map<string, string>();
  const base = context({
    supervisor: {
      spawn: () => process,
      createGroup: () => group,
    },
    fs: {
      read: async () => '',
      exists: async () => false,
      files: async () => [],
      mkdir: async () => undefined,
      write: async (path, content) => { reports.set(path, content); },
    },
  });

  await assert.rejects(runE2ePerf(base, stackArgs), /Cannot find module|Cannot find package|missing-playwright-module/);
  assert.equal(group.stopCount, 1);
  assert.equal(process.killed, true);
  assert.equal(reports.size, 1);
  const report = [...reports.values()][0] ?? '';
  assert.match(report, /"kind": "perf"/);
  assert.match(report, /"status": "failed"/);
  assert.match(report, /missing-playwright-module/);
});

test('perf remote origin failure writes a failed report without starting processes', async () => {
  const reports = new Map<string, string>();
  let spawned = false;
  const base = context({
    supervisor: {
      spawn: () => { spawned = true; throw new Error('must not spawn'); },
      createGroup: () => { throw new Error('must not create group'); },
    },
    fs: {
      read: async () => '',
      exists: async () => false,
      files: async () => [],
      mkdir: async () => undefined,
      write: async (path, content) => { reports.set(path, content); },
    },
  });

  await assert.rejects(
    runE2ePerf(base, {
      origin: 'http://127.0.0.1:9999',
      'playwright-module': 'missing-playwright-module',
      'chromium-path': '/tmp/chromium',
    }),
    /Cannot find module|Cannot find package|missing-playwright-module/,
  );
  assert.equal(spawned, false);
  assert.match([...reports.values()][0] ?? '', /"status": "failed"/);
});

test('summarizeNumbers reports median, min and max', () => {
  assert.deepEqual(summarizeNumbers([]), undefined);
  assert.deepEqual(summarizeNumbers([5]), { median: 5, min: 5, max: 5 });
  assert.deepEqual(summarizeNumbers([10, 4, 7]), { median: 7, min: 4, max: 10 });
  assert.deepEqual(summarizeNumbers([10, 4]), { median: 7, min: 4, max: 10 });
});

test('classifyResource separates site-routes, data APIs, js and css', () => {
  assert.equal(classifyResource('http://localhost:8080/api/public/site-routes?sceneCode=public.site_routes'), 'siteRoutes');
  assert.equal(classifyResource('http://localhost:8080/api/public/mobile/category-shelf?sceneCode=x'), 'dataApi');
  assert.equal(classifyResource('http://localhost:8080/assets/mobile-home-DUaw2Dyz.js'), 'js');
  assert.equal(classifyResource('http://localhost:8080/assets/components-BDKKZ8Wm.css'), 'css');
  assert.equal(classifyResource('http://localhost:8080/m/articles/index.html'), 'other');
});

test('aggregateNavigationMetrics counts transfers, cache hits and api durations', () => {
  const raw: RawNavigationMetrics = {
    html: { responseEndMs: 12, transferBytes: 800 },
    firstContentfulPaintMs: 120,
    largestContentfulPaintMs: 400,
    resources: [
      { name: '/assets/app.js', durationMs: 100, transferBytes: 111_424, decodedBytes: 111_424 },
      { name: '/assets/app.css', durationMs: 30, transferBytes: 21_364, decodedBytes: 21_364 },
      { name: '/assets/app.js', durationMs: 0, transferBytes: 0, decodedBytes: 111_424 },
      { name: '/api/public/site-routes?sceneCode=x', durationMs: 25, transferBytes: 900, decodedBytes: 900 },
      { name: '/api/public/t-shelf?sceneCode=x', durationMs: 60, transferBytes: 5_000, decodedBytes: 5_000 },
    ],
  };

  const aggregated = aggregateNavigationMetrics(raw);
  assert.equal(aggregated.htmlMs, 12);
  assert.deepEqual(aggregated.js, { requests: 2, bytes: 111_424 });
  assert.deepEqual(aggregated.css, { requests: 1, bytes: 21_364 });
  assert.equal(aggregated.siteRoutesMs, 25);
  assert.deepEqual(aggregated.dataApi, { requests: 1, bytes: 5_000, totalMs: 60 });
  assert.equal(aggregated.requestCount, 5);
  assert.equal(aggregated.transferredBytes, 800 + 111_424 + 21_364 + 0 + 900 + 5_000);
  assert.equal(aggregated.cacheHits, 1);
});

test('buildJourneySummary keeps per-run samples and median stats', () => {
  const metrics = aggregateNavigationMetrics({
    html: { responseEndMs: 10, transferBytes: 100 },
    firstContentfulPaintMs: 50,
    largestContentfulPaintMs: undefined,
    resources: [{ name: '/assets/app.js', durationMs: 1, transferBytes: 100, decodedBytes: 100 }],
  });
  const runs: readonly JourneyRun[] = [
    { journey: 'nav-switch', run: 1, shellMs: 300, contentMs: 900, firstContentfulPaintMs: 100, largestContentfulPaintMs: undefined, metrics },
    { journey: 'nav-switch', run: 2, shellMs: 100, contentMs: 500, firstContentfulPaintMs: 60, largestContentfulPaintMs: undefined, metrics },
    { journey: 'nav-switch', run: 3, shellMs: 200, contentMs: 700, firstContentfulPaintMs: 80, largestContentfulPaintMs: undefined, metrics },
  ];

  const summary = buildJourneySummary(runs);
  assert.equal(summary.journey, 'nav-switch');
  assert.equal(summary.runs.length, 3);
  assert.deepEqual(summary.summary.shellMs, { median: 200, min: 100, max: 300 });
  assert.deepEqual(summary.summary.contentMs, { median: 700, min: 500, max: 900 });
  assert.deepEqual(summary.summary.firstContentfulPaintMs, { median: 80, min: 60, max: 100 });
  assert.equal(summary.summary.largestContentfulPaintMs, undefined);
});
