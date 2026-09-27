import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apexAlias, configTemplate, parseBlogConfig, seedFromLegacy } from './config.ts';
import { renderTemplate } from './render.ts';
import { fetchReleases, pickAsset, pickBuildRelease, targetForArch, verifyChecksums } from './release.ts';
import { main } from './main.ts';

const VALID = {
  serverName: 'blog.example.com',
  contentRepo: 'owner/my-content',
  contentToken: 'github_pat_test',
};
const RELEASES = [
  {
    tag: 'build-v0.1.0',
    assets: [
      { name: 'blog-release-x86_64-unknown-linux-musl-1.tar.gz', url: 'https://example.test/x86' },
      { name: 'blog-release-aarch64-unknown-linux-musl-1.tar.gz', url: 'https://example.test/arm' },
    ],
  },
  { tag: 'build-v0.2.0', assets: [{ name: 'blog-release-x86_64-unknown-linux-musl-2.tar.gz', url: 'https://example.test/x86b' }] },
  { tag: 'script-v0.1.0', assets: [{ name: 'blog-deploy.mjs', url: 'https://example.test/mjs' }] },
];

test('config rejects placeholders and unknown fields', () => {
  assert.deepEqual(parseBlogConfig(JSON.stringify(VALID)), VALID);
  assert.throws(() => parseBlogConfig(configTemplate()), /未填写/);
  assert.throws(() => parseBlogConfig(JSON.stringify({ ...VALID, extra: 1 })), /未知字段/);
  assert.throws(() => parseBlogConfig('not json'), /合法 JSON/);
  assert.throws(() => parseBlogConfig(JSON.stringify({ ...VALID, buildTag: 'v1' })), /buildTag/);
  const seeded = seedFromLegacy({
    deployEnv: 'SERVER_NAME=blog.example.com\nCONTENT_REPO=owner/my-content\n',
    productEnv: 'BLOG_CONTENT_TOKEN=github_pat_test\n',
  });
  assert.deepEqual(seeded, VALID);
});

test('apex alias is derived only for www hostnames', () => {
  assert.equal(apexAlias('www.blog.example.com'), 'blog.example.com');
  assert.equal(apexAlias('blog.example.com'), '');
  assert.equal(apexAlias('wwww.blog.example.com'), '');
});

test('templates substitute placeholders and refuse unresolved output', () => {
  assert.equal(
    renderTemplate('name={{serverName}} repo={{contentRepo}}', { serverName: 'a.com', contentRepo: 'o/r' }),
    'name=a.com repo=o/r',
  );
  assert.throws(() => renderTemplate('{{missing}}', {}), /缺少占位符/);
  assert.throws(() => renderTemplate('{{a}}', { a: '{{b}}' }), /未解析占位符/);
});

test('release selection prefers the newest build tag and matches the architecture', () => {
  assert.equal(targetForArch('x64'), 'x86_64-unknown-linux-musl');
  assert.equal(targetForArch('arm64'), 'aarch64-unknown-linux-musl');
  assert.throws(() => targetForArch('ia32'), /不支持的架构/);
  const latest = pickBuildRelease(RELEASES);
  assert.equal(latest.tag, 'build-v0.2.0');
  assert.equal(pickBuildRelease(RELEASES, 'build-v0.1.0').tag, 'build-v0.1.0');
  assert.throws(() => pickBuildRelease(RELEASES, 'build-v9.9.9'), /找不到 Release/);
  assert.match(pickAsset(latest, 'x86_64-unknown-linux-musl').name, /x86_64/);
  assert.throws(() => pickAsset(latest, 'aarch64-unknown-linux-musl'), /缺少/);
  assert.throws(() => pickBuildRelease([...RELEASES].filter((r) => r.tag !== 'build-v0.1.0' && r.tag !== 'build-v0.2.0')), /还没有 build-v/);
});

test('fetchReleases parses the public API payload', async () => {
  const fakeFetch = async (): Promise<Awaited<ReturnType<typeof fetch>>> =>
    new Response(JSON.stringify([
      { tag_name: 'build-v0.1.0', assets: [{ name: 'a.tar.gz', browser_download_url: 'https://example.test/a' }] },
      { tag_name: 'script-v0.1.0', assets: [] },
    ]), { status: 200 });
  const releases = await fetchReleases('owner/repo', fakeFetch as never);
  assert.deepEqual(releases[0], { tag: 'build-v0.1.0', assets: [{ name: 'a.tar.gz', url: 'https://example.test/a' }] });
});

test('verifyChecksums detects tampering', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blog-deploy-test-'));
  try {
    await writeFile(join(directory, 'file.txt'), 'hello');
    const hash = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
    await writeFile(join(directory, 'SHA256SUMS'), `${hash}  file.txt\n`);
    await verifyChecksums(directory, join(directory, 'SHA256SUMS'));
    await writeFile(join(directory, 'file.txt'), 'tampered');
    await assert.rejects(() => verifyChecksums(directory, join(directory, 'SHA256SUMS')), /校验失败/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('init creates a skeleton, refuses overwrite, and force rewrites', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blog-deploy-init-'));
  const configFile = join(directory, 'blog.json');
  try {
    assert.equal(await main(['init', '--config', configFile]), 0);
    const text = await readFile(configFile, 'utf8');
    assert.match(text, /serverName/);
    assert.match(text, /contentToken/);
    assert.equal(await main(['init', '--config', configFile]), 10);
    assert.equal(await main(['init', '--config', configFile, '--force']), 0);
    assert.equal(await main(['deploy', '--config', join(directory, 'missing.json'), '--dry-run']), 10);
    assert.equal(await main(['help']), 0);
    assert.equal(await main(['--wat']), 10);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
