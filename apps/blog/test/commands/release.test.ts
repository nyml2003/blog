import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import { runRelease, type ReleaseKind, type ReleasePorts } from '../../src/release/release.ts';

function world(kind: ReleaseKind, options: { dirty?: string; tags?: string } = {}) {
  const calls: Array<{ args: string[] }> = [];
  const lines: string[] = [];
  const process: ProcessPort = {
    run: async (_command, args) => {
      calls.push({ args: [...args] });
      if (args[0] === 'status') return { code: 0, stdout: options.dirty ?? '', stderr: '' };
      if (args[0] === 'branch') return { code: 0, stdout: 'main\n', stderr: '' };
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return { code: 0, stdout: 'abc123\n', stderr: '' };
      if (args[0] === 'remote') return { code: 0, stdout: 'git@github.com:nyml2003/blog.git\n', stderr: '' };
      if (args[0] === 'tag' && args[1] === '--list') return { code: 0, stdout: options.tags ?? '', stderr: '' };
      if (args[0] === 'rev-parse') return { code: 128, stdout: '', stderr: 'missing tag' };
      return { code: 0, stdout: '', stderr: '' };
    },
  };
  const reporter: Reporter = {
    section: (value) => lines.push(`section:${value}`),
    ok: (value) => lines.push(`ok:${value}`),
    fail: (value) => lines.push(`fail:${value}`),
    info: (value) => lines.push(`info:${value}`),
  };
  const ports: ReleasePorts = { process, reporter, root: '/repo' };
  return { kind, ports, calls, lines };
}

test('release dry-run computes independent next patch tags without writing', async () => {
  const h = world('both', { tags: 'script-v0.1.1\nbuild-v0.3.4\n' });
  const code = await runRelease(h.kind, h.ports, { dryRun: true, confirmed: false });
  assert.equal(code, 0);
  assert.match(h.lines.join('\n'), /script-v0\.1\.2, build-v0\.3\.5/);
  assert.equal(h.calls.some(({ args }) => args[0] === 'push' || args[0] === 'tag' && args[1] !== '--list'), false);
});

test('release refuses a dirty worktree before checking tags', async () => {
  const h = world('script', { dirty: ' M apps/blog/src/release/release.ts\n' });
  const code = await runRelease(h.kind, h.ports, { dryRun: false, confirmed: true });
  assert.equal(code, 20);
  assert.match(h.lines.join('\n'), /工作树不干净/);
  assert.equal(h.calls.some(({ args }) => args[0] === 'push'), false);
});

test('release requires explicit confirmation before creating or pushing tags', async () => {
  const h = world('build');
  const code = await runRelease(h.kind, h.ports, { dryRun: false, confirmed: false });
  assert.equal(code, 10);
  assert.match(h.lines.join('\n'), /--yes/);
  assert.equal(h.calls.some(({ args }) => args[0] === 'push' || args[0] === 'tag' && args[1] !== '--list'), false);
});

test('confirmed release creates then pushes all planned tags', async () => {
  const h = world('both');
  const code = await runRelease(h.kind, h.ports, { dryRun: false, confirmed: true });
  assert.equal(code, 0);
  assert.deepEqual(h.calls.filter(({ args }) => args[0] === 'tag' && args[1] !== '--list').map(({ args }) => args.slice(0, 3)), [
    ['tag', 'script-v0.1.0', 'abc123'],
    ['tag', 'build-v0.1.0', 'abc123'],
  ]);
  assert.deepEqual(h.calls.at(-1)?.args, ['push', 'origin', 'script-v0.1.0', 'build-v0.1.0']);
});
