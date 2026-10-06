import test from 'node:test';
import assert from 'node:assert/strict';
import { runWebQuality } from '../../src/quality/commands.ts';
import { createEffectPort } from '@fluvient-cli/cli-kit/effects.ts';
import type { ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';

const workspace: Workspace = { root: '/repo', web: '/repo/src/frontend', apps: '/repo/apps', appSource: '/repo/apps/blog/src', appTests: '/repo/apps/blog/test' };

function harness(code = 0) {
  const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  const process: ProcessPort = { async run(command, args, cwd) { calls.push({ command, args, cwd }); return { code, stdout: '', stderr: '' }; } };
  const messages: string[] = [];
  const reporter: Reporter = { section: (value) => messages.push(`section:${value}`), ok: (value) => messages.push(`ok:${value}`), fail: (value) => messages.push(`fail:${value}`), info: (value) => messages.push(`info:${value}`) };
  const effects = createEffectPort({ dryRun: false, operationIds: { next: () => 'op' } });
  return { process, reporter, calls, messages, effects };
}

test('web quality runs pnpm with -C src/frontend', async () => {
  const h = harness();
  assert.equal(await runWebQuality(workspace, h.process, h.reporter, h.effects, 'lint'), true);
  assert.deepEqual(h.calls[0], { command: 'pnpm', args: ['-C', 'src/frontend', 'run', 'lint'], cwd: '/repo' });
  assert.equal(await runWebQuality(workspace, h.process, h.reporter, h.effects, 'format:check'), true);
  assert.deepEqual(h.calls[1], { command: 'pnpm', args: ['-C', 'src/frontend', 'run', 'format:check'], cwd: '/repo' });
});

test('web quality reports failed pnpm scripts', async () => {
  const h = harness(1);
  assert.equal(await runWebQuality(workspace, h.process, h.reporter, h.effects, 'format'), false);
  assert.ok(h.messages.includes('fail:pnpm format'));
});
