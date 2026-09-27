import test from 'node:test';
import assert from 'node:assert/strict';
import { basename } from 'node:path';
import type { FsPort, ProcessPort, ProcessResult, Reporter } from '../domain/ports.ts';
import { releaseArtifacts, type ReleaseManifest } from '../domain/deploy-plan.ts';
import { runDeployPackage, type DeployPorts } from './deploy-package.ts';

const ROOT = '/repo';
const TOKEN_SENTINEL = 'github_pat_SENTINEL_MUST_NOT_APPEAR';
const TARGET = 'x86_64-unknown-linux-musl' as const;

function captureReporter() {
  const lines: string[] = [];
  const reporter: Reporter = {
    section: (title) => lines.push(`# ${title}`),
    ok: (message) => lines.push(`OK ${message}`),
    fail: (message) => lines.push(`FAIL ${message}`),
    info: (message) => lines.push(`INFO ${message}`),
  };
  return { reporter, lines };
}

class PackageWorld {
  readonly files = new Map<string, string>();
  readonly commands: Array<{ command: string; args: string[] }> = [];

  constructor() {
    this.files.set(`${ROOT}/deploy/systemd/blog-data.service`, '[Service]\nExecStart=/usr/local/bin/data\n');
    this.files.set(`${ROOT}/deploy/systemd/blog-product.service`, '[Service]\nEnvironment=BLOG_CONTENT_REPO={{contentRepo}}\n');
    this.files.set(`${ROOT}/deploy/nginx/blog.conf`, 'server_name {{serverName}};\n');
    this.files.set(`${ROOT}/deploy/install.sh`, '#!/usr/bin/env bash\nCONFIG_FILE="${DEPLOY_ENV_FILE:-/etc/blog/deploy.env}"\nset -euo pipefail\n');
    this.files.set(`${ROOT}/src/frontend/dist/index.html`, '<html></html>');
    this.files.set(`${ROOT}/src/frontend/dist/assets/app.js`, 'console.log(1)');
    for (const name of ['product', 'data', 'blog-admin-credentials']) {
      this.files.set(`${ROOT}/src/target/${TARGET}/release/${name}`, `binary:${name}`);
    }
  }

  readonly process: ProcessPort = {
    run: async (command, args): Promise<ProcessResult> => {
      this.commands.push({ command, args: [...args] });
      return { code: 0, stdout: '', stderr: '' };
    },
  };

  readonly fs: FsPort = {
    read: async (path) => this.files.get(path) ?? '',
    exists: async (path) => this.files.has(path),
    files: async (root) => [...this.files.keys()].filter((path) => path.startsWith(`${root}/`)),
    mkdir: async () => undefined,
    write: async (path, content) => { this.files.set(path, content); },
    copy: async (from, to) => { this.files.set(to, this.files.get(from) ?? ''); },
    readBytes: async (path) => Buffer.from(this.files.get(path) ?? ''),
  };

  ports(reporter: Reporter): DeployPorts {
    return { process: this.process, fs: this.fs, reporter, root: ROOT };
  }
}

test('package assembles an environment-independent release with checksums and no secrets', async () => {
  const world = new PackageWorld();
  const { reporter, lines } = captureReporter();
  const code = await runDeployPackage(TARGET, world.ports(reporter), { dryRun: false });
  assert.equal(code, 0, lines.join('\n'));

  const product = world.files.get(`${ROOT}/deploy/dist/.staging/systemd/blog-product.service`) ?? '';
  assert.match(product, /\{\{contentRepo\}\}/, 'templates must stay unrendered in the release');
  const nginx = world.files.get(`${ROOT}/deploy/dist/.staging/nginx/blog.conf`) ?? '';
  assert.match(nginx, /\{\{serverName\}\}/);
  const install = world.files.get(`${ROOT}/deploy/dist/.staging/install.sh`) ?? '';
  assert.match(install, /DEPLOY_ENV_FILE/);

  const manifestText = world.files.get(`${ROOT}/deploy/dist/.staging/MANIFEST.json`) ?? '';
  assert.doesNotMatch(manifestText, new RegExp(TOKEN_SENTINEL));
  const manifest = JSON.parse(manifestText) as ReleaseManifest;
  assert.equal(manifest.target, TARGET);
  assert.equal('serverName' in manifest, false);
  assert.equal('contentRepo' in manifest, false);
  assert.deepEqual(Object.keys(manifest.sha256).sort(), releaseArtifacts().sort());

  const sums = (world.files.get(`${ROOT}/deploy/dist/.staging/SHA256SUMS`) ?? '').trim().split('\n');
  assert.equal(sums.length, releaseArtifacts().length);
  for (const line of sums) assert.match(line, /^[0-9a-f]{64}  \S+$/);

  const tar = world.commands.find((entry) => entry.command === 'tar');
  assert.ok(tar, 'tar step must run');
  assert.match(basename(tar.args[1]!), /^blog-release-x86_64-unknown-linux-musl-\d{8}T\d{6}Z\.tar\.gz$/);
});

test('package dry-run performs no build or file writes', async () => {
  const world = new PackageWorld();
  const { reporter, lines } = captureReporter();
  const code = await runDeployPackage(TARGET, world.ports(reporter), { dryRun: true });
  assert.equal(code, 0);
  assert.equal(world.commands.length, 0);
  assert.match(lines.join('\n'), /发布包将写入/);
});
