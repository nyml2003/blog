import test from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpKernel } from '@fluvient-loom/web-http';
import type { HttpKernel } from '@fluvient-loom/web-http';
import { CaptureOutputPort } from '@fluvient-cli/cli-kit/output.ts';
import { runInstallerCommand } from '../src/installer/main.ts';
import type { InstallerDeps, InstallerOutcome } from '../src/installer/main.ts';
import { downloadAsset } from '../src/installer/release.ts';
import { createDefaultProbes, runPreflight } from '../src/installer/preflight.ts';
import type { PreflightProbes } from '../src/installer/preflight.ts';
import { createReporter } from '../src/installer/reporter.ts';
import type { Reporter } from '../src/installer/reporter.ts';
import { createHash } from 'node:crypto';

const encoder = new TextEncoder();

function releasesResponse(): Response {
  return new Response(
    JSON.stringify([
      {
        tag_name: 'build-v0.2.0',
        assets: [
          { name: 'blog-release-x86_64-unknown-linux-musl-2.tar.gz', browser_download_url: 'https://example.test/x86b' },
          { name: 'blog-release-aarch64-unknown-linux-musl-2.tar.gz', browser_download_url: 'https://example.test/armb' },
          { name: 'SHA256SUMS', browser_download_url: 'https://example.test/sums' },
        ],
      },
      {
        tag_name: `script-v0.1.5`,
        assets: [
          { name: 'blog-deploy.mjs', browser_download_url: 'https://example.test/mjs' },
          { name: 'SHA256SUMS', browser_download_url: 'https://example.test/sums' },
        ],
      },
    ]),
    { status: 200 },
  );
}

function okProbes(): PreflightProbes {
  return {
    resolveDns: async () => ['203.0.113.10'],
    connectTcp: async () => undefined,
    tlsHandshake: async () => undefined,
    probeAsset: async (url) => ({
      url,
      status: 200,
      contentLength: 1024,
      contentType: 'application/octet-stream',
      finalUrl: url,
      method: 'HEAD' as const,
    }),
  };
}

function failingProbes(reason: 'dns' | 'tls'): PreflightProbes {
  const base = okProbes();
  if (reason === 'dns') return { ...base, resolveDns: async () => Promise.reject(new Error('DNS 解析失败:ENOTFOUND')) };
  return { ...base, tlsHandshake: async () => Promise.reject(new Error('TLS 握手失败:SELF_SIGNED_CERT_IN_CHAIN')) };
}

interface Harness {
  readonly deps: InstallerDeps;
  readonly output: CaptureOutputPort;
  readonly events: { readonly event: string; readonly data: Readonly<Record<string, unknown>> }[];
}

function harness(fetcher: (input: string, init?: RequestInit) => Promise<Response>, probes?: PreflightProbes): Harness {
  const output = new CaptureOutputPort();
  const kernel: HttpKernel = createHttpKernel({ fetcher: fetcher as never });
  const reporter: Reporter = createReporter({ output, json: false, tty: false });
  const events: Harness['events'] = [];
  const originalLog = output.log.bind(output);
  output.log = (event) => {
    events.push({ event: String(event.message.key), data: { ...(event.data ?? {}), ...event.message.params } });
    originalLog(event);
  };
  return { deps: { kernel, reporter, ...(probes === undefined ? {} : { probes }) }, output, events };
}

async function writeConfig(directory: string): Promise<string> {
  const configFile = join(directory, 'blog.json');
  await writeFile(
    configFile,
    JSON.stringify({ serverName: 'blog.example.com', contentRepo: 'owner/my-content', contentToken: 'github_pat_test', buildTag: 'latest' }),
  );
  await writeFile(join(directory, 'blog.example.com.pem'), 'cert');
  await writeFile(join(directory, 'blog.example.com.key'), 'key');
  return configFile;
}

