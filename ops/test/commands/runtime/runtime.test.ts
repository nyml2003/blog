import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { runDeliveryBuild, runRuntimeMode, type RuntimePorts } from '../../../src/commands/runtime/runtime.ts';
import { planMode } from '../../../src/commands/runtime/runtime-plan.ts';
import { OpsError } from '../../../src/framework/errors.ts';
import { join } from 'node:path';
import type { FsPort, LogLine, ManagedProcess, ProcessExit, ProcessGroupPort, ProcessPort, SpawnRequest } from '../../../src/framework/ports.ts';

const workspace = { root: '/repo', web: '/repo/src/frontend', ops: '/repo/ops', opsSource: '/repo/ops/src', opsTests: '/repo/ops/test' };
const node = process.execPath;

interface FakeProcess extends ManagedProcess {
  spec: SpawnRequest;
  emitLine(stream: 'stdout' | 'stderr', text: string): void;
  finish(exit: ProcessExit): void;
}

class Harness {
  readonly spawns: SpawnRequest[] = [];
  readonly group: FakeGroup = new FakeGroup();
  readonly logLines: string[] = [];
  readonly json: unknown[] = [];
  readonly errors: string[] = [];
  readonly killed: string[] = [];
  readonly runs: Array<{ command: string; args: string[]; cwd: string; env?: Readonly<Record<string, string>> }> = [];
  freePorts = new Set<number>();
  binaries = new Set<string>(['/repo/target/debug/mock', '/repo/target/debug/data', '/repo/target/debug/product']);
  runCode = 0;
  environment: NodeJS.ProcessEnv | undefined;
  readyWhen: (role: string) => boolean = () => true;
  private signalListener: ((signal: NodeJS.Signals) => void) | undefined;
  readonly signalPort = {
    onSignal: (handler: (signal: NodeJS.Signals) => void) => {
      this.signalListener = handler;
      return () => { this.signalListener = undefined; };
    },
  };

  emit(signal: NodeJS.Signals): void { this.signalListener?.(signal); }
  root = workspace.root;
  fs: FsPort = { read: async () => '', exists: async () => false, files: async () => [], mkdir: async () => undefined };

  ports(): RuntimePorts {
    const harness = this;
    return {
      process: {
        async run(command, args, cwd, env) {
          harness.runs.push({ command, args, cwd, env });
          return { code: harness.runCode, stdout: '', stderr: harness.runCode === 0 ? '' : 'build error line' };
        },
      },
      supervisor: {
        spawn: (request) => harness.spawn(request),
        createGroup: () => harness.group,
      },
      probe: { isFree: async (port) => !harness.freePorts.has(port) },
      readiness: {
        wait: async (_port, gate = {}) => {
          const deadline = Date.now() + 250;
          for (;;) {
            const role = harness.spawns.at(-1)?.role;
            if (role !== undefined && harness.readyWhen(role)) return true;
            if (gate.isCancelled?.() || Date.now() > deadline) return false;
            await new Promise((resolve) => { setTimeout(resolve, 5); });
          }
        },
      },
      binaries: { resolve: async (role) => [...harness.binaries].find((path) => path.includes(`${role}`)) },
      log: {
        info: (message) => harness.logLines.push(`ops ${message}`),
        error: (message) => harness.errors.push(message),
        log: (role, message) => harness.logLines.push(`${role} ${message}`),
        json: (value) => harness.json.push(value),
      },
      fs: harness.fs,
      signals: harness.signalPort,
      root: harness.root,
      environment: harness.environment,
    };
  }

  spawn(request: SpawnRequest): FakeProcess {
    this.spawns.push(request);
    const listeners = new Set<(line: LogLine) => void>();
    let exitResolve: ((exit: ProcessExit) => void) | undefined;
    const exitPromise = new Promise<ProcessExit>((resolve) => { exitResolve = resolve; });
    const recent: string[] = [];
    const process: FakeProcess = {
      spec: request,
      role: request.role,
      pid: 4000 + this.spawns.length,
      exited: false,
      exit: () => exitPromise,
      kill: async () => { this.killed.push(request.role); process.finish({ code: null, signal: 'SIGTERM' }); },
      onLine: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      recentLogs: (limit = 10) => recent.slice(-limit),
      emitLine(stream, text) {
        recent.push(text);
        for (const listener of listeners) listener({ role: request.role, stream, text });
      },
      finish(exit) {
        if (process.exited) return;
        process.exited = true;
        exitResolve?.(exit);
      },
    };
    return process;
  }
}

