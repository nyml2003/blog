import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:net';
import { request } from 'node:http';
import { cp, mkdtemp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

/**
 * 真实进程集成测试：ops CLI ↔ Rust binary ↔ 真实端口 / 真实信号 / 真实前端产物。
 *
 * 这些用例覆盖 Spec 中"只有真实子进程才能断言"的场景（SPEC-OPS-RUNTIME-001 的
 * MODE-001/002/003/004、PORT-002/003/005、FAIL-005/006、SPIKE-001，以及 PLAN 验收 6/7），
 * 是 `runtime.test.ts`（端口/进程 double）之外唯一能证明编排层与真实服务对得上的证据。
 *
 * 默认跳过，不拖慢 `node --test` 与 `ops quality check`；按层用环境变量打开：
 *   OPS_RUNTIME_E2E=1     进程级（backend / dev / 端口 / 信号 / N+1 指标）
 *   OPS_RUNTIME_E2E=full  额外执行会触发构建的用例（runtime integration、delivery build）
 * 运行：OPS_RUNTIME_E2E=full node --experimental-strip-types --test ops/src/application/runtime.stack.test.ts
 */

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const cli = join(root, 'ops', 'src', 'interface', 'cli.ts');
const testDbDir = join(root, 'target', 'test-dbs');
const binary = (name: string): string => join(root, 'target', 'debug', name);

const tier = process.env.OPS_RUNTIME_E2E ?? '';
const PROCESS_TIER = tier === '1' || tier === 'full';
const BUILD_TIER = tier === 'full';
const GATE = '需要真实 Rust binary 与真实端口/信号；默认跳过。设 OPS_RUNTIME_E2E=1（进程级）或 =full（额外运行前端与 release 构建）';
const gate = (enabled: boolean) => ({ skip: enabled ? false : GATE });

/** 冷门高位段 + 按 PID 散列：避开本机被长期占用的 8080 与内核临时端口段。 */
const PORT_BASE = 23000 + (process.pid % 200) * 20;
type ServiceName = 'data' | 'product' | 'mock';

interface ServiceAddress { service: string; host: string; port: number; url: string }
interface ServicesPayload { ok: boolean; command: string; services: ServiceAddress[]; entry: string | null }
interface OpsErrorPayload {
  ok: false;
  command: string;
  exitCode: number;
  error: { code: string; message: string; details: ReadonlyArray<Record<string, unknown>> };
}
interface HttpResponse { status: number; type: string; body: string }
interface DataDiagnostics {
  data: { semantics: string; query_count_total: number; database: { path: string; applied_migrations: number[]; seeded: boolean } | null };
}
interface ProductDiagnostics { data: { dataCallsTotal: number; webDirMounted: boolean; dataClient: { authority: string } } }

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

/** `size` 个连续空闲端口；找不到就失败，绝不退回某个开发端口。 */
async function freeWindow(size: number): Promise<number> {
  for (let base = PORT_BASE; base + size < 65535; base += size) {
    let free = true;
    for (let offset = 0; offset < size && free; offset += 1) free = await portFree(base + offset);
    if (free) return base;
  }
  throw new Error(`no ${size}-port free window starting at ${PORT_BASE}`);
}

function hold(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function http(
  port: number,
  path: string,
  method = 'GET',
  init: { headers?: Record<string, string>; body?: string } = {},
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const call = request(
      { host: '127.0.0.1', port, path, method, headers: init.headers },
      (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, type: String(response.headers['content-type'] ?? ''), body }));
      },
    );
    call.on('error', reject);
    call.setTimeout(20_000, () => call.destroy(new Error(`timeout ${method} ${path}`)));
    call.end(init.body);
  });
}

async function jsonOf<T>(port: number, path: string): Promise<T> {
  const response = await http(port, path);
  assert.equal(response.status, 200, `${path} → ${response.status} ${response.body}`);
  return JSON.parse(response.body) as T;
}

/** 真实进程表断言：该 `--listen` 端口上已没有任何本模式启动的服务进程。 */
async function pidsOnPort(name: ServiceName, port: number): Promise<number[]> {
  const pattern = `${binary(name)} --listen 127\\.0\\.0\\.1:${port}`;
  const { stdout } = await execFileAsync('pgrep', ['-f', pattern]).catch(() => ({ stdout: '' }));
  return stdout.split('\n').filter((line) => line.trim().length > 0).map(Number);
}

/** 整棵进程树（ops → pnpm → vite 等），用于失败路径的兜底清理。 */
async function descendants(pid: number): Promise<number[]> {
  const found: number[] = [];
  const frontier = [pid];
  while (frontier.length > 0) {
    const parent = frontier.shift()!;
    const { stdout } = await execFileAsync('pgrep', ['-P', String(parent)]).catch(() => ({ stdout: '' }));
    for (const line of stdout.split('\n').filter((entry) => entry.trim().length > 0)) {
      const child = Number(line);
      if (Number.isFinite(child)) { found.push(child); frontier.push(child); }
    }
  }
  return found;
}

