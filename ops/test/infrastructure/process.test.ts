import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { ManagedChildProcess, ProcessGroup, NodeProcess, NodeProcessSupervisor, ConsoleRuntimeLog } from '../../src/infrastructure/process.ts';
import type { LogLine } from '../../src/framework/ports.ts';

const node = process.execPath;

function collect(process: ManagedProcess): LogLine[] {
  const lines: LogLine[] = [];
  process.onLine((line) => lines.push(line));
  return lines;
}

async function isGone(pid: number | undefined): Promise<boolean> {
  if (pid === undefined) return true;
  return new Promise((resolve) => {
    try {
      process.kill(pid, 0);
      resolve(false);
    } catch {
      resolve(true);
    }
  });
}

/** Waits for a child to report readiness so a signal is not delivered before its handlers exist. */
function untilLine(process: ManagedProcess, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const off = process.onLine((line) => {
      if (line.text.includes(text)) { off(); resolve(); }
    });
    void process.exit().then((exit) => { if (exit.code !== 0) reject(new Error(`child left before reporting ${text}`)); });
  });
}

test('child lines are forwarded per line with stream and role kept apart', async () => {
  const child = new ManagedChildProcess('mock', spawn(node, ['-e', `
    console.log('stdout-1');
    console.log('stdout-2');
    process.stderr.write('stderr-1\\n');
    process.stdout.write('no-trailing-newline');
  `], { stdio: ['ignore', 'pipe', 'pipe'] }));
  const lines = collect(child);
  const exit = await child.exit();
  assert.equal(exit.code, 0);
  assert.deepEqual(lines.map((line) => `${line.stream}:${line.text}`), [
    'stdout:stdout-1',
    'stdout:stdout-2',
    'stderr:stderr-1',
    'stdout:no-trailing-newline',
  ]);
  assert.deepEqual(child.recentLogs(2), ['stderr-1', 'no-trailing-newline']);
});

test('spawn failures surface as a structured exit instead of hanging', async () => {
  const child = new ManagedChildProcess('data', spawn('/definitely/not/a/binary', [], { stdio: ['ignore', 'pipe', 'pipe'] }));
  const exit = await child.exit();
  assert.equal(exit.code, null);
  assert.match(exit.error ?? '', /ENOENT|spawn/);
  assert.ok(child.exited);
});

test('real children receive BLOG configuration only through an explicit per-child allowlist', async () => {
  const previousRepo = process.env.BLOG_CONTENT_REPO;
  const previousToken = process.env.BLOG_CONTENT_TOKEN;
  const previousAuth = process.env.BLOG_ADMIN_AUTH_SECRET;
  const previousModelProvider = process.env.BLOG_TAXONOMY_MODEL_PROVIDER;
  const previousModelCommand = process.env.BLOG_TAXONOMY_MODEL_COMMAND;
  process.env.BLOG_CONTENT_REPO = 'ambient/repository';
  process.env.BLOG_CONTENT_TOKEN = 'ambient-token';
  process.env.BLOG_ADMIN_AUTH_SECRET = 'ambient-auth';
  process.env.BLOG_TAXONOMY_MODEL_PROVIDER = 'ambient-provider';
  process.env.BLOG_TAXONOMY_MODEL_COMMAND = 'ambient-command';
  const script = 'console.log(JSON.stringify({repo:process.env.BLOG_CONTENT_REPO,token:process.env.BLOG_CONTENT_TOKEN,auth:process.env.BLOG_ADMIN_AUTH_SECRET,modelProvider:process.env.BLOG_TAXONOMY_MODEL_PROVIDER,modelCommand:process.env.BLOG_TAXONOMY_MODEL_COMMAND}))';
  try {
    const single = new NodeProcess();
    const scrubbed = await single.run(node, ['-e', script], process.cwd());
    assert.deepEqual(JSON.parse(scrubbed.stdout), {});
    const helper = await single.run(node, ['-e', script], process.cwd(), {
      BLOG_CONTENT_REPO: 'explicit/repository',
      BLOG_CONTENT_TOKEN: 'explicit-token',
    });
    assert.deepEqual(JSON.parse(helper.stdout), {
      repo: 'explicit/repository',
      token: 'explicit-token',
    });

    const supervisor = new NodeProcessSupervisor();
    const data = supervisor.spawn({ role: 'data', command: node, args: ['-e', script], cwd: process.cwd() });
    assert.equal((await data.exit()).code, 0);
    assert.deepEqual(JSON.parse(data.recentLogs()[0]!), {});
    const mock = supervisor.spawn({ role: 'mock', command: node, args: ['-e', script], cwd: process.cwd() });
    assert.equal((await mock.exit()).code, 0);
    assert.deepEqual(JSON.parse(mock.recentLogs()[0]!), {});
    const web = supervisor.spawn({ role: 'web', command: node, args: ['-e', script], cwd: process.cwd() });
    assert.equal((await web.exit()).code, 0);
    assert.deepEqual(JSON.parse(web.recentLogs()[0]!), {});

    const product = supervisor.spawn({
      role: 'product',
      command: node,
      args: ['-e', script],
      cwd: process.cwd(),
      env: {
        BLOG_CONTENT_REPO: 'explicit/repository',
        BLOG_CONTENT_TOKEN: 'explicit-token',
        BLOG_TAXONOMY_MODEL_PROVIDER: 'claude-cli',
        BLOG_TAXONOMY_MODEL_COMMAND: '/explicit/model-command',
      },
    });
    assert.equal((await product.exit()).code, 0);
    assert.deepEqual(JSON.parse(product.recentLogs()[0]!), {
      repo: 'explicit/repository',
      token: 'explicit-token',
      modelProvider: 'claude-cli',
      modelCommand: '/explicit/model-command',
    });
  } finally {
    if (previousRepo === undefined) delete process.env.BLOG_CONTENT_REPO; else process.env.BLOG_CONTENT_REPO = previousRepo;
    if (previousToken === undefined) delete process.env.BLOG_CONTENT_TOKEN; else process.env.BLOG_CONTENT_TOKEN = previousToken;
    if (previousAuth === undefined) delete process.env.BLOG_ADMIN_AUTH_SECRET; else process.env.BLOG_ADMIN_AUTH_SECRET = previousAuth;
    if (previousModelProvider === undefined) delete process.env.BLOG_TAXONOMY_MODEL_PROVIDER; else process.env.BLOG_TAXONOMY_MODEL_PROVIDER = previousModelProvider;
    if (previousModelCommand === undefined) delete process.env.BLOG_TAXONOMY_MODEL_COMMAND; else process.env.BLOG_TAXONOMY_MODEL_COMMAND = previousModelCommand;
  }
});