class FakeGroup implements ProcessGroupPort {
  readonly members: ManagedProcess[] = [];
  stopping = false;

  add(process: ManagedProcess): ManagedProcess {
    this.members.push(process);
    return process;
  }

  async stopAll(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    this.stopping = true;
    for (const process of [...this.members]) {
      if (process.exited) continue;
      await (process as FakeProcess).kill(signal);
    }
  }

  firstExit(): Promise<{ process: ManagedProcess; exit: ProcessExit }> {
    return Promise.any(this.members.map(async (process) => ({ process, exit: await process.exit() })));
  }

  allExits(): Promise<{ process: ManagedProcess; exit: ProcessExit }[]> {
    return Promise.all(this.members.map(async (process) => ({ process, exit: await process.exit() })));
  }
}

function options(overrides: Record<string, unknown> = {}) {
  return { dryRun: false, json: false, graceMs: 50, readinessTimeoutMs: 100, ...overrides } as { dryRun: boolean; json: boolean; graceMs?: number; readinessTimeoutMs?: number };
}

test('dev starts mock before vite and injects the mock address vite must use', async () => {
  const harness = new Harness();
  harness.environment = {
    BLOG_TAXONOMY_MODEL_PROVIDER: 'claude-cli',
    BLOG_TAXONOMY_MODEL_COMMAND: '/private/model-command',
  };
  const pending = runRuntimeMode(planMode({ mode: 'dev', scenario: 'default', webPort: 5173, mockPort: 9090 }), harness.ports(), options());
  await tick();
  const specs = harness.spawns;
  assert.deepEqual(specs.map((process) => process.role), ['mock', 'web']);
  assert.equal(specs[0]!.command, '/repo/target/debug/mock');
  assert.deepEqual(specs[0]!.args, [
    '--listen',
    '127.0.0.1:9090',
    '--scenario',
    'default',
    '--admin-auth',
    'bypass',
  ]);
  if (!specs[1]) throw new Error('second spawn missing: ' + JSON.stringify(specs));
  assert.equal(specs[1]!.command, 'pnpm');
  assert.match(specs[1]!.args.join(' '), /-C src\/frontend run dev/);
  assert.equal(specs[1]!.env?.BLOG_API_ORIGIN, 'http://127.0.0.1:9090');
  for (const request of specs) {
    assert.equal(request.env?.BLOG_TAXONOMY_MODEL_PROVIDER, undefined);
    assert.equal(request.env?.BLOG_TAXONOMY_MODEL_COMMAND, undefined);
  }
  const mock = harness.group.members[0] as FakeProcess;
  const web = harness.group.members[1] as FakeProcess;
  assert.equal(harness.group.stopping, false);

  assert.match(harness.logLines.join('\n'), /web 就绪: http:\/\/127\.0\.0\.1:5173/);
  assert.match(harness.logLines.join('\n'), /访问入口: http:\/\/127\.0\.0\.1:5173/);
  harness.emit('SIGINT');
  assert.equal(await pending, 130, 'a running mode only ends through a signal');
  assert.deepEqual(harness.killed, ['mock', 'web']);
});

