import test from 'node:test';
import assert from 'node:assert/strict';
import { runPageNew } from '../../src/page/page-new.ts';
import type { ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';

const workspace: Workspace = { root: '/repo', web: '/repo/src/frontend', apps: '/repo/apps', appSource: '/repo/apps/blog/src', appTests: '/repo/apps/blog/test' };

const spec = { platform: 'mobile' as const, id: 'mobile-about', title: '关于', alias: '/m/about' };

function harness(code = 0) {
  const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  const process: ProcessPort = { async run(command, args, cwd) { calls.push({ command, args, cwd }); return { code, stdout: 'done', stderr: 'boom' }; } };
  const messages: string[] = [];
  const reporter: Reporter = { section: (value) => messages.push(`section:${value}`), ok: (value) => messages.push(`ok:${value}`), fail: (value) => messages.push(`fail:${value}`), info: (value) => messages.push(`info:${value}`) };
  return { process, reporter, calls, messages };
}

test('page new runs pnpm page:new with explicit args', async () => {
  const h = harness();
  assert.equal(await runPageNew(spec, workspace, h.process, h.reporter, { dryRun: false }), true);
  assert.deepEqual(h.calls[0], {
    command: 'pnpm',
    args: ['-C', 'src/frontend', 'run', 'page:new', '--', '--platform', 'mobile', '--id', 'mobile-about', '--title', '关于', '--alias', '/m/about'],
    cwd: '/repo',
  });
  assert.ok(h.messages.includes('ok:pnpm page:new'));
});

test('page new reports rejected scaffolds', async () => {
  const h = harness(1);
  assert.equal(await runPageNew(spec, workspace, h.process, h.reporter, { dryRun: false }), false);
  assert.ok(h.messages.includes('fail:pnpm page:new'));
  assert.ok(h.messages.includes('info:boom'));
});

test('page new dry-run does not spawn pnpm', async () => {
  const h = harness();
  assert.equal(await runPageNew(spec, workspace, h.process, h.reporter, { dryRun: true }), true);
  assert.equal(h.calls.length, 0);
  assert.ok(h.messages.some((message) => message.includes('--platform mobile')));
});
