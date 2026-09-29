import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from '../../src/quality/quality-check.ts';
import type { FsPort, ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';

const workspace: Workspace = { root: '/repo', web: '/repo/src/frontend', apps: '/repo/apps', appSource: '/repo/apps/blog/src', appTests: '/repo/apps/blog/test' };

/** Minimal fs stub: every ops TS file exists, the frontend manifest depends on the scenario. */
function stubFs(options: { cargo: boolean; web: boolean }): FsPort {
  return {
    read: async () => 'export const x = 1;',
    exists: async (path: string) => path.endsWith('Cargo.toml') ? options.cargo : options.web && path.endsWith('package.json'),
    files: async (root: string) => root.endsWith('/blog/src') ? ['/repo/apps/blog/src/a.ts'] : root.endsWith('/blog/test') ? ['/repo/apps/blog/test/a.test.ts'] : [],
    mkdir: async () => undefined,
  };
}

function harness(code = 0) {
  const calls: Array<{ command: string; args: string[] }> = [];
  const process: ProcessPort = {
    async run(command, args) {
      calls.push({ command, args: [...args] });
      return { code, stdout: '', stderr: '' };
    },
  };
  const messages: string[] = [];
  const reporter: Reporter = {
    section: (value) => messages.push(`section:${value}`),
    ok: (value) => messages.push(`ok:${value}`),
    fail: (value) => messages.push(`fail:${value}`),
    info: (value) => messages.push(`info:${value}`),
  };
  return { process, calls, messages, reporter, labels: () => calls.map((call) => `${call.command} ${call.args.join(' ')}`) };
}

test('quality check runs the rust gate and drops the retired go gate', async () => {
  const h = harness();
  const passed = await runCheck(workspace, h.process, stubFs({ cargo: true, web: false }), h.reporter);
  assert.equal(passed, true);
  const labels = h.labels();
  assert.deepEqual(labels.slice(0, 3), [
    'cargo fmt --all --check',
    'cargo clippy --workspace --all-targets -- -D warnings',
    'cargo test --workspace',
  ]);
  const joined = labels.join(' | ');
  assert.doesNotMatch(joined, /(^|\s)(gofmt|go vet|go test)(\s|$)/, 'the retired go gate is gone');
  assert.ok(h.messages.includes('ok:blog contract tests'));
});

test('a missing cargo workspace fails the rust gate instead of passing silently', async () => {
  const h = harness();
  const passed = await runCheck(workspace, h.process, stubFs({ cargo: false, web: false }), h.reporter);
  assert.equal(passed, false);
  assert.equal(h.labels().some((label) => label.startsWith('cargo ')), false);
  assert.ok(h.messages.includes('fail:cargo workspace'));
  assert.ok(h.messages.some((message) => message.startsWith('info:未找到 Cargo.toml')));
});

test('a failing rust command fails the whole check', async () => {
  const h = harness(1);
  const passed = await runCheck(workspace, h.process, stubFs({ cargo: true, web: false }), h.reporter);
  assert.equal(passed, false);
  assert.ok(h.messages.includes('fail:cargo fmt'));
});

test('quality check includes the frontend core test suite', async () => {
  const h = harness();
  const passed = await runCheck(workspace, h.process, stubFs({ cargo: true, web: true }), h.reporter);
  assert.equal(passed, true);
  assert.ok(h.labels().includes('pnpm -C src/frontend run test:core'));
});