test('backend allocates data first and points product at the actual data address', async () => {
  const harness = new Harness();
  harness.freePorts = new Set([8081]);
  const pending = runRuntimeMode(planMode({ mode: 'backend', dataMode: 'test', productPort: 18080, dataPort: 8081 }), harness.ports(), options());
  await tick();
  assert.deepEqual(harness.spawns.map((process) => process.role), ['data', 'product']);
  const data = harness.spawns[0]!;
  assert.deepEqual(data.args, ['--listen', '127.0.0.1:8082', '--data-semantics', 'test'], 'the busy candidate port is skipped by +1');
  assert.equal(data.env?.BLOG_DATABASE_PATH, join('/repo', 'target', 'test-dbs', `${process.pid}.db`));
  assert.deepEqual(harness.spawns[1]!.args, ['--listen', '127.0.0.1:18080', '--content-source', 'fixture']);
  assert.equal(harness.spawns[1]!.env?.BLOG_DATA_ADDR, 'http://127.0.0.1:8082');
  assert.equal(harness.spawns[1]!.env?.BLOG_WEB_DIR, undefined, 'backend never mounts a frontend');
  assert.match(data.env?.BLOG_DATABASE_PATH ?? '', /target\/test-dbs\/\d+\.db/);

  harness.emit('SIGINT');
  assert.equal(await pending, 130);
});

test('prod data mode requires an explicit database path and passes it to the data process', async () => {
  const isUsage = (error: unknown): boolean => error instanceof OpsError && error.code === 'USAGE' && error.exitCode === 10;
  assert.throws(() => planMode({ mode: 'backend', dataMode: 'prod', productPort: 18080, dataPort: 18081 }), isUsage);
  assert.throws(() => planMode({ mode: 'backend', dataMode: 'test', databasePath: '/tmp/x.db', productPort: 18080, dataPort: 18081 }), isUsage);

  const harness = new Harness();
  const pending = runRuntimeMode(
    planMode({ mode: 'backend', dataMode: 'prod', databasePath: '/tmp/prod-verify.db', contentSource: 'fixture', productPort: 18080, dataPort: 18081 }),
    harness.ports(),
    options(),
  );
  await tick();
  const data = harness.spawns[0]!;
  assert.deepEqual(data.args, ['--listen', '127.0.0.1:18081', '--data-semantics', 'prod', '--data-database-path', '/tmp/prod-verify.db']);
  assert.equal(data.env?.BLOG_DATABASE_PATH, undefined, 'prod never uses the test-path env injection');
  assert.deepEqual(harness.spawns.map((process) => process.role), ['data', 'product']);
  harness.emit('SIGINT');
  assert.equal(await pending, 130);
});