test('deploy --dry-run resolves the release, runs preflight, and stops before downloading', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blog-deploy-dry-'));
  try {
    const configFile = await writeConfig(directory);
    const box = harness(async () => releasesResponse(), okProbes());
    const outcome: InstallerOutcome = await runInstallerCommand(
      'deploy',
      { configFile, dryRun: true, force: false },
      box.deps,
    );
    assert.equal(outcome.exitCode, 0);
    const names = box.events.map((event) => event.event);
    assert.ok(names.includes('network_preflight_started'));
    assert.ok(names.includes('preflight_check'));
    assert.ok(names.includes('release_resolved'));
    assert.ok(names.includes('network_preflight_completed'));
    assert.ok(names.includes('dry_run_report'));
    assert.ok(!names.includes('download_started'));
    const resolved = box.events.find((event) => event.event === 'release_resolved');
    assert.equal(resolved?.data.tag, 'build-v0.2.0');
    assert.equal(resolved?.data.size, 1024);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a failed preflight blocks the deploy with a retryable outcome and suggestion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blog-deploy-dns-'));
  try {
    const configFile = await writeConfig(directory);
    const box = harness(async () => releasesResponse(), failingProbes('dns'));
    const outcome = await runInstallerCommand('deploy', { configFile, dryRun: true, force: false }, box.deps);
    assert.equal(outcome.exitCode, 20);
    assert.equal(outcome.code, 'PREFLIGHT_FAILED');
    assert.equal(outcome.retryable, true);
    const names = box.events.map((event) => event.event);
    assert.ok(!names.includes('release_resolved'));
    assert.ok(!names.includes('download_started'));
    assert.ok(box.events.some((event) => event.event === 'install_step' && String(event.data.message).includes('DNS')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a TLS preflight failure surfaces a certificate suggestion', async () => {
  const box = harness(async () => releasesResponse(), failingProbes('tls'));
  const report = await runPreflight(
    {
      apiHost: 'api.github.com',
      apiPort: 443,
      resolveApi: async () => 'resolved',
      assetsOf: () => [],
    },
    box.deps.probes!,
    box.deps.reporter,
  );
  assert.equal(report.ok, false);
  assert.match(report.suggestion ?? '', /CA 证书|TLS/);
});

test('self-update --dry-run reports the planned update without side effects', async () => {
  const box = harness(async (input) => {
    if (input.includes('/releases?')) {
      return new Response(
        JSON.stringify([
          {
            tag_name: 'script-v9.9.9',
            assets: [
              { name: 'blog-deploy.mjs', browser_download_url: 'https://example.test/mjs' },
              { name: 'SHA256SUMS', browser_download_url: 'https://example.test/sums' },
            ],
          },
        ]),
        { status: 200 },
      );
    }
    return new Response('', { status: 200 });
  }, okProbes());
  const outcome = await runInstallerCommand('self-update', { dryRun: true, force: false }, box.deps);
  assert.equal(outcome.exitCode, 0);
  const names = box.events.map((event) => event.event);
  assert.ok(names.includes('release_resolved'));
  assert.ok(names.includes('dry_run_report'));
  assert.ok(!names.includes('download_started'));
});

test('self-update --dry-run exits cleanly when already latest', async () => {
  const box = harness(async () => releasesResponse(), okProbes());
  const outcome = await runInstallerCommand('self-update', { dryRun: true, force: false }, box.deps);
  assert.equal(outcome.exitCode, 0);
  assert.ok(box.events.some((event) => event.event === 'install_step' && String(event.data.message).includes('已是最新')));
});

test('downloadAsset streams chunks to disk, reports progress, and retries transient failures', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blog-deploy-dl-'));
  try {
    const payload = encoder.encode('0123456789'.repeat(100));
    let attempts = 0;
    const fetcher = async (): Promise<Response> => {
      attempts += 1;
      if (attempts === 1) {
        throw new TypeError('fetch failed', { cause: Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }) });
      }
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(payload.subarray(0, 500));
            controller.enqueue(payload.subarray(500));
            controller.close();
          },
        }),
        { status: 200, headers: { 'content-length': String(payload.byteLength) } },
      );
    };
    const box = harness(fetcher as never);
    const dest = join(directory, 'asset.bin');
    const result = await downloadAsset(
      { name: 'asset.bin', url: 'https://example.test/asset.bin' },
      dest,
      { kernel: box.deps.kernel, reporter: box.deps.reporter, retry: { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 2 } },
    );
    assert.equal(attempts, 2);
    assert.equal(result.bytes, payload.byteLength);
    assert.deepEqual(await readFile(dest), Buffer.from(payload));
    const names = box.events.map((event) => event.event);
    assert.ok(names.includes('download_started'));
    assert.ok(names.includes('download_retry'));
    assert.ok(names.includes('download_completed'));
    const retry = box.events.find((event) => event.event === 'download_retry');
    assert.match(String(retry?.data.message), /ECONNRESET|reset/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('the json reporter emits NDJSON events and never writes the tty bar', async () => {
  const output = new CaptureOutputPort();
  const stdoutWrites: string[] = [];
  const reporter = createReporter({
    output,
    json: true,
    tty: true,
    stdout: { write: (text) => void stdoutWrites.push(text) },
    now: () => clock,
  });
  let clock = 0;
  reporter.downloadStarted('asset.bin', 100);
  clock = 1_100;
  reporter.downloadProgress(50, 100);
  clock = 2_200;
  reporter.downloadProgress(100, 100);
  reporter.downloadCompleted(100, 1_000);
  assert.equal(stdoutWrites.length, 0);
  const keys = output.events.filter((event) => event.kind === 'log').map((event) => (event as { message: { key: string } }).message.key);
  assert.deepEqual(keys, ['download_started', 'download_progress', 'download_progress', 'download_completed']);
});

test('the tty reporter renders a bar with percent and speed', async () => {
  const output = new CaptureOutputPort();
  const stdoutWrites: string[] = [];
  let clock = 0;
  const reporter = createReporter({
    output,
    json: false,
    tty: true,
    stdout: { write: (text) => void stdoutWrites.push(text) },
    now: () => clock,
  });
  reporter.downloadStarted('asset.bin', 200);
  clock = 1_500;
  reporter.downloadProgress(100, 200);
  clock = 3_000;
  reporter.downloadProgress(200, 200);
  reporter.stage('download_completed', '下载完成');
  const bar = stdoutWrites.join('');
  assert.match(bar, /50%/);
  assert.match(bar, /100%/);
  assert.match(bar, /总量未知|\/200 B/);
});

test('offline --package skips preflight and installs from the local tarball', async () => {
  process.env.BLOG_DEPLOY_ALLOW_NON_ROOT = '1';
  const directory = await mkdtemp(join(tmpdir(), 'blog-deploy-off-'));
  try {
    const configFile = await writeConfig(directory);
    const staging = join(directory, 'pkg');
    await mkdir(staging, { recursive: true });
    await writeFile(join(staging, 'web', 'dist', 'index.html'), 'dist', { flag: 'wx' }).catch(async () => {
      await mkdir(join(staging, 'web', 'dist'), { recursive: true });
      await writeFile(join(staging, 'web', 'dist', 'index.html'), 'dist');
    });
    await mkdir(join(staging, 'bin'), { recursive: true });
    await mkdir(join(staging, 'systemd'), { recursive: true });
    await mkdir(join(staging, 'nginx'), { recursive: true });
    await writeFile(join(staging, 'bin', 'blog-product'), 'bin');
    await writeFile(join(staging, 'systemd', 'unit.service'), 'unit');
    await writeFile(join(staging, 'nginx', 'site.conf'), 'site');
    await writeFile(join(staging, 'web', 'dist', 'index.html'), 'dist');
    const sums = `${createHash('sha256').update('bin').digest('hex')}  bin/blog-product
${createHash('sha256').update('unit').digest('hex')}  systemd/unit.service
${createHash('sha256').update('site').digest('hex')}  nginx/site.conf
${createHash('sha256').update('dist').digest('hex')}  web/dist/index.html`;
    await writeFile(join(staging, 'SHA256SUMS'), sums);
    const tarball = join(directory, 'pkg.tar.gz');
    assert.equal(spawnSync('tar', ['-czf', tarball, '-C', staging, '.']).status, 0);

    let probesConsulted = false;
    const box = harness(async () => releasesResponse(), {
      ...okProbes(),
      probeAsset: async (url) => {
        probesConsulted = true;
        return okProbes().probeAsset(url);
      },
    });
    const outcome = await runInstallerCommand('deploy', { configFile, dryRun: false, force: false, packageFile: tarball }, box.deps);
    assert.equal(probesConsulted, false);
    const names = box.events.map((event) => event.event);
    assert.ok(!names.includes('network_preflight_started'));
    assert.ok(!names.includes('download_started'));
    assert.ok(names.includes('checksum_completed'));
    assert.ok(names.includes('install_started'));
    assert.notEqual(outcome.exitCode, 10);
    assert.notEqual(outcome.code, 'CHECKSUM_MISMATCH');
  } finally {
    delete process.env.BLOG_DEPLOY_ALLOW_NON_ROOT;
    await rm(directory, { recursive: true, force: true });
  }
});

test('offline --package with a tampered payload stops at CHECKSUM_MISMATCH', async () => {
  process.env.BLOG_DEPLOY_ALLOW_NON_ROOT = '1';
  const directory = await mkdtemp(join(tmpdir(), 'blog-deploy-tamper-'));
  try {
    const configFile = await writeConfig(directory);
    const staging = join(directory, 'pkg');
    await mkdir(join(staging, 'bin'), { recursive: true });
    await writeFile(join(staging, 'bin', 'blog-product'), 'tampered');
    await writeFile(join(staging, 'SHA256SUMS'), `${createHash('sha256').update('expected').digest('hex')}  bin/blog-product\n`);
    const tarball = join(directory, 'pkg.tar.gz');
    assert.equal(spawnSync('tar', ['-czf', tarball, '-C', staging, '.']).status, 0);
    const box = harness(async () => releasesResponse(), okProbes());
    const outcome = await runInstallerCommand('deploy', { configFile, dryRun: false, force: false, packageFile: tarball }, box.deps);
    assert.equal(outcome.exitCode, 20);
    assert.equal(outcome.code, 'CHECKSUM_MISMATCH');
  } finally {
    delete process.env.BLOG_DEPLOY_ALLOW_NON_ROOT;
    await rm(directory, { recursive: true, force: true });
  }
});

test('offline --package with a missing file fails fast with usage', async () => {
  process.env.BLOG_DEPLOY_ALLOW_NON_ROOT = '1';
  const directory = await mkdtemp(join(tmpdir(), 'blog-deploy-miss-'));
  try {
    const configFile = await writeConfig(directory);
    const box = harness(async () => releasesResponse(), okProbes());
    const outcome = await runInstallerCommand(
      'deploy',
      { configFile, dryRun: false, force: false, packageFile: join(directory, 'nope.tar.gz') },
      box.deps,
    );
    assert.equal(outcome.exitCode, 10);
    assert.equal(outcome.code, 'CONFIG_INVALID');
  } finally {
    delete process.env.BLOG_DEPLOY_ALLOW_NON_ROOT;
    await rm(directory, { recursive: true, force: true });
  }
});

test('default probes prefer HEAD and fall back to a ranged GET when length is missing', async () => {
  const headOnly = createHttpKernel({
    fetcher: async (input, init) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 200, headers: { 'content-length': '2048' } });
      }
      throw new Error('unexpected request');
    },
  });
  const probes = createDefaultProbes(headOnly);
  const head = await probes.probeAsset('https://example.test/a');
  assert.equal(head.method, 'HEAD');
  assert.equal(head.contentLength, 2048);

  const ranged = createHttpKernel({
    fetcher: async (input, init) => {
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      return new Response('x', { status: 206, headers: { 'content-range': 'bytes 0-0/4096' } });
    },
  });
  const fallback = await createDefaultProbes(ranged).probeAsset('https://example.test/a');
  assert.equal(fallback.method, 'RANGE');
  assert.equal(fallback.contentLength, 4096);
});

