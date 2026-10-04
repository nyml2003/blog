import test from 'node:test';
import assert from 'node:assert/strict';
import { runPageCheck } from '../../src/page/page-check.ts';
import type { ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';

const workspace: Workspace = { root: '/repo', web: '/repo/src/frontend', apps: '/repo/apps', appSource: '/repo/apps/blog/src', appTests: '/repo/apps/blog/test' };

function harness(code = 0) {
  const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  const process: ProcessPort = { async run(command, args, cwd) { calls.push({ command, args, cwd }); return { code, stdout: '', stderr: 'boom' }; } };
  const messages: string[] = [];
  const reporter: Reporter = { section: (value) => messages.push(`section:${value}`), ok: (value) => messages.push(`ok:${value}`), fail: (value) => messages.push(`fail:${value}`), info: (value) => messages.push(`info:${value}`) };
  return { process, reporter, calls, messages };
}

test('page check runs pnpm page:check in src/frontend', async () => {
  const h = harness();
  assert.equal(await runPageCheck(workspace, h.process, h.reporter, { dryRun: false }), true);
  assert.deepEqual(h.calls[0], { command: 'pnpm', args: ['-C', 'src/frontend', 'run', 'page:check'], cwd: '/repo' });
  assert.ok(h.messages.includes('ok:pnpm page:check'));
});

test('page check reports failed registry validation', async () => {
  const h = harness(1);
  assert.equal(await runPageCheck(workspace, h.process, h.reporter, { dryRun: false }), false);
  assert.ok(h.messages.includes('fail:pnpm page:check'));
  assert.ok(h.messages.includes('info:boom'));
});

test('page check dry-run does not spawn pnpm', async () => {
  const h = harness();
  assert.equal(await runPageCheck(workspace, h.process, h.reporter, { dryRun: true }), true);
  assert.equal(h.calls.length, 0);
  assert.ok(h.messages.includes('section:ops page check'));
});