function kill(pids: number[]): void {
  for (const pid of pids) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

async function testDbFiles(): Promise<string[]> {
  return readdir(testDbDir).catch(() => []);
}

/** `--json` 下 stdout 是按行写入的 JSON 对象；启动成功后运行期失败会先后写出两个对象。 */
function lastJson(run: OpsRun): OpsErrorPayload {
  const lines = run.out().trim().split('\n').filter((line) => line.trim().length > 0);
  return JSON.parse(lines.at(-1) ?? '') as OpsErrorPayload;
}

function jsonLines(run: OpsRun): unknown[] {
  return run.out().trim().split('\n').filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

/** 收尾契约（FAIL-003/005/006、PORT-003）：无遗留子进程、端口已释放、无遗留临时库。 */
async function assertNoProcessLeftover(ports: number[], names: readonly ServiceName[]): Promise<void> {
  const survivors: string[] = [];
  for (const port of ports) {
    assert.ok(await portFree(port), `port ${port} must be released`);
    for (const name of names) {
      const pids = await pidsOnPort(name, port);
      if (pids.length > 0) survivors.push(`${name}@${port}=${pids.join(',')}`);
    }
  }
  assert.deepEqual(survivors, [], 'no service process may survive the run');
}

/** 正常退出路径的临时库契约：一次运行都不许留下 SQLite 文件（MODE-003）。 */
async function assertNoTempDb(dbFilesBefore: string[]): Promise<void> {
  const leftover = (await testDbFiles()).filter((file) => !dbFilesBefore.includes(file));
  assert.deepEqual(leftover, [], 'no temp sqlite file may survive a clean exit');
}

/** LOG-001：真实运行里每一行都必须带唯一的稳定来源前缀。 */
function assertSingleSourcePrefix(run: OpsRun): void {
  const unprefixed = run.errLines().filter((line) => !/^\[(web|product|data|mock|ops)\] /.test(line));
  assert.deepEqual(unprefixed, [], 'every forwarded and ops line must carry exactly one source prefix');
}

/** 一次 `ops runtime <mode>` / `ops delivery build` 的真实子进程。 */
class OpsRun {
  private readonly child: ChildProcess;
  private readonly stdout: string[] = [];
  private readonly stderr: string[] = [];

  private constructor(args: readonly string[], env: Readonly<Record<string, string>>) {
    this.child = spawn(process.execPath, ['--experimental-strip-types', cli, ...args], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child.stdout?.on('data', (chunk) => this.stdout.push(String(chunk)));
    this.child.stderr?.on('data', (chunk) => this.stderr.push(String(chunk)));
  }

  static start(args: readonly string[], env: Readonly<Record<string, string>> = {}): OpsRun {
    return new OpsRun(args, env);
  }

  out(): string { return this.stdout.join(''); }
  err(): string { return this.stderr.join(''); }
  errLines(): string[] { return this.err().split('\n').map((line) => line.replace(/\r$/, '')).filter((line) => line.length > 0); }
  pid(): number { return this.child.pid ?? -1; }

  /** `--json` 下 stdout 恰好一个 JSON 对象；读到可解析的服务清单即视为栈已就绪（CMD-009）。 */
  async ready(timeoutMs = 60_000): Promise<ServicesPayload> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const text = this.out().trim();
      if (text.length > 0) {
        try { return JSON.parse(text) as ServicesPayload; } catch { /* still streaming */ }
      }
      if (this.child.exitCode !== null || this.child.signalCode !== null) {
        throw new Error(`ops exited before reporting its services (exit ${this.child.exitCode ?? this.child.signalCode}):\n${this.err()}`);
      }
      if (Date.now() > deadline) throw new Error(`ops never reported its services:\n${this.err()}`);
      await new Promise((resolve) => { setTimeout(resolve, 50); });
    }
  }

  signal(name: NodeJS.Signals): void { this.child.kill(name); }

  /** 等待退出；超时就杀掉整棵树并让用例失败，绝不把孤儿进程留给下一个用例。 */
  async exit(timeoutMs = 30_000): Promise<number> {
    const code = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      this.child.once('close', (exitCode) => { clearTimeout(timer); resolve(exitCode); });
    });
    if (code === null) {
      kill([this.child.pid ?? -1]);
      assert.fail(`ops did not exit within ${timeoutMs}ms\n${this.err()}`);
    }
    return code;
  }

  /** 失败路径的兜底清理：ops 已死时它的服务进程会变孤儿，必须一并收割。 */
  async dispose(): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const tree = await descendants(this.child.pid ?? -1);
    kill([this.child.pid ?? -1]);
    kill(tree);
    await new Promise((resolve) => { this.child.once('close', resolve); setTimeout(resolve, 3_000); });
  }
}

