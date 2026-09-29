import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEPLOY_TARGETS,
  packageSteps,
  parseDeployTarget,
  releaseArchiveName,
  releaseArtifacts,
} from '../../src/delivery/deploy-plan.ts';

test('target parsing only accepts the musl release targets', () => {
  for (const target of DEPLOY_TARGETS) assert.equal(parseDeployTarget(target), target);
  assert.throws(() => parseDeployTarget('wasm32-unknown-unknown'), /target 必须是/);
  assert.throws(() => parseDeployTarget(undefined), /target 必须是/);
});

test('package plan builds for the chosen target and archives under deploy/dist', () => {
  const steps = packageSteps('aarch64-unknown-linux-musl', '/repo', '/repo/deploy/dist/blog-release-a.tar.gz');
  assert.equal(steps.length, 3);
  assert.match(steps[1]!.args.at(-1)!, /cargo zigbuild --release --locked --target aarch64-unknown-linux-musl/);
  assert.equal(steps[2]!.command, 'tar');
  assert.match(steps[2]!.args.join(' '), /deploy\/dist\/blog-release-a\.tar\.gz/);
  assert.equal(
    releaseArchiveName('x86_64-unknown-linux-musl', '20260927T120000Z'),
    'blog-release-x86_64-unknown-linux-musl-20260927T120000Z.tar.gz',
  );
});

test('release artifacts cover binaries, units and the nginx template', () => {
  assert.deepEqual(releaseArtifacts(), [
    'bin/product',
    'bin/data',
    'bin/blog-admin-credentials',
    'systemd/blog-data.service',
    'systemd/blog-product.service',
    'nginx/blog.conf',
  ]);
});
