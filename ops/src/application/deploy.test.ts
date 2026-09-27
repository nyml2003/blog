import test from 'node:test';
import assert from 'node:assert/strict';
import { basename } from 'node:path';
import type { FsPort, ProcessPort, ProcessResult, Reporter } from '../domain/ports.ts';
import { parseDeployConfig, type ReleaseManifest } from '../domain/deploy-plan.ts';
import { runDeployPackage, type DeployPorts } from './deploy-package.ts';
import { runDeployApply } from './deploy-run.ts';

const CONFIG = parseDeployConfig(
  JSON.stringify({
    host: 'blog',
    target: 'x86_64-unknown-linux-musl',
    serverName: 'example.com',
    contentRepo: 'owner/repo',
    tokenFile: '/secrets/product.env',
  }),
  '/home/me',
);
const ROOT = '/repo';
const TOKEN_SENTINEL = 'github_pat_SENTINEL_MUST_NOT_APPEAR';
const SHA = {
  'bin/product': 'aa',
  'bin/data': 'bb',
  'bin/blog-admin-credentials': 'cc',
  'systemd/blog-data.service': 'dd',
  'systemd/blog-product.service': 'ee',
  'nginx/blog.conf': 'ff',
};

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

class DeployWorld {
  readonly commands: Array<{ command: string; args: string[] }> = [];
  tokenExists = true;
  probe = '1000\n/home/ubuntu\n';
  archive = '/home/ubuntu/blog-releases/blog-release-x86_64-unknown-linux-musl-20260927T000000Z.tar.gz\n';
  readonly manifest: ReleaseManifest = {
    format: 1,
    target: 'x86_64-unknown-linux-musl',
    serverName: 'example.com',
    contentRepo: 'owner/repo',
    createdAt: '2026-09-27T00:00:00Z',
    sha256: SHA,
  };

  readonly process: ProcessPort = {
    run: async (command, args): Promise<ProcessResult> => {
      this.commands.push({ command, args: [...args] });
      if (command === 'ssh') {
        const script = args.at(-1) ?? '';
        if (script.includes('id -u')) return { code: 0, stdout: this.probe, stderr: '' };
        if (script.includes('ls -1t')) return { code: 0, stdout: this.archive, stderr: '' };
        if (script.includes('cat /tmp/blog-deploy/MANIFEST.json')) {
          return { code: 0, stdout: JSON.stringify(this.manifest), stderr: '' };
        }
        if (script.includes('sha256sum')) {
          const lines = Object.entries(this.manifest.sha256).map(([path, hash]) => `${hash}  ${path}`);
          return { code: 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
        }
      }
      return { code: 0, stdout: '', stderr: '' };
    },
  };

  readonly fs: FsPort = {
    read: async () => '',
    exists: async () => this.tokenExists,
    files: async () => [],
    mkdir: async () => undefined,
  };

  ports(): DeployPorts {
    const { reporter } = captureReporter();
    return { process: this.process, fs: this.fs, reporter, root: ROOT };
  }

  flatten(): string {
    return this.commands.map((entry) => [entry.command, ...entry.args].join(' ')).join('\n');
  }
}

test('deploy dry-run prints the outline without touching the network', async () => {
  const world = new DeployWorld();
  const { reporter, lines } = captureReporter();
  const code = await runDeployApply(CONFIG, { process: world.process, fs: world.fs, reporter, root: ROOT }, { dryRun: true });
  assert.equal(code, 0);
  assert.equal(world.commands.length, 0);
  assert.match(lines.join('\n'), /部署目标 blog/);
  assert.match(lines.join('\n'), /健康检查/);
});

test('deploy apply installs the release, never exposing the token, and health-checks at the end', async () => {
  const world = new DeployWorld();
  const { reporter, lines } = captureReporter();
  const code = await runDeployApply(CONFIG, { process: world.process, fs: world.fs, reporter, root: ROOT }, { dryRun: false });
  assert.equal(code, 0, lines.join('\n'));
  const flattened = world.flatten();
  assert.doesNotMatch(flattened, new RegExp(TOKEN_SENTINEL));
  assert.match(flattened, /install -m 0600 -o root -g root \/tmp\/blog-deploy\/product\.env \/var\/lib\/blog\/product\.env/);
  assert.match(flattened, /systemctl restart blog-data\.service blog-product\.service/);
  assert.match(flattened, /scp .*\/secrets\/product\.env blog:\/tmp\/blog-deploy\/product\.env/);
  assert.match(flattened, /nginx -t/);
  assert.match(flattened, /install -m 0600 .*\/home\/ubuntu\/cert\/example\.com\.key/);
  assert.ok(
    lines.findIndex((line) => line.includes('安装二进制')) < lines.findIndex((line) => line.includes('重启并健康检查')),
  );
  assert.match(lines.join('\n'), /部署完成:blog/);
});

test('deploy apply fails closed on missing token or missing release archive', async () => {
  const noToken = new DeployWorld();
  noToken.tokenExists = false;
  const first = captureReporter();
  assert.equal(
    await runDeployApply(CONFIG, { process: noToken.process, fs: noToken.fs, reporter: first.reporter, root: ROOT }, { dryRun: false }),
    10,
  );
  assert.equal(noToken.commands.length, 0);

  const noArchive = new DeployWorld();
  noArchive.archive = '\n';
  const second = captureReporter();
  assert.equal(
    await runDeployApply(CONFIG, { process: noArchive.process, fs: noArchive.fs, reporter: second.reporter, root: ROOT }, { dryRun: false }),
    20,
  );
  assert.match(second.lines.join('\n'), /未在 ~\/blog-releases 找到发布包/);
});

test('deploy apply rejects a manifest that does not match the configuration', async () => {
  const world = new DeployWorld();
  const tampered: ReleaseManifest = { ...world.manifest, serverName: 'other.example.com' };
  const process: ProcessPort = {
    run: async (command, args): Promise<ProcessResult> => {
      if (command === 'ssh' && (args.at(-1) ?? '').includes('cat /tmp/blog-deploy/MANIFEST.json')) {
        return { code: 0, stdout: JSON.stringify(tampered), stderr: '' };
      }
      return world.process.run(command, args);
    },
  };
  const { reporter, lines } = captureReporter();
  const code = await runDeployApply(CONFIG, { process, fs: world.fs, reporter, root: ROOT }, { dryRun: false });
  assert.equal(code, 20);
  assert.match(lines.join('\n'), /发布包与当前配置不匹配/);
});

class PackageWorld {
  readonly files = new Map<string, string>();
  readonly commands: Array<{ command: string; args: string[] }> = [];