function serviceOf(payload: ServicesPayload, name: string): ServiceAddress {
  const address = payload.services.find((entry) => entry.service === name);
  assert.ok(address, `service ${name} missing from ${JSON.stringify(payload.services)}`);
  return address;
}

function dataRequestIds(run: OpsRun): string[] {
  return run.errLines()
    .filter((line) => line.startsWith('[data] http op=') && line.includes('request_id='))
    .map((line) => line.match(/request_id=(\S+)/)?.[1] ?? '');
}

test('product declares no sqlite dependency while data owns it (MODE-002, structural)', async () => {
  const dependenciesOf = async (crate: string): Promise<string> => {
    const manifest = await readFile(join(root, 'crates', crate, 'Cargo.toml'), 'utf8');
    return manifest.split('[dev-dependencies]')[0]!.split('[dependencies]')[1] ?? '';
  };
  assert.doesNotMatch(await dependenciesOf('product'), /sqlx|sqlite/i, 'product must not depend on sqlx/sqlite');
  assert.match(await dependenciesOf('data'), /\bsqlx\b/, 'data owns the sqlite dependency');
});

test('MODE-002: backend --data mock serves from memory and never creates a sqlite file', gate(PROCESS_TIER), async (t) => {
  const base = await freeWindow(2);
  const productPort = base;
  const dataPort = base + 1;
  const before = await testDbFiles();
  const run = OpsRun.start(['runtime', 'backend', '--data', 'mock', '--product-port', String(productPort), '--data-port', String(dataPort), '--json']);
  t.after(() => run.dispose());

  const payload = await run.ready();
  assert.equal(payload.ok, true);
  assert.equal(payload.command, 'runtime backend');
  assert.deepEqual(payload.services.map((entry) => entry.service), ['data', 'product'], 'backend starts data + product only');
  assert.equal(serviceOf(payload, 'data').port, dataPort);
  assert.equal(serviceOf(payload, 'product').port, productPort);
  assert.equal(payload.entry, null, 'backend has no page entry');

  const diagnostics = await jsonOf<DataDiagnostics>(dataPort, '/data/v1/diagnostics');
  assert.equal(diagnostics.data.semantics, 'mock');
  assert.equal(diagnostics.data.database, null, 'mock semantics exposes no database object');
  assert.ok(run.errLines().some((line) => line.includes('sqlite disabled')), run.err());

  const list = await jsonOf<{ code: string; data: { total: number } }>(productPort, '/api/public/articles?sceneCode=public.article_list&pageSize=3');
  assert.equal(list.code, 'OK');
  assert.equal(list.data.total, 9, 'mock semantics serves the same seed as the test database');

  run.signal('SIGINT');
  assert.equal(await run.exit(), 130, 'SIGINT ends the mode with 130 (FAIL-006)');
  assertSingleSourcePrefix(run);
  await assertNoProcessLeftover([dataPort, productPort], ['data', 'product']);
  await assertNoTempDb(before);
});

