import { join } from 'node:path';
import type { CommandContext } from '../../framework/commands.ts';
import { OpsError } from '../../framework/errors.ts';
import type { FileMetadata, FsPort } from '../../framework/ports.ts';

export const ADMIN_PASSWORD_HASH_ENV = 'BLOG_ADMIN_PASSWORD_HASH';
export const ADMIN_TOTP_SECRET_ENV = 'BLOG_ADMIN_TOTP_SECRET';
export const ADMIN_RUNTIME_DIR_ENV = 'BLOG_ADMIN_RUNTIME_DIR';
export const TRUSTED_PROXY_IPS_ENV = 'BLOG_TRUSTED_PROXY_IPS';

const CREDENTIALS_FILE = 'credentials.env';
const CREDENTIALS_LIMIT = 8 * 1024;
const HELPER_BINARY = 'blog-admin-credentials';

type CredentialOperation = 'init' | 'recovery-regenerate';

export function adminStateDirectory(environment: NodeJS.ProcessEnv): string | undefined {
  const xdg = environment.XDG_STATE_HOME?.trim();
  if (xdg) return join(xdg, 'blog', 'admin-auth');
  const home = environment.HOME?.trim();
  return home ? join(home, '.local', 'state', 'blog', 'admin-auth') : undefined;
}

export async function runAdminCredentialCommand(
  context: CommandContext,
  operation: CredentialOperation,
): Promise<number> {
  const stateDirectory = adminStateDirectory(context.environment);
  context.reporter.section(
    operation === 'init' ? 'admin credentials init' : 'admin recovery regenerate',
  );
  if (!stateDirectory) {
    context.reporter.fail('无法确定管理凭证目录：HOME 与 XDG_STATE_HOME 均未设置');
    return 20;
  }
  if (context.dryRun) {
    context.reporter.info(`将通过 TTY 交互运行 ${HELPER_BINARY} ${operation}`);
    context.reporter.info(`状态目录: ${stateDirectory}`);
    return 0;
  }

  let binary = await resolveHelper(context.fs, context.workspace.root);
  if (!binary) {
    const build = await context.process.run(
      'cargo',
      ['build', '-p', 'product', '--bin', HELPER_BINARY],
      join(context.workspace.root, 'src'),
    );
    if (build.code !== 0) {
      context.reporter.fail('构建管理凭证 helper 失败');
      context.reporter.info(build.stderr || build.stdout);
      return 20;
    }
    binary = await resolveHelper(context.fs, context.workspace.root);
  }
  if (!binary || !context.process.runInteractive) {
    context.reporter.fail('管理凭证 helper 或交互式进程端口不可用');
    return 20;
  }

  const code = await context.process.runInteractive(
    binary,
    [operation, '--state-dir', stateDirectory],
    context.workspace.root,
  );
  if (code !== 0) {
    context.reporter.fail(`管理凭证操作失败（exit ${code}）`);
    return 20;
  }
  context.reporter.ok(operation === 'init' ? '管理凭证已初始化' : '恢复码已重新生成');
  return 0;
}

export async function loadAdminCredentialEnvironment(
  fs: FsPort,
  environment: NodeJS.ProcessEnv,
): Promise<Readonly<Record<string, string>>> {
  const stateDirectory = adminStateDirectory(environment);
  if (!stateDirectory) return {};
  const credentialsPath = join(stateDirectory, CREDENTIALS_FILE);
  if (!await fs.exists(credentialsPath)) return {};
  if (!fs.inspect || !fs.readSecure || !fs.effectiveUid) {
    throw credentialError('文件系统端口不支持安全凭证读取');
  }
  const expectedUid = fs.effectiveUid();
  if (expectedUid === undefined) {
    throw credentialError('当前平台不能验证管理凭证所有者');
  }
  let directory: FileMetadata;
  let secureFile: Awaited<ReturnType<NonNullable<FsPort['readSecure']>>>;
  try {
    directory = await fs.inspect(stateDirectory);
    secureFile = await fs.readSecure(credentialsPath, CREDENTIALS_LIMIT);
  } catch {
    throw credentialError('管理凭证文件无法安全读取');
  }
  requireSecureMetadata(directory, 'directory', 0o700, expectedUid);
  requireSecureMetadata(secureFile.metadata, 'file', 0o600, expectedUid);
  const values = parseCredentialFile(secureFile.content);
  if (values[ADMIN_RUNTIME_DIR_ENV] !== stateDirectory) {
    throw credentialError('管理凭证运行目录与受检目录不一致');
  }
  return values;
}

async function resolveHelper(fs: FsPort, root: string): Promise<string | undefined> {
  for (const profile of ['debug', 'release']) {
    const candidate = join(root, 'src', 'target', profile, HELPER_BINARY);
    if (await fs.exists(candidate)) return candidate;
  }
  return undefined;
}

function requireSecureMetadata(
  metadata: FileMetadata,
  kind: FileMetadata['kind'],
  mode: number,
  uid: number,
): void {
  if (metadata.kind !== kind || metadata.mode !== mode || metadata.uid !== uid) {
    throw credentialError('管理凭证目录或文件的所有者/权限不安全');
  }
}

function parseCredentialFile(content: string): Record<string, string> {
  if (Buffer.byteLength(content, 'utf8') > CREDENTIALS_LIMIT) {
    throw credentialError('管理凭证文件超过 8 KiB');
  }
  const allowed = new Set([
    ADMIN_PASSWORD_HASH_ENV,
    ADMIN_TOTP_SECRET_ENV,
    ADMIN_RUNTIME_DIR_ENV,
  ]);
  const values: Record<string, string> = {};
  for (const line of content.split('\n')) {
    if (line === '') continue;
    const separator = line.indexOf('=');
    if (separator <= 0) throw credentialError('管理凭证文件格式无效');
    const name = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!allowed.has(name) || Object.hasOwn(values, name) || value.length === 0) {
      throw credentialError('管理凭证文件格式无效');
    }
    values[name] = value;
  }
  for (const name of allowed) {
    if (!Object.hasOwn(values, name)) throw credentialError('管理凭证文件缺少字段');
  }
  return values;
}

function credentialError(message: string): OpsError {
  return new OpsError(
    'SERVICE_START_FAILED',
    `Product 管理鉴权配置失败: ${message}`,
    [{ service: 'product', configuration: 'admin-auth' }],
  );
}
