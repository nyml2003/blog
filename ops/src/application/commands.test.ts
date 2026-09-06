import test from 'node:test';
import assert from 'node:assert/strict';
import { runWebQuality } from './commands.ts';
import type { ProcessPort, Reporter } from '../domain/ports.ts';
import type { Workspace } from '../domain/workspace.ts';

const workspace: Workspace = { root: '/repo', web: '/repo/web', ops: '/repo/ops' };

function harness(code = 0) {
  const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  const process: ProcessPort = { async run(command, args, cwd) { calls.push({ command, args, cwd }); return { code, stdout: '', stderr: '' }; } };
  const messages: string[] = [];
  const reporter: Reporter = { section: (value) => messages.push(`section:${value}`), ok: (value) => messages.push(`ok:${value}`), fail: (value) => messages.push(`fail:${value}`), info: (value) => messages.push(`info:${value}`) };
  return { process, reporter, calls, messages };
}

test('web quality uses the pnpm workspace filter', async () => {
  const h = harness();
  assert.equal(await runWebQuality(workspace, h.process, h.reporter, 'lint'), true);
  assert.deepEqual(h.calls[0], { command: 'pnpm', args: ['--filter', 'blog-web', 'run', 'lint'], cwd: '/repo' });
  assert.equal(await runWebQuality(workspace, h.process, h.reporter, 'format', true), true);
  assert.deepEqual(h.calls[1], { command: 'pnpm', args: ['--filter', 'blog-web', 'run', 'format:check'], cwd: '/repo' });
});

test('web quality reports failed pnpm scripts', async () => {
  const h = harness(1);
  assert.equal(await runWebQuality(workspace, h.process, h.reporter, 'format'), false);
  assert.ok(h.messages.includes('fail:pnpm format'));
});