test('PLAN 验收 6: product→data calls and data→sqlite queries stay fixed while item_count grows', gate(PROCESS_TIER), async (t) => {
  const base = await freeWindow(2);
  const productPort = base;
  const dataPort = base + 1;
  const before = await testDbFiles();
  const run = OpsRun.start(['runtime', 'backend', '--data', 'test', '--product-port', String(productPort), '--data-port', String(dataPort), '--json']);
  t.after(() => run.dispose());
  const payload = await run.ready();
  const product = serviceOf(payload, 'product').port;

  // MODE-003（运行中）：临时库按 ops 运行 PID 命名，迁移与 seed 在 Data 启动时自动完成。
  const dbPath = join(testDbDir, `${run.pid()}.db`);
  assert.ok(existsSync(dbPath), `the temp db must be created as ${dbPath}`);
  const dataDiagnostics = await jsonOf<DataDiagnostics>(dataPort, '/data/v1/diagnostics');
  assert.equal(dataDiagnostics.data.semantics, 'test');
  assert.ok(
    (dataDiagnostics.data.database?.applied_migrations.length ?? 0) >= 1,
    'migrations run automatically on start',
  );
  assert.equal(dataDiagnostics.data.database?.seeded, true);

  /** 记录格式（PLAN 验收 6）：request correlation × item_count × call count × query count。 */
  const records: string[] = ['| request | request_id (product→data) | item_count | product→data calls | data→sqlite queries |', '| --- | --- | --- | --- | --- |'];
  for (const pageSize of [1, 3, 9]) {
    const queriesBefore = (await jsonOf<DataDiagnostics>(dataPort, '/data/v1/diagnostics')).data.query_count_total;
    const callsBefore = (await jsonOf<ProductDiagnostics>(product, '/product/diagnostics')).data.dataCallsTotal;
    const requestsBefore = dataRequestIds(run);

    const response = await jsonOf<{ code: string; data: { items: unknown[]; total: number; pageSize: number } }>(
      product,
      `/api/public/articles?sceneCode=public.article_list&page=1&pageSize=${pageSize}`,
    );
    const itemCount = response.data.items.length;

    const queryDelta = (await jsonOf<DataDiagnostics>(dataPort, '/data/v1/diagnostics')).data.query_count_total - queriesBefore;
    const callDelta = (await jsonOf<ProductDiagnostics>(product, '/product/diagnostics')).data.dataCallsTotal - callsBefore;

    assert.equal(response.code, 'OK');
    assert.equal(itemCount, Math.min(pageSize, response.data.total), `pageSize=${pageSize} must return that many items`);
    assert.equal(callDelta, 1, `pageSize=${pageSize} → product must call data exactly once`);
    assert.equal(queryDelta, 3, `pageSize=${pageSize} → data must run count + page + batched terms only`);

    // request correlation：本次请求新增的那条 Data 日志，把 item_count 和查询数绑定到同一次调用。
    const correlation = dataRequestIds(run).filter((id) => !requestsBefore.includes(id));
    assert.equal(correlation.length, 1, `exactly one Data call must be correlated to pageSize=${pageSize}`);
    const dataLine = run.errLines().find((line) => line.includes(`request_id=${correlation[0]}`)) ?? '';
    assert.match(dataLine, /op=article_list /);
    assert.match(dataLine, new RegExp(`items=${itemCount} queries=${queryDelta}`), dataLine);

    const productLine = run.errLines().find((line) => line.startsWith('[product] GET /api/public/articles') && line.includes(`items=${itemCount} `));
    assert.match(
      productLine ?? '',
      new RegExp(`scene=public\\.article_list items=${itemCount} total=${response.data.total} data_calls=1 data_queries=${queryDelta} `),
      `product must log the fixed call budget for pageSize=${pageSize}`,
    );
    records.push(`| GET /api/public/articles?pageSize=${pageSize} | ${correlation[0]} | ${itemCount} | ${callDelta} | ${queryDelta} |`);
  }
  const table = records.join('\n');
  for (const [pageSize, itemCount] of [[1, 1], [3, 3], [9, 9]] as const) {
    assert.match(
      table,
      new RegExp(`\\| GET /api/public/articles\\?pageSize=${pageSize} \\| product-list-\\d+ \\| ${itemCount} \\| 1 \\| 3 \\|`),
      `the metric record is incomplete:\n${table}`,
    );
  }

  run.signal('SIGINT');
  assert.equal(await run.exit(), 130);
  await assertNoProcessLeftover([dataPort, productPort], ['data', 'product']);
  await assertNoTempDb(before);
});

test('MODE-003: every run gets a fresh temp sqlite with the same seed and deletes it on exit', gate(PROCESS_TIER), async (t) => {
  const before = await testDbFiles();
  const runs: Array<{ pid: number; titles: string }> = [];
  for (let round = 0; round < 2; round += 1) {
    const base = await freeWindow(2);
    const run = OpsRun.start(['runtime', 'backend', '--data', 'test', '--product-port', String(base), '--data-port', String(base + 1), '--json']);
    t.after(() => run.dispose());
    const payload = await run.ready();

    const dbPath = join(testDbDir, `${run.pid()}.db`);
    assert.ok(existsSync(dbPath), `round ${round} must create its own temp db`);
    assert.ok(!runs.some((entry) => entry.pid === run.pid()), 'a second run must not reuse the first run file (MODE-003)');

    const page = await jsonOf<{ data: { items: Array<{ id: number; title: string }> } }>(
      serviceOf(payload, 'product').port,
      '/api/public/articles?sceneCode=public.article_list&pageSize=100',
    );
    assert.equal(page.data.items.length, 9, 'stable seed: 9 published articles on every run');
    runs.push({ pid: run.pid(), titles: JSON.stringify(page.data.items.map((item) => [item.id, item.title])) });

    run.signal('SIGINT');
    assert.equal(await run.exit(), 130);
    assert.equal(existsSync(dbPath), false, 'a clean exit deletes the temp db');
    await assertNoProcessLeftover([base, base + 1], ['data', 'product']);
  }
  assert.equal(runs[0]!.titles, runs[1]!.titles, 'the seed is identical across runs');
  assert.notEqual(runs[0]!.pid, runs[1]!.pid, 'the two runs used different pids, hence different files');
  await assertNoTempDb(before);
});

