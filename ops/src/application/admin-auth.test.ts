import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_PASSWORD_HASH_ENV,
  ADMIN_RUNTIME_DIR_ENV,
  ADMIN_TOTP_SECRET_ENV,
  adminStateDirectory,
  loadAdminCredentialEnvironment,
  runAdminCredentialCommand,
} from './admin-auth.ts';
import type { CommandContext } from '../domain/commands.ts';
import type { FileMetadata, FsPort } from '../domain/ports.ts';

const stateDirectory = '/state/blog/admin-auth';
const credentials = `${ADMIN_PASSWORD_HASH_ENV}=$argon2id$v=19$m=65536,t=3,p=1$c2FsdA$hash\n${ADMIN_TOTP_SECRET_ENV}=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n${ADMIN_RUNTIME_DIR_ENV}=${stateDirectory}\n`;

function secureFs(overrides: {
  directory?: FileMetadata;
  file?: FileMetadata;
  content?: string;
  exists?: boolean;
} = {}): FsPort {
  const directory = overrides.directory ?? { kind: 'directory', mode: 0o700, uid: 1000 };
  const file = overrides.file ?? { kind: 'file', mode: 0o600, uid: 1000 };
  return {
    read: async () => '',
    exists: async () => overrides.exists ?? true,
    files: async () => [],
    mkdir: async () => undefined,
    inspect: async () => directory,
    readSecure: async () => ({ content: overrides.content ?? credentials, metadata: file }),
    effectiveUid: () => 1000,
  };
}

test('admin state path follows XDG then HOME without reading BLOG credential variables', () => {
  assert.equal(
    adminStateDirectory({ XDG_STATE_HOME: '/state', HOME: '/home/user' }),
    stateDirectory,
  );
  assert.equal(
    adminStateDirectory({ HOME: '/home/user' }),
    '/home/user/.local/state/blog/admin-auth',
  );
  assert.equal(adminStateDirectory({ BLOG_ADMIN_RUNTIME_DIR: '/attacker' }), undefined);
});

test('missing credentials preserve Product fail-closed startup while valid credentials inject exactly three values', async () => {
  assert.deepEqual(
    await loadAdminCredentialEnvironment(secureFs({ exists: false }), { XDG_STATE_HOME: '/state' }),
    {},
  );
  const loaded = await loadAdminCredentialEnvironment(secureFs(), { XDG_STATE_HOME: '/state' });
  assert.deepEqual(Object.keys(loaded).sort(), [
    ADMIN_PASSWORD_HASH_ENV,
    ADMIN_RUNTIME_DIR_ENV,
    ADMIN_TOTP_SECRET_ENV,
  ].sort());
  assert.equal(loaded[ADMIN_RUNTIME_DIR_ENV], stateDirectory);
});

test('credential loader rejects symlinks, wrong mode, wrong owner and malformed files without exposing values', async () => {
  const cases = [
    secureFs({ directory: { kind: 'symlink', mode: 0o700, uid: 1000 } }),
    secureFs({ file: { kind: 'file', mode: 0o644, uid: 1000 } }),
    secureFs({ file: { kind: 'file', mode: 0o600, uid: 2000 } }),
    secureFs({ content: `${ADMIN_PASSWORD_HASH_ENV}=top-secret\n` }),
  ];
  for (const fs of cases) {
    await assert.rejects(
      loadAdminCredentialEnvironment(fs, { XDG_STATE_HOME: '/state' }),
      (error: unknown) => {
        assert.doesNotMatch(String(error), /top-secret|argon2id|AAAAAAAA/);
        return true;
      },
    );
  }
});

test('credential helper uses inherited TTY and never places a password in argv', async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const fs = secureFs();
  fs.exists = async (path) => path.endsWith('/src/target/debug/blog-admin-credentials');
  const context = {
    workspace: { root: '/repo', web: '/repo/src/frontend', ops: '/repo/ops' },
    fs,
    process: {
      run: async () => ({ code: 0, stdout: '', stderr: '' }),
      runInteractive: async (command: string, args: string[]) => {
        calls.push({ command, args });
        return 0;
      },
    },
    reporter: { section() {}, ok() {}, fail() {}, info() {} },
    environment: { XDG_STATE_HOME: '/state' },
    dryRun: false,
    json: false,
  } as unknown as CommandContext;

  assert.equal(await runAdminCredentialCommand(context, 'init'), 0);
  assert.deepEqual(calls, [{
    command: '/repo/src/target/debug/blog-admin-credentials',
    args: ['init', '--state-dir', stateDirectory],
  }]);
  assert.doesNotMatch(calls[0]!.args.join(' '), /password|totp|recovery-code/i);
});