test('signals reach the child and the exit reports the signal', async () => {
  const child = new ManagedChildProcess('web', spawn(node, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['ignore', 'pipe', 'pipe'] }));
  const lines = collect(child);
  await child.kill('SIGTERM');
  const exit = await child.exit();
  assert.equal(exit.signal, 'SIGTERM');
  assert.ok(await isGone(child.pid));
  assert.equal(lines.length, 0);
});

test('stopAll escalates to SIGKILL once the grace period expires and leaves no survivor', async () => {
  const supervisor = new NodeProcessSupervisor();
  const group = supervisor.createGroup();
  const stubborn = group.add(supervisor.spawn({
    role: 'web',
    command: node,
    args: ['-e', `process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)`],
    cwd: process.cwd(),
  }));
  const polite = group.add(supervisor.spawn({ role: 'data', command: node, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: process.cwd() }));
  await untilLine(stubborn, 'ready');
  const started = Date.now();
  await group.stopAll('SIGTERM', 300);
  assert.ok(Date.now() - started >= 290);
  const exits = await group.allExits();
  assert.equal(exits.find((outcome) => outcome.process === polite)?.exit.signal, 'SIGTERM');
  assert.equal(exits.find((outcome) => outcome.process === stubborn)?.exit.signal, 'SIGKILL');
  for (const process of group.members) assert.ok(await isGone(process.pid));
});

test('stopAll returns as soon as every child acknowledged the signal', async () => {
  const supervisor = new NodeProcessSupervisor();
  const group = supervisor.createGroup();
  group.add(supervisor.spawn({ role: 'mock', command: node, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: process.cwd() }));
  const started = Date.now();
  await group.stopAll('SIGINT', 5000);
  assert.ok(Date.now() - started < 1000);
  for (const process of group.members) assert.ok(await isGone(process.pid));
});

test('the exit of the first child is observable while the rest keep running', async () => {
  const supervisor = new NodeProcessSupervisor();
  const group = supervisor.createGroup();
  const quick = group.add(supervisor.spawn({ role: 'data', command: node, args: ['-e', 'console.log("bye"); process.exit(3)'], cwd: process.cwd() }));
  const slow = group.add(supervisor.spawn({ role: 'product', command: node, args: ['-e', 'setTimeout(() => process.exit(0), 400)'], cwd: process.cwd() }));
  const first = await group.firstExit();
  assert.equal(first.process, quick);
  assert.equal(first.exit.code, 3);
  await group.stopAll('SIGTERM', 2000);
  assert.equal((await slow.exit()).signal, 'SIGTERM');
});

test('forwarding never doubles a child prefix and keeps unprefixed lines attributed', () => {
  const sink: { out: string[]; err: string[] } = { out: [], err: [] };
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (value: string) => sink.out.push(value);
  console.error = (value: string) => sink.err.push(value);
  try {
    const log = new ConsoleRuntimeLog(false);
    log.log('mock', '[mock] already prefixed by the service');
    log.log('web', 'VITE ready in 200 ms');
    log.log('ops', '未找到 Cargo workspace');
    assert.deepEqual(sink.out, [
      '[mock] already prefixed by the service',
      '[web] VITE ready in 200 ms',
      '[ops] 未找到 Cargo workspace',
    ]);
    assert.deepEqual(sink.err, []);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test('console log routing keeps stdout to the json object and errors on stderr', async () => {
  const sink: { out: string[]; err: string[] } = { out: [], err: [] };
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (value: string) => sink.out.push(value);
  console.error = (value: string) => sink.err.push(value);
  try {
    const human = new ConsoleRuntimeLog(false);
    human.info('progress');
    human.error('boom');
    human.log('data', 'line');
    assert.deepEqual(sink.out, ['[ops] progress', '[data] line']);
    assert.deepEqual(sink.err, ['[ops] boom']);
    sink.out.length = 0;
    sink.err.length = 0;
    const json = new ConsoleRuntimeLog(true);
    json.info('progress');
    json.log('product', 'line');
    json.json({ ok: true });
    assert.deepEqual(sink.out, ['{"ok":true}']);
    assert.deepEqual(sink.err, ['[ops] progress', '[product] line']);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});