test('PORT-002/PORT-005: a busy candidate increments once and printed, injected and bound addresses agree', gate(PROCESS_TIER), async (t) => {
  const base = await freeWindow(3);
  const dataPort = base;
  const dataActual = base + 1;
  const productPort = base + 2;
  const blocker = await hold(dataPort);
  const before = await testDbFiles();
  const run = OpsRun.start(['runtime', 'backend', '--data', 'test', '--data-port', String(dataPort), '--product-port', String(productPort), '--json']);
  t.after(async () => { blocker.close(); await run.dispose(); });

  try {
    const payload = await run.ready();
    assert.equal(serviceOf(payload, 'data').port, dataActual, 'data increments by exactly one');
    assert.equal(serviceOf(payload, 'product').port, productPort, 'an unrelated candidate is not disturbed');
    assert.ok(await portFree(base + 3), 'the window stays bounded (+0 … +9), it does not keep scanning');

    const diagnostics = await jsonOf<ProductDiagnostics>(productPort, '/product/diagnostics');
    assert.equal(diagnostics.data.dataClient.authority, `127.0.0.1:${dataActual}`, 'product is injected with the incremented data address (PORT-005)');

    assert.equal(
      run.errLines().find((line) => line.includes(`候选端口 ${dataPort}`)),
      `[ops] data: 候选端口 ${dataPort}, 实际绑定 ${dataActual}（递增尝试: ${dataPort}, ${dataActual}）`,
      run.err(),
    );
    assert.ok(
      run.errLines().some((line) => line.startsWith(`[data] listening addr=127.0.0.1:${dataActual}`)),
      'the binary really bound the incremented port',
    );
    assert.equal((await http(dataActual, '/healthz')).status, 200);

    run.signal('SIGINT');
    assert.equal(await run.exit(), 130);
  } finally {
    blocker.close();
  }
  await assertNoProcessLeftover([dataActual, productPort], ['data', 'product']);
  await assertNoTempDb(before);
});

test('PORT-002/PORT-005 + ENV-001 + MODE-001: dev injects the incremented mock address into Vite', gate(PROCESS_TIER), async (t) => {
  const base = await freeWindow(3);
  const webPort = base;
  const mockPort = base + 1;
  const mockActual = base + 2;
  const blocker = await hold(mockPort);
  const before = await testDbFiles();
  const run = OpsRun.start(['runtime', 'dev', '--web-port', String(webPort), '--mock-port', String(mockPort), '--json'], {
    BLOG_API_ORIGIN: 'http://127.0.0.1:9999',
  });
  t.after(async () => { blocker.close(); await run.dispose(); });

  try {
    const payload = await run.ready();
    assert.deepEqual(payload.services.map((entry) => entry.service), ['mock', 'web'], 'dev starts mock + vite, never product or data');
    assert.equal(
      run.errLines().filter((line) => line.startsWith('[product] ') || line.startsWith('[data] ')).length,
      0,
      'no real backend may log anything in dev mode',
    );
    assert.equal(serviceOf(payload, 'mock').port, mockActual, 'the mock moves off the squatted candidate');
    assert.equal(payload.entry, `http://127.0.0.1:${webPort}`);
    assert.equal(
      run.errLines().find((line) => line.includes(`候选端口 ${mockPort}`)),
      `[ops] mock: 候选端口 ${mockPort}, 实际绑定 ${mockActual}（递增尝试: ${mockPort}, ${mockActual}）`,
      run.err(),
    );

    // 页面数据请求经 Vite 代理到达递增后的 mock：BLOG_API_ORIGIN 注入的真实证据（PORT-005）。
    const page = await http(webPort, '/api/public/articles?sceneCode=public.article_list&pageSize=2');
    assert.equal(page.status, 200);
    const envelope = JSON.parse(page.body) as { code: string; data: { total: number; items: Array<{ id: number }> } };
    assert.equal(envelope.code, 'OK');
    assert.equal(envelope.data.total, 9);

    // MODE-001：显式 session 在 dev 链路上跨请求保持状态（创建 → 发布 → 公开可见）。
    const session = { 'content-type': 'application/json', 'x-blog-mock-session': 'testing-e2e' };
    const admin = '/api/admin/articles';
    const created = await http(webPort, admin, 'POST', {
      headers: session,
      body: JSON.stringify({
        sceneCode: 'admin.article_create',
        title: 'dev 链路验收',
        summary: 'dev 链路验收摘要',
        articleTypeId: 2,
        termIds: [3],
        contentHtml: '<p>dev</p>',
      }),
    });
    assert.equal(created.status, 200, created.body);
    const draft = JSON.parse(created.body) as { data: { id: number; status: string } };
    assert.equal(draft.data.status, 'draft');
    const published = await http(webPort, admin, 'POST', {
      headers: session,
      body: JSON.stringify({ sceneCode: 'admin.article_publish', id: draft.data.id }),
    });
    assert.equal(published.status, 200, published.body);
    assert.equal((JSON.parse(published.body) as { data: { status: string } }).data.status, 'published');

    const withSession = JSON.parse(
      (await http(webPort, '/api/public/articles?sceneCode=public.article_list&pageSize=100', 'GET', { headers: session })).body,
    ) as { data: { total: number; items: Array<{ id: number }> } };
    assert.equal(withSession.data.total, 10, 'the session sees its own published article');
    const anonymous = JSON.parse(
      (await http(webPort, '/api/public/articles?sceneCode=public.article_list&pageSize=100')).body,
    ) as { data: { total: number } };
    assert.equal(anonymous.data.total, 9, 'another caller without the session header does not see it');

    assert.ok(!run.err().includes('9999'), 'the caller-provided origin is overridden, never leaked (ENV-001)');

    run.signal('SIGINT');
    assert.equal(await run.exit(), 130);
  } finally {
    blocker.close();
  }
  await assertNoProcessLeftover([webPort, mockActual], ['mock']);
  await assertNoTempDb(before);
});