test('content source selection isolates credentials and injects model configuration only into Product', async () => {
  const fixture = new Harness();
  fixture.environment = {
    BLOG_CONTENT_REPO: 'owner/private',
    BLOG_CONTENT_TOKEN: 'ambient-secret',
    BLOG_TAXONOMY_MODEL_PROVIDER: 'claude-cli',
    BLOG_TAXONOMY_MODEL_COMMAND: '/private/model-command',
  };
  const fixtureRun = runRuntimeMode(
    planMode({ mode: 'backend', dataMode: 'mock', productPort: 18080, dataPort: 18081, contentSource: 'fixture' }),
    fixture.ports(),
    options(),
  );
  await tick();
  const fixtureProduct = fixture.spawns.find((process) => process.role === 'product')!;
  assert.equal(fixtureProduct.env?.BLOG_CONTENT_REPO, undefined);
  assert.equal(fixtureProduct.env?.BLOG_CONTENT_TOKEN, undefined);
  assert.equal(fixtureProduct.env?.BLOG_TAXONOMY_MODEL_PROVIDER, 'claude-cli');
  assert.equal(fixtureProduct.env?.BLOG_TAXONOMY_MODEL_COMMAND, '/private/model-command');
  assert.doesNotMatch(fixtureProduct.args.join('\0'), /claude-cli|model-command/);
  const fixtureData = fixture.spawns.find((process) => process.role === 'data')!;
  assert.equal(fixtureData.env?.BLOG_TAXONOMY_MODEL_PROVIDER, undefined);
  assert.equal(fixtureData.env?.BLOG_TAXONOMY_MODEL_COMMAND, undefined);
  assert.match(fixtureProduct.args.join(' '), /--content-source fixture/);
  fixture.emit('SIGINT');
  assert.equal(await fixtureRun, 130);

  const github = new Harness();
  github.environment = {
    BLOG_CONTENT_REPO: 'owner/private',
    BLOG_CONTENT_TOKEN: 'configured-secret',
    BLOG_TAXONOMY_MODEL_PROVIDER: 'claude-cli',
    BLOG_TAXONOMY_MODEL_COMMAND: '/private/model-command',
  };
  const githubRun = runRuntimeMode(
    planMode({ mode: 'backend', dataMode: 'mock', productPort: 18080, dataPort: 18081, contentSource: 'github' }),
    github.ports(),
    options(),
  );
  await tick();
  const githubProduct = github.spawns.find((process) => process.role === 'product')!;
  assert.equal(githubProduct.env?.BLOG_CONTENT_REPO, 'owner/private');
  assert.equal(githubProduct.env?.BLOG_CONTENT_TOKEN, 'configured-secret');
  assert.equal(githubProduct.env?.BLOG_TAXONOMY_MODEL_PROVIDER, 'claude-cli');
  assert.equal(githubProduct.env?.BLOG_TAXONOMY_MODEL_COMMAND, '/private/model-command');
  assert.doesNotMatch(githubProduct.args.join('\0'), /claude-cli|model-command/);
  assert.match(githubProduct.args.join(' '), /--content-source github/);
  github.emit('SIGINT');
  assert.equal(await githubRun, 130);

  const unavailable = new Harness();
  unavailable.environment = {
    BLOG_TAXONOMY_MODEL_PROVIDER: '   ',
    BLOG_TAXONOMY_MODEL_COMMAND: '',
  };
  const unavailableRun = runRuntimeMode(
    planMode({ mode: 'backend', dataMode: 'mock', productPort: 18080, dataPort: 18081, contentSource: 'github' }),
    unavailable.ports(),
    options(),
  );
  await tick();
  const unavailableProduct = unavailable.spawns.find((process) => process.role === 'product')!;
  assert.equal(unavailableProduct.env?.BLOG_CONTENT_REPO, undefined);
  assert.equal(unavailableProduct.env?.BLOG_CONTENT_TOKEN, undefined);
  assert.equal(unavailableProduct.env?.BLOG_TAXONOMY_MODEL_PROVIDER, undefined);
  assert.equal(unavailableProduct.env?.BLOG_TAXONOMY_MODEL_COMMAND, undefined);
  assert.match(unavailableProduct.args.join(' '), /--content-source github/);
  unavailable.emit('SIGINT');
  assert.equal(await unavailableRun, 130);
});

