import test from 'node:test';
import assert from 'node:assert/strict';
import { runE2e } from '../../src/e2e/e2e.ts';
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

const args = {
  mode: 'dev' as const,
  scenario: 'empty' as const,
  'playwright-module': 'missing-playwright-module',
  'chromium-path': '/tmp/chromium',
};

test('e2e dry-run does not probe ports, create artifacts, or start processes', async () => {
  let probed = false;
  let created = false;
  let spawned = false;
  const base = context({
    dryRun: true,
    probe: { isFree: async () => { probed = true; return true; } },
    fs: { read: async () => '', exists: async () => false, files: async () => [], mkdir: async () => { created = true; } },
    supervisor: { spawn: () => { spawned = true; throw new Error('must not spawn'); }, createGroup: () => { throw new Error('must not create group'); } },
  });

  assert.equal(await runE2e(base, args), 0);
  assert.equal(probed, false);
  assert.equal(created, false);
  assert.equal(spawned, false);
});

test('e2e stops the runtime group when Playwright loading fails', async () => {
  const group = new FakeGroup();
  const process = new FakeProcess();
  const base = context({
    supervisor: {
      spawn: () => process,
      createGroup: () => group,
    },
  });
  await assert.rejects(
    runE2e(base, args),
    /Cannot find module|Cannot find package|missing-playwright-module/,
  );
  assert.equal(group.stopCount, 1);
  assert.equal(process.killed, true);
});