test('PORT-003: a full candidate window ends in 20/PORT_EXHAUSTED and stops the running service', gate(PROCESS_TIER), async (t) => {
  const base = await freeWindow(11);
  const dataPort = base;
  const squatted = Array.from({ length: 10 }, (_, index) => base + 1 + index);
  const blockers = await Promise.all(squatted.map((port) => hold(port)));
  const before = await testDbFiles();
  const run = OpsRun.start(['runtime', 'backend', '--data', 'test', '--data-port', String(dataPort), '--product-port', String(squatted[0]), '--json']);
  t.after(async () => { for (const blocker of blockers) blocker.close(); await run.dispose(); });

  try {
    const code = await run.exit(30_000);
    assert.equal(code, 20, 'port exhaustion is an execution failure, not a crash');
    const body = JSON.parse(run.out().trim()) as OpsErrorPayload;
    assert.equal(body.ok, false);
    assert.equal(body.command, 'runtime backend');
    assert.equal(body.exitCode, 20);
    assert.equal(body.error.code, 'PORT_EXHAUSTED');
    assert.deepEqual(
      body.error.details.map((detail) => detail.port),
      squatted,
      'the diagnostics list all ten attempted ports',
    );
    assert.match(run.err(), /端口耗尽: product/);
    assert.equal(run.out().trim().split('\n').length, 1, '--json stdout stays a single object even on failure (CMD-008)');
    assert.ok(await portFree(dataPort), 'the already started data service is stopped and cleaned up');
  } finally {
    for (const blocker of blockers) blocker.close();
  }
  await assertNoProcessLeftover([dataPort], ['data']);
  await assertNoTempDb(before);
});

test('FAIL-005: a service killed while running stops the mode with 20/CHILD_EXITED', gate(PROCESS_TIER), async (t) => {
  const base = await freeWindow(2);
  const productPort = base;
  const dataPort = base + 1;
  const before = await testDbFiles();
  const run = OpsRun.start(['runtime', 'backend', '--data', 'test', '--product-port', String(productPort), '--data-port', String(dataPort), '--json']);
  t.after(() => run.dispose());
  const payload = await run.ready();
  const product = serviceOf(payload, 'product').port;

  const victims = await pidsOnPort('data', dataPort);
  assert.equal(victims.length, 1, 'exactly one data process is running');
  process.kill(victims[0]!, 'SIGKILL');

  assert.equal(await run.exit(30_000), 20);
  // 启动成功后运行期失败：stdout 先有服务清单、后有错误对象（见交付记录的 Spec 疑问）。
  const emitted = jsonLines(run);
  assert.equal((emitted[0] as ServicesPayload).ok, true, 'the startup address list was already reported');
  const body = lastJson(run);
  assert.equal(body.error.code, 'CHILD_EXITED');
  assert.equal(body.exitCode, 20);
  assert.equal(body.ok, false);
  const detail = body.error.details[0] ?? {};
  assert.equal(detail.service, 'data');
  assert.equal(detail.signal, 'SIGKILL');
  assert.ok(Array.isArray(detail.logs) && detail.logs.length > 0, 'the report carries the service recent logs');
  assert.match(run.err(), /运行中的服务退出: data/);
  assert.deepEqual(await pidsOnPort('product', product), [], 'the surviving service is stopped too');
  await assertNoProcessLeftover([dataPort, product], ['data', 'product']);
  // 异常退出按 OPEN-5/MODE-003 保留临时库供诊断 —— 这正是它必须被留下的一次。
  const retained = (await testDbFiles()).filter((file) => !before.includes(file));
  assert.ok(retained.some((file) => file.startsWith(`${run.pid()}.db`)), `the temp db must be kept for diagnosis, got ${retained}`);
  for (const file of retained) await rm(join(testDbDir, file));
  assert.deepEqual(await testDbFiles(), before, 'the test cleans up the retained diagnostic file');
});