test('secure admin credentials are injected only into Product', async () => {
  const harness = new Harness();
  const stateDirectory = '/state/blog/admin-auth';
  const credentialsPath = `${stateDirectory}/credentials.env`;
  harness.environment = { XDG_STATE_HOME: '/state' };
  harness.fs = {
    read: async () => '',
    exists: async (path) => path === credentialsPath,
    files: async () => [],
    mkdir: async () => undefined,
    inspect: async () => ({ kind: 'directory', mode: 0o700, uid: 1000 }),
    readSecure: async () => ({
      content: [
        'BLOG_ADMIN_PASSWORD_HASH=$argon2id$v=19$m=65536,t=3,p=1$c2FsdA$hash',
        'BLOG_ADMIN_TOTP_SECRET=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        `BLOG_ADMIN_RUNTIME_DIR=${stateDirectory}`,
        '',
      ].join('\n'),
      metadata: { kind: 'file', mode: 0o600, uid: 1000 },
    }),
    effectiveUid: () => 1000,
  };
  const pending = runRuntimeMode(
    planMode({
      mode: 'backend',
      dataMode: 'mock',
      productPort: 18080,
      dataPort: 18081,
      contentSource: 'fixture',
    }),
    harness.ports(),
    options(),
  );
  await tick();
  const data = harness.spawns.find((process) => process.role === 'data')!;
  const product = harness.spawns.find((process) => process.role === 'product')!;
  assert.equal(data.env?.BLOG_ADMIN_PASSWORD_HASH, undefined);
  assert.equal(data.env?.BLOG_ADMIN_TOTP_SECRET, undefined);
  assert.equal(data.env?.BLOG_ADMIN_RUNTIME_DIR, undefined);
  assert.equal(
    product.env?.BLOG_ADMIN_PASSWORD_HASH,
    '$argon2id$v=19$m=65536,t=3,p=1$c2FsdA$hash',
  );
  assert.equal(product.env?.BLOG_ADMIN_TOTP_SECRET, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  assert.equal(product.env?.BLOG_ADMIN_RUNTIME_DIR, stateDirectory);
  harness.emit('SIGINT');
  assert.equal(await pending, 130);
});

test('insecure admin credential permissions stop before Product starts', async () => {
  const harness = new Harness();
  const stateDirectory = '/state/blog/admin-auth';
  const credentialsPath = `${stateDirectory}/credentials.env`;
  harness.environment = { XDG_STATE_HOME: '/state' };
  harness.fs = {
    read: async () => '',
    exists: async (path) => path === credentialsPath,
    files: async () => [],
    mkdir: async () => undefined,
    inspect: async () => ({ kind: 'directory', mode: 0o700, uid: 1000 }),
    readSecure: async () => ({
      content: 'must-not-appear-in-diagnostics',
      metadata: { kind: 'file', mode: 0o644, uid: 1000 },
    }),
    effectiveUid: () => 1000,
  };
  const code = await runRuntimeMode(
    planMode({
      mode: 'backend',
      dataMode: 'mock',
      productPort: 18080,
      dataPort: 18081,
      contentSource: 'fixture',
    }),
    harness.ports(),
    options({ json: true }),
  );
  assert.equal(code, 20);
  assert.deepEqual(harness.spawns.map((process) => process.role), ['data']);
  assert.deepEqual(harness.killed, ['data']);
  assert.doesNotMatch(
    [harness.errors.join('\n'), JSON.stringify(harness.json)].join('\n'),
    /must-not-appear-in-diagnostics/,
  );
  const payload = harness.json.at(-1) as { error: { code: string } };
  assert.equal(payload.error.code, 'SERVICE_START_FAILED');
});

test('integration builds the frontend first and mounts web/dist into product', async () => {
  const harness = new Harness();
  harness.environment = {
    BLOG_TAXONOMY_MODEL_PROVIDER: 'claude-cli',
    BLOG_TAXONOMY_MODEL_COMMAND: '/private/integration-model-command',
  };
  const pending = runRuntimeMode(planMode({ mode: 'integration', watch: false, productPort: 8080, dataPort: 8081 }), harness.ports(), options({ json: true }));
  await tick();
  assert.deepEqual(harness.runs.map((run) => run.args.join(' ')), ['-C src/frontend run build']);
  assert.equal(harness.runs[0]!.env, undefined);
  assert.deepEqual(harness.spawns.map((process) => process.role), ['data', 'product']);
  assert.equal(harness.spawns[1]!.env?.BLOG_WEB_DIR, '/repo/src/frontend/dist');
  assert.equal(harness.spawns[0]!.env?.BLOG_TAXONOMY_MODEL_PROVIDER, undefined);
  assert.equal(harness.spawns[0]!.env?.BLOG_TAXONOMY_MODEL_COMMAND, undefined);
  assert.equal(harness.spawns[1]!.env?.BLOG_TAXONOMY_MODEL_PROVIDER, 'claude-cli');
  assert.equal(
    harness.spawns[1]!.env?.BLOG_TAXONOMY_MODEL_COMMAND,
    '/private/integration-model-command',
  );
  assert.deepEqual(harness.spawns[1]!.args, ['--listen', '127.0.0.1:8080', '--content-source', 'fixture', '--web-dir', '/repo/src/frontend/dist']);
  const payload = harness.json[0] as { ok: boolean; command: string; services: unknown[]; entry: string | null };
  assert.equal(payload.ok, true);
  assert.equal(payload.command, 'runtime integration');
  assert.deepEqual(payload.services.map((service) => (service as { service: string }).service), ['data', 'product']);
  assert.equal(payload.entry, 'http://127.0.0.1:8080');
  harness.emit('SIGINT');
  assert.equal(await pending, 130);
});

test('a failed frontend build never starts the stack and reports BUILD_FAILED', async () => {
  const harness = new Harness();
  harness.runCode = 1;
  const code = await runRuntimeMode(planMode({ mode: 'integration', watch: false, productPort: 8080, dataPort: 8081 }), harness.ports(), options({ json: true }));
  assert.equal(code, 20);
  assert.equal(harness.spawns.length, 0);
  assert.match(harness.errors.join('\n'), /构建失败/);
  const payload = harness.json[0] as { ok: boolean; exitCode: number; error: { code: string; message: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.exitCode, 20);
  assert.equal(payload.error.code, 'BUILD_FAILED');
  assert.ok(Array.isArray(payload.error.details));
});

test('a missing service binary is a SERVICE_START_FAILED without spawning anything else', async () => {
  const harness = new Harness();
  harness.binaries = new Set();
  const code = await runRuntimeMode(planMode({ mode: 'dev', scenario: 'default', webPort: 5173, mockPort: 9090 }), harness.ports(), options({ json: true }));
  assert.equal(code, 20);
  assert.equal(harness.spawns.length, 0);
  assert.match(harness.errors.join('\n'), /mock/);
  const payload = harness.json[0] as { error: { code: string; details: { service: string }[] } };
  assert.equal(payload.error.code, 'SERVICE_START_FAILED');
  assert.equal(payload.error.details[0]?.service, 'mock');
});

test('port exhaustion stops the already started service and lists the attempted ports', async () => {
  const harness = new Harness();
  harness.freePorts = new Set([8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089]);
  const code = await runRuntimeMode(planMode({ mode: 'backend', dataMode: 'mock', productPort: 8080, dataPort: 8081 }), harness.ports(), options({ json: true }));
  assert.equal(code, 20);
  assert.deepEqual(harness.spawns.map((process) => process.role), ['data']);
  assert.deepEqual(harness.killed, ['data'], 'the surviving service is stopped and cleaned up');
  const payload = harness.json[0] as { error: { code: string; details: { service: string; port: number }[] } };
  assert.equal(payload.error.code, 'PORT_EXHAUSTED');
  assert.equal(payload.error.details.length, 10);
  assert.equal(payload.error.details[0]?.service, 'product');
  assert.deepEqual(payload.error.details.map((detail) => detail.port), [8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089]);
  assert.match(harness.errors.join('\n'), /端口耗尽/);
});

test('a service that dies during startup stops the rest and reports its name and logs', async () => {
  const harness = new Harness();
  harness.readyWhen = (role) => role === 'data';
  const pending = runRuntimeMode(planMode({ mode: 'backend', dataMode: 'mock', productPort: 8080, dataPort: 8081 }), harness.ports(), options({ json: true }));
  await tick();
  const data = harness.group.members[0] as FakeProcess;
  const product = harness.group.members[1] as FakeProcess;
  assert.equal(data.exited, false, 'data is ready and running');
  product.emitLine('stderr', 'panic: cannot bind product port');
  product.finish({ code: 101, signal: null });
  const code = await pending;
  assert.equal(code, 20);
  assert.deepEqual(harness.killed, ['data'], 'the healthy service is stopped and cleaned up');
  assert.match(harness.errors.join('\n'), /服务启动失败: product \(exit 101\)/);
  assert.match(harness.logLines.join('\n'), /\| panic: cannot bind product port/);
  const payload = harness.json[0] as { error: { code: string; details: { service: string; exitCode: number; logs: string[] }[] } };
  assert.equal(payload.error.code, 'SERVICE_START_FAILED');
  assert.equal(payload.error.details[0]?.service, 'product');
  assert.equal(payload.error.details[0]?.exitCode, 101);
  assert.deepEqual(payload.error.details[0]?.logs, ['panic: cannot bind product port']);
});

test('a service that never becomes ready fails without being reported as reachable', async () => {
  const harness = new Harness();
  harness.readyWhen = () => false;
  const code = await runRuntimeMode(planMode({ mode: 'dev', scenario: 'default', webPort: 5173, mockPort: 9090 }), harness.ports(), options({ json: true }));
  assert.equal(code, 20);
  assert.deepEqual(harness.killed, ['mock']);
  assert.match(harness.errors.join('\n'), /服务启动失败: mock 未在期限内监听 127\.0\.0\.1:9090/);
  const payload = harness.json[0] as { error: { code: string; message: string } };
  assert.equal(payload.error.code, 'SERVICE_START_FAILED');
});

test('a child that leaves after a healthy start stops the mode with CHILD_EXITED', async () => {
  const harness = new Harness();
  const pending = runRuntimeMode(planMode({ mode: 'dev', scenario: 'default', webPort: 5173, mockPort: 9090 }), harness.ports(), options({ json: true }));
  await tick();
  (harness.group.members[1] as FakeProcess).finish({ code: 7, signal: null });
  const code = await pending;
  assert.equal(code, 20);
  assert.deepEqual(harness.killed, ['mock']);
  assert.match(harness.errors.join('\n'), /运行中的服务退出: web \(exit 7\)/);
  const payload = harness.json.at(-1) as { ok: boolean; error: { code: string; details: { service: string }[] } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'CHILD_EXITED');
  assert.equal(payload.error.details[0]?.service, 'web');
});

test('a service that exits 0 on its own is still CHILD_EXITED and stops the rest', async () => {
  const harness = new Harness();
  const pending = runRuntimeMode(planMode({ mode: 'backend', dataMode: 'mock', productPort: 8080, dataPort: 8081 }), harness.ports(), options({ json: true }));
  await tick();
  assert.deepEqual(harness.spawns.map((process) => process.role), ['data', 'product']);
  (harness.group.members[0] as FakeProcess).finish({ code: 0, signal: null });
  const code = await pending;
  assert.equal(code, 20, 'a running mode has no successful exit of its own');
  assert.deepEqual(harness.killed, ['product'], 'the surviving service is stopped and cleaned up');
  assert.match(harness.errors.join('\n'), /运行中的服务退出: data \(exit 0\)/);
  const payload = harness.json.at(-1) as { ok: boolean; error: { code: string; details: { service: string; exitCode: number }[] } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'CHILD_EXITED');
  assert.equal(payload.error.details[0]?.service, 'data');
  assert.equal(payload.error.details[0]?.exitCode, 0);
});

test('a mode never reports success from its own run loop, only through a signal', async () => {
  for (const [signal, expected] of [['SIGINT', 130], ['SIGTERM', 143]] as const) {
    const harness = new Harness();
    const pending = runRuntimeMode(planMode({ mode: 'dev', scenario: 'default', webPort: 5173, mockPort: 9090 }), harness.ports(), options());
    await tick();
    harness.emit(signal);
    assert.equal(await pending, expected);
    assert.deepEqual(harness.killed, ['mock', 'web'], `${signal} stops every child`);
    assert.deepEqual(harness.json, []);
    assert.equal(harness.errors.length, 0);
  }
});

test('addresses are only reported once every service passed its readiness check', async () => {
  const harness = new Harness();
  const pending = runRuntimeMode(planMode({ mode: 'dev', scenario: 'default', webPort: 5173, mockPort: 9090 }), harness.ports(), options());
  await tick();
  const readyLines = harness.logLines.filter((line) => line.includes('就绪'));
  assert.match(readyLines.join('\n'), /mock 就绪: http:\/\/127\.0\.0\.1:9090/);
  assert.match(readyLines.join('\n'), /web 就绪: http:\/\/127\.0\.0\.1:5173/);
  assert.equal(readyLines.length, 2);
  assert.match(harness.logLines.join('\n'), /访问入口: http:\/\/127\.0\.0\.1:5173/);
  harness.emit('SIGINT');
  assert.equal(await pending, 130);
  assert.doesNotMatch(harness.logLines.join('\n'), /失败|运行中的服务退出/);
});

test('a signal stops every child and maps to 130 or 143', async () => {
  for (const [signal, expected] of [['SIGINT', 130], ['SIGTERM', 143]] as const) {
    const harness = new Harness();
    let listener: ((signal: NodeJS.Signals) => void) | undefined;
    const ports = { ...harness.ports(), signals: { onSignal: (handler: (signal: NodeJS.Signals) => void) => { listener = handler; return () => { listener = undefined; }; } } };
    const pending = runRuntimeMode(planMode({ mode: 'dev', scenario: 'default', webPort: 5173, mockPort: 9090 }), ports, options());
    await tick();
    listener?.(signal);
    assert.equal(await pending, expected);
    assert.equal(harness.killed.length, 2, `${signal} reaches every child`);
    assert.equal(harness.group.stopping, true);
    assert.equal(harness.errors.length, 0);
  }
});

test('dry run describes the plan and performs no side effect', async () => {
  const harness = new Harness();
  const code = await runRuntimeMode(planMode({ mode: 'dev', scenario: 'default', webPort: 5173, mockPort: 9190 }), harness.ports(), { dryRun: true, json: false });
  assert.equal(code, 0);
  assert.equal(harness.spawns.length, 0);
  assert.equal(harness.runs.length, 0);
  assert.deepEqual(harness.json, []);
  const text = harness.logLines.join('\n');
  assert.match(text, /dry-run: runtime dev/);
  assert.match(text, /\[mock\] 候选端口 9190/);
  assert.match(text, /\[web\] 候选端口 5173/);
});

test('watch mode starts the rebuild watcher and treats its death as BUILD_FAILED', async () => {
  const harness = new Harness();
  const pending = runRuntimeMode(planMode({ mode: 'integration', watch: true, productPort: 8080, dataPort: 8081 }), harness.ports(), options({ json: true }));
  await tick();
  assert.match(harness.spawns[0]!.args.join(' '), /build --watch/);
  assert.deepEqual(harness.spawns.map((process) => process.role), ['web', 'data', 'product']);
  const watcher = harness.group.members[0] as FakeProcess;
  watcher.finish({ code: 1, signal: null });
  const code = await pending;
  assert.equal(code, 20);
  const payload = harness.json.at(-1) as { error: { code: string; message: string } };
  assert.equal(payload.error.code, 'BUILD_FAILED');
  assert.match(harness.errors.join('\n'), /前端构建监视退出/);
  assert.deepEqual(harness.killed, ['data', 'product'], 'watcher death stops the service stack and keeps its diagnostics');
  assert.deepEqual((harness.json[0] as { ok: boolean }).ok, true, 'the startup address list was already reported');
});

test('delivery build runs the frontend and the rust binaries when the workspace exists', async () => {
  const harness = new Harness();
  harness.root = workspace.root;
  const ports = harness.ports();
  const runOptions = options({ json: true });
  ports.fs = { read: async () => '', exists: async (path) => path.endsWith('Cargo.toml'), files: async () => [], mkdir: async () => undefined };
  const code = await runDeliveryBuild(ports, runOptions);
  assert.equal(code, 0);
  assert.deepEqual(harness.runs.map((run) => run.command), ['pnpm', 'cargo']);
  assert.deepEqual(harness.runs[1]!.args, ['build', '--release']);
  assert.ok(harness.runs.every((run) => run.env === undefined));
  assert.equal(harness.spawns.length, 0);
  assert.deepEqual((harness.json[0] as { services: unknown[] }).services, []);
});

test('delivery build skips rust when no cargo workspace is present', async () => {
  const harness = new Harness();
  const code = await runDeliveryBuild(harness.ports(), options());
  assert.equal(code, 0);
  assert.deepEqual(harness.runs.map((run) => run.command), ['pnpm']);
  assert.match(harness.logLines.join('\n'), /跳过 Rust binary 构建/);
});

test('delivery build failures surface as BUILD_FAILED with the builder output', async () => {
  const harness = new Harness();
  harness.runCode = 2;
  const code = await runDeliveryBuild(harness.ports(), options());
  assert.equal(code, 20);
  assert.match(harness.errors.join('\n'), /构建失败: pnpm -C src\/frontend run build/);
});

test('end to end: a real mock process is spawned, killed and leaves no survivor behind', async () => {
  const child = spawn(node, ['-e', `console.log('listening'); setInterval(() => {}, 500)`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const lines: string[] = [];
  child.stdout.on('data', (chunk) => lines.push(String(chunk).trim()));
  await new Promise((resolve) => child.stdout.once('data', resolve));
  assert.deepEqual(lines, ['listening']);
  child.kill('SIGTERM');
  const exit: ProcessExit = await new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal })));
  assert.equal(exit.signal, 'SIGTERM');
  assert.ok(!isAlive(child.pid));
});

function isAlive(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tick(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 20); });
}