  constructor() {
    this.files.set(`${ROOT}/deploy/systemd/blog-data.service`, '[Service]\nExecStart=/usr/local/bin/data\n');
    this.files.set(`${ROOT}/deploy/systemd/blog-product.service`, '[Service]\nEnvironment=BLOG_CONTENT_REPO={{contentRepo}}\n');
    this.files.set(`${ROOT}/deploy/nginx/blog.conf`, 'server_name {{serverName}};\n');
    this.files.set(`${ROOT}/deploy/install.sh`, '#!/usr/bin/env bash\nSERVER_NAME="{{serverName}}"\n');
    this.files.set(`${ROOT}/src/frontend/dist/index.html`, '<html></html>');
    this.files.set(`${ROOT}/src/frontend/dist/assets/app.js`, 'console.log(1)');
    for (const name of ['product', 'data', 'blog-admin-credentials']) {
      this.files.set(`${ROOT}/src/target/x86_64-unknown-linux-musl/release/${name}`, `binary:${name}`);
    }
  }

  readonly process: ProcessPort = {
    run: async (command, args) => {
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

test('package assembles rendered configs and a manifest without any secret', async () => {
  const world = new PackageWorld();
  const { reporter, lines } = captureReporter();
  const code = await runDeployPackage(CONFIG, world.ports(reporter), { dryRun: false });
  assert.equal(code, 0, lines.join('\n'));
  const product = world.files.get(`${ROOT}/deploy/dist/.staging/systemd/blog-product.service`) ?? '';
  assert.match(product, /BLOG_CONTENT_REPO=owner\/repo/);
  assert.doesNotMatch(product, /\{\{/);
  const nginx = world.files.get(`${ROOT}/deploy/dist/.staging/nginx/blog.conf`) ?? '';
  assert.match(nginx, /server_name example\.com;/);
  const install = world.files.get(`${ROOT}/deploy/dist/.staging/install.sh`) ?? '';
  assert.match(install, /SERVER_NAME="example\.com"/);
  assert.doesNotMatch(install, /\{\{/);
  const sums = (world.files.get(`${ROOT}/deploy/dist/.staging/SHA256SUMS`) ?? '').trim().split('\n');
  assert.equal(sums.length, Object.keys(SHA).length);
  for (const line of sums) assert.match(line, /^[0-9a-f]{64}  \S+$/);
  const manifestText = world.files.get(`${ROOT}/deploy/dist/.staging/MANIFEST.json`) ?? '';
  assert.doesNotMatch(manifestText, new RegExp(TOKEN_SENTINEL));
  const manifest = JSON.parse(manifestText) as ReleaseManifest;
  assert.deepEqual(Object.keys(manifest.sha256).sort(), Object.keys(SHA).sort());
  assert.equal(manifest.contentRepo, 'owner/repo');
  const tar = world.commands.find((entry) => entry.command === 'tar');
  assert.ok(tar, 'tar step must run');
  assert.match(basename(tar.args[1]!), /^blog-release-x86_64-unknown-linux-musl-\d{8}T\d{6}Z\.tar\.gz$/);
});

test('package dry-run performs no build or file writes', async () => {
  const world = new PackageWorld();
  const { reporter, lines } = captureReporter();
  const code = await runDeployPackage(CONFIG, world.ports(reporter), { dryRun: true });
  assert.equal(code, 0);
  assert.equal(world.commands.length, 0);
  assert.match(lines.join('\n'), /发布包将写入/);
});
