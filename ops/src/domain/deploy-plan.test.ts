import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deployOutline,
  packageSteps,
  parseDeployConfig,
  privileged,
  releaseArchiveName,
  renderTemplate,
  shellQuote,
} from './deploy-plan.ts';

const minimal = {
  host: 'blog',
  target: 'x86_64-unknown-linux-musl',
  serverName: 'example.com',
  contentRepo: 'owner/repo',
};

test('deploy config applies conventions and rejects invalid shapes', () => {
  const config = parseDeployConfig(JSON.stringify(minimal), '/home/me');
  assert.equal(config.port, undefined);
  assert.equal(config.tokenFile, '/home/me/.local/state/blog/product.env');
  assert.equal(config.archiveRemoteDir, 'blog-releases');
  assert.equal(config.certSourceDir, 'cert');

  const invalid: unknown[] = [
    { host: '', target: minimal.target, serverName: minimal.serverName, contentRepo: minimal.contentRepo },
    { host: 'x', target: 'wasm32', serverName: minimal.serverName, contentRepo: minimal.contentRepo },
    { host: 'x', target: minimal.target, serverName: 'bad name', contentRepo: minimal.contentRepo },
    { host: 'x', target: minimal.target, serverName: minimal.serverName, contentRepo: 'no-slash' },
    { host: 'x', port: 0, target: minimal.target, serverName: minimal.serverName, contentRepo: minimal.contentRepo },
    { host: 'x', target: minimal.target, serverName: minimal.serverName, contentRepo: minimal.contentRepo, tokenFile: 'relative' },
    { host: 'x', target: minimal.target, serverName: minimal.serverName, contentRepo: minimal.contentRepo, archiveRemoteDir: '../escape' },
    { host: 'x', target: minimal.target, serverName: minimal.serverName, contentRepo: minimal.contentRepo, extra: true },
  ];
  for (const bad of invalid) {
    assert.throws(() => parseDeployConfig(JSON.stringify(bad)), /deploy config/);
  }
  assert.throws(() => parseDeployConfig('not json'), /deploy config/);
});

test('templates render configured values and reject unresolved placeholders', () => {
  assert.equal(
    renderTemplate('repo={{contentRepo}} host={{serverName}}', { contentRepo: 'owner/repo', serverName: 'example.com' }),
    'repo=owner/repo host=example.com',
  );
  assert.throws(() => renderTemplate('{{missing}}', {}), /缺少占位符取值/);
  assert.throws(() => renderTemplate('{{a}}', { a: '{{b}}' }), /未解析占位符/);
});

test('package plan builds for the configured target and archives under deploy/dist', () => {
  const config = parseDeployConfig(JSON.stringify(minimal), '/home/me');
  const steps = packageSteps(config, '/repo', '/repo/deploy/dist/blog-release-x.tar.gz');
  assert.equal(steps.length, 3);
  assert.match(steps[1]!.args.at(-1)!, /cargo zigbuild --release --locked --target x86_64-unknown-linux-musl/);
  assert.match(steps[2]!.args.join(' '), /deploy\/dist\/blog-release-x\.tar\.gz/);
  assert.equal(releaseArchiveName(config, '20260927T120000Z'), 'blog-release-x86_64-unknown-linux-musl-20260927T120000Z.tar.gz');
  assert.equal(deployOutline(config).length, 10);
});

test('privileged scripts are wrapped for non-root users and shell-quoted', () => {
  assert.equal(privileged(0, 'id'), 'id');
  assert.match(privileged(1000, 'echo hi'), /^sudo -n sh -c '/);
  assert.equal(shellQuote("a'b"), `'a'\\''b'`);
});