test('--json mode keeps stdout parseable line by line', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blog-deploy-json-'));
  const captured: string[] = [];
  const originalLog = console.log;
  console.log = (line: string) => {
    captured.push(line);
  };
  try {
    const configFile = join(directory, 'blog.json');
    const { main } = await import('../src/main.ts');
    const exitCode = await main(['init', '--json', '--config', configFile]);
    assert.equal(exitCode, 0);
    assert.ok(captured.length > 0);
    for (const line of captured) {
      const parsed = JSON.parse(line) as { event?: string };
      assert.equal(typeof parsed.event, 'string');
    }
  } finally {
    console.log = originalLog;
    await rm(directory, { recursive: true, force: true });
  }
});

test('checksum verification integrates with the downloaded file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blog-deploy-sum-'));
  try {
    const payload = 'installer-payload';
    await writeFile(join(directory, 'blog-deploy.mjs'), payload);
    const digest = createHash('sha256').update(payload).digest('hex');
    await writeFile(join(directory, 'SHA256SUMS'), `${digest}  blog-deploy.mjs\n`);
    const { verifyAssetChecksum } = await import('../src/installer/release.ts');
    await verifyAssetChecksum(join(directory, 'blog-deploy.mjs'), join(directory, 'SHA256SUMS'), 'blog-deploy.mjs');
    await assert.rejects(
      () => verifyAssetChecksum(join(directory, 'blog-deploy.mjs'), join(directory, 'SHA256SUMS'), 'other-asset.mjs'),
      /缺少/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