test('FAIL-003 + CMD-008: a missing service binary is a real 20/SERVICE_START_FAILED on stdout', gate(PROCESS_TIER), async (t) => {
  // 隔离根：把 ops CLI 复制到一个没有 target/ 的目录树，CLI 会以那里为仓库根解析 binary。
  const home = await mkdtemp(join(tmpdir(), 'ops-e2e-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(join(home, 'ops'), { recursive: true });
  await cp(join(root, 'ops', 'src'), join(home, 'ops', 'src'), { recursive: true });

  const child = spawn(process.execPath, ['--experimental-strip-types', join(home, 'ops', 'src', 'interface', 'cli.ts'), 'runtime', 'backend', '--json'], {
    cwd: home, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout?.on('data', (chunk) => { out += chunk; });
  child.stderr?.on('data', (chunk) => { err += chunk; });
  const code = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 30_000);
    child.once('close', (exitCode) => { clearTimeout(timer); resolve(exitCode); });
  });
  assert.equal(code, 20, err);
  const lines = out.trim().split('\n');
  assert.equal(lines.length, 1, `--json stdout must stay a single object:\n${out}`);
  const payload = JSON.parse(lines[0]!) as OpsErrorPayload;
  assert.equal(payload.ok, false);
  assert.equal(payload.command, 'runtime backend');
  assert.equal(payload.error.code, 'SERVICE_START_FAILED');
  assert.equal(payload.exitCode, 20);
  assert.match(payload.error.message, /服务未构建: data/);
  assert.match(err, /\[ops\] /);
});

test('MODE-003/FAIL-009: SIGTERM ends the mode with 143 and data drains in the contractual order', gate(PROCESS_TIER), async (t) => {
  const base = await freeWindow(2);
  const before = await testDbFiles();
  const run = OpsRun.start(['runtime', 'backend', '--data', 'test', '--product-port', String(base), '--data-port', String(base + 1), '--json']);
  t.after(() => run.dispose());
  const payload = await run.ready();
  const dbPath = join(testDbDir, `${run.pid()}.db`);
  assert.ok(existsSync(dbPath));

  await jsonOf<{ data: { total: number } }>(serviceOf(payload, 'product').port, '/api/public/articles?sceneCode=public.article_list&pageSize=1');
  run.signal('SIGTERM');
  assert.equal(await run.exit(), 143, 'SIGTERM must end the mode with 143');

  // 关停顺序（FAIL-009 / PLAN 验收 9）：signal received → 停止 accept → 排空 → 删临时库 → 完成。
  const dataLines = run.errLines().filter((line) => line.startsWith('[data] '));
  const indexOf = (needle: string): number => dataLines.findIndex((line) => line.includes(needle));
  const order = ['signal received', 'stop accept', 'temp db removed', 'shutdown complete'].map(indexOf);
  assert.deepEqual(order.filter((index) => index < 0), [], `missing shutdown phases:\n${run.err()}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, `shutdown phases out of order:\n${dataLines.join('\n')}`);
  assert.equal(existsSync(dbPath), false, 'SIGTERM is a clean exit, so the temp db is removed');
  await assertNoProcessLeftover([base, base + 1], ['data', 'product']);
  await assertNoTempDb(before);
});

test('MODE-001/PLAN 验收 1: dev --scenario empty switches the named scenario on the real chain', gate(PROCESS_TIER), async (t) => {
  const base = await freeWindow(2);
  const webPort = base;
  const mockPort = base + 1;
  const before = await testDbFiles();
  const run = OpsRun.start(['runtime', 'dev', '--scenario', 'empty', '--web-port', String(webPort), '--mock-port', String(mockPort), '--json']);
  t.after(() => run.dispose());

  const payload = await run.ready();
  assert.deepEqual(payload.services.map((entry) => entry.service), ['mock', 'web']);
  assert.ok(
    run.errLines().some((line) => line.startsWith(`[mock] starting scenario=empty listen=127.0.0.1:${mockPort}`)),
    run.err(),
  );
  const page = await http(webPort, '/api/public/articles?sceneCode=public.article_list');
  assert.equal(page.status, 200);
  const envelope = JSON.parse(page.body) as { code: string; data: { total: number; items: unknown[] } };
  assert.equal(envelope.code, 'OK');
  assert.equal(envelope.data.total, 0, 'the empty scenario must serve empty collections through the dev chain');
  const diagnostics = JSON.parse((await http(mockPort, '/mock/diagnostics')).body) as { data: { scenario: string } };
  assert.equal(diagnostics.data.scenario, 'empty');

  run.signal('SIGINT');
  assert.equal(await run.exit(), 130);
  await assertNoProcessLeftover([webPort, mockPort], ['mock']);
  await assertNoTempDb(before);
});

test('MODE-004 + SPIKE-001: integration mounts web/dist and serves pages, assets and /api same-origin', gate(BUILD_TIER), async (t) => {
  const base = await freeWindow(2);
  const productPort = base;
  const dataPort = base + 1;
  const before = await testDbFiles();
  const run = OpsRun.start(['runtime', 'integration', '--product-port', String(productPort), '--data-port', String(dataPort), '--json']);
  t.after(() => run.dispose());

  const payload = await run.ready(180_000);
  assert.equal(payload.command, 'runtime integration');
  assert.deepEqual(payload.services.map((entry) => entry.service), ['data', 'product'], 'integration is data + product, never vite');
  assert.equal(payload.entry, `http://127.0.0.1:${productPort}`);

  // FAIL-002：先构建前端，再启动服务栈；Data 就绪先于 Product 对外就绪。
  const buildIndex = run.err().indexOf('pnpm --filter blog-web run build');
  const dataListening = run.err().indexOf('[data] listening addr=');
  assert.ok(buildIndex >= 0, `the frontend build must be forwarded:\n${run.err()}`);
  assert.ok(dataListening > buildIndex, `data may only start after the build finished (${buildIndex} → ${dataListening})`);
  assert.ok(
    run.errLines().some((line) => line.startsWith('[product] data readiness ok')),
    'product must confirm the data readiness probe before serving',
  );
  assertSingleSourcePrefix(run);

  const diagnostics = await jsonOf<ProductDiagnostics>(productPort, '/product/diagnostics');
  assert.equal(diagnostics.data.webDirMounted, true, 'product mounts web/dist in integration mode');

  // 静态挂载路由契约 ①：精确映射（含无尾斜杠目录变体）→ 200 text/html。
  for (const path of ['/', '/m', '/m/', '/admin', '/admin/']) {
    const page = await http(productPort, path);
    assert.equal(page.status, 200, `path=${path}`);
    assert.match(page.type, /text\/html/, `path=${path}`);
  }
  // ②：不做 SPA 回退 —— 未知路径、深层刷新、未映射目录、缺失资源一律 404 text/plain。
  for (const path of ['/nope', '/admin/articles/edit', '/articles', '/assets/missing.js', '/assets/']) {
    const page = await http(productPort, path);
    assert.equal(page.status, 404, `path=${path}`);
    assert.match(page.type, /text\/plain/, `path=${path}`);
    assert.equal(page.body, '404 page not found\n', `path=${path}`);
  }
  assert.equal((await http(productPort, '/assets/../desktop/pages/public-home/index.html')).status, 404, 'traversal is refused');
  assert.equal((await http(productPort, '/', 'POST')).status, 405, 'non-GET static requests are refused');
  assert.equal((await http(productPort, '/api/unknown')).status, 404, 'unknown /api subpaths stay 404');
  assert.equal((await http(productPort, '/healthz')).body, 'ok\n', '/healthz wins over the static mount');

  // 真实构建产物里的资源可取回，且 /api 同源可用（MODE-004）。
  const home = await http(productPort, '/');
  const asset = home.body.match(/\/assets\/[\w.-]+\.(?:js|css)/)?.[0];
  assert.ok(asset, `the built index must reference a bundled asset:\n${home.body.slice(0, 300)}`);
  assert.equal((await http(productPort, asset)).status, 200, `asset ${asset}`);
  const api = await jsonOf<{ code: string; data: { total: number } }>(productPort, '/api/public/articles?sceneCode=public.article_list&pageSize=3');
  assert.equal(api.code, 'OK');
  assert.equal(api.data.total, 9, 'same-origin /api reaches Data(test)');

  run.signal('SIGINT');
  assert.equal(await run.exit(30_000), 130);
  await assertNoProcessLeftover([dataPort, productPort], ['data', 'product']);
  await assertNoTempDb(before);
});

test('PLAN 验收 7: delivery build produces web/dist and the rust binaries and never a go artifact', gate(BUILD_TIER), async () => {
  // 清掉旧产物，让这次 delivery build 真正产出交付物（cargo 只在缺产物时重新链接）。
  for (const name of ['product', 'data', 'mock']) await rm(join(root, 'target', 'release', name), { force: true });
  const run = OpsRun.start(['delivery', 'build', '--json']);
  assert.equal(await run.exit(600_000), 0, run.err());
  const payload = JSON.parse(run.out().trim()) as ServicesPayload;
  assert.equal(payload.ok, true);
  assert.equal(payload.command, 'delivery build');
  assert.deepEqual(payload.services, [], 'delivery build starts no service');
  assert.equal(payload.entry, null);
  const steps = run.errLines().filter((line) => line === '[web] $ pnpm --filter blog-web run build' || line === '[ops] $ cargo build --release');
  assert.deepEqual(
    steps,
    ['[web] $ pnpm --filter blog-web run build', '[ops] $ cargo build --release'],
    `exactly the frontend and the rust build must run, in that order:\n${run.err()}`,
  );
  assert.doesNotMatch(run.err(), /\bgo (build|vet|test)\b|\bgofmt\b/, 'no go command may appear in the build');

  const dist = join(root, 'web', 'dist');
  for (const path of ['desktop/pages/public-home/index.html', 'desktop/pages/admin-home/index.html', 'mobile/pages/home/index.html']) {
    assert.equal(existsSync(join(dist, path)), true, `web/dist/${path} must exist`);
  }
  for (const name of ['product', 'data', 'mock']) {
    const artifact = join(root, 'target', 'release', name);
    assert.equal(existsSync(artifact), true, `target/release/${name} must exist after the build`);
    assert.ok((await stat(artifact)).mode & 0o111, `target/release/${name} must be executable`);
  }
  assert.equal(existsSync(join(root, 'target', 'release', 'blog-server')), false, 'the retired go server is not a build target');
});
