import test from 'node:test';
import assert from 'node:assert/strict';
import { runCodeStats } from '../../src/stats/code-lines.ts';
import { NodePath } from '@fluvient-cli/cli-core/path.ts';
import type { FsPort, ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';

const workspace: Workspace = { root: '/repo', web: '/repo/src/frontend', apps: '/repo/apps', appSource: '/repo/apps/blog/src', appTests: '/repo/apps/blog/test' };
const path = new NodePath();

function harness(files: Record<string, string>, options: { listing?: string[]; code?: number; unreadable?: string[] } = {}) {
  const listing = options.listing ?? Object.keys(files);
  const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  const process: ProcessPort = {
    async run(command, args, cwd) {
      calls.push({ command, args: [...args], cwd });
      return { code: options.code ?? 0, stdout: listing.map((path) => `${path}\u0000`).join(''), stderr: options.code ? 'fatal: not a git repository' : '' };
    },
  };
  const fs: FsPort = {
    read: async (file) => {
      const relative = file.slice(workspace.root.length + 1);
      if (options.unreadable?.includes(relative)) throw new Error(`ENOENT: ${file}`);
      return files[relative] ?? '';
    },
    exists: async () => false,
    files: async () => [],
    mkdir: async () => undefined,
  };
  const messages: string[] = [];
  const reporter: Reporter = {
    section: (value) => messages.push(`section:${value}`),
    ok: (value) => messages.push(`ok:${value}`),
    fail: (value) => messages.push(`fail:${value}`),
    info: (value) => messages.push(`info:${value}`),
  };
  return { process, fs, reporter, calls, messages, groups: () => messages.filter((message) => message.startsWith('info:.')) };
}

test('stats lines counts listed text files and sorts extension groups by lines', async () => {
  const h = harness({
    'src/a.ts': 'a\nb\n',
    'src/b.ts': 'c',
    'docs/readme.md': 'x\n',
    'img/logo.png': 'binary\u0000data',
  });
  assert.equal(await runCodeStats(workspace, h.process, h.fs, path, h.reporter, {}), true);
  assert.deepEqual(h.calls[0], { command: 'git', args: ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd: '/repo' });
  assert.ok(h.messages.includes('info:共 3 个文件，4 行'));
  assert.ok(h.messages.includes('ok:统计完成'));
  assert.match(h.groups()[0]!, /^info:\.ts\s+2 文件\s+3 行$/);
  assert.match(h.groups()[1]!, /^info:\.md\s+1 文件\s+1 行$/);
});

test('stats lines top option limits the extension groups', async () => {
  const h = harness({ 'a.ts': '1\n', 'b.md': '2\n3\n' });
  await runCodeStats(workspace, h.process, h.fs, path, h.reporter, { top: 1 });
  assert.equal(h.groups().length, 1);
  assert.match(h.groups()[0]!, /\.md/);
});

test('stats lines skips files that cannot be read and reports the count', async () => {
  const h = harness({ 'a.ts': '1\n', 'gone.ts': 'x\n' }, { unreadable: ['gone.ts'] });
  assert.equal(await runCodeStats(workspace, h.process, h.fs, path, h.reporter, {}), true);
  assert.ok(h.messages.includes('info:共 1 个文件，1 行'));
  assert.ok(h.messages.includes('info:跳过无法读取的文件: 1'));
});

test('stats lines reports a failed git listing without reading files', async () => {
  const h = harness({ 'a.ts': '1\n' }, { code: 128 });
  assert.equal(await runCodeStats(workspace, h.process, h.fs, path, h.reporter, {}), false);
  assert.ok(h.messages.some((message) => message.startsWith('fail:git ls-files')));
  assert.ok(h.messages.some((message) => message.includes('fatal: not a git repository')));
  assert.equal(h.messages.some((message) => message.startsWith('ok:')), false);
});
