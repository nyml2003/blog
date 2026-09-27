/**
 * `ops delivery package|deploy|bundle` 的配置、约定与步骤计划。
 *
 * 隐私边界:仓库里只有模板与占位符;域名、内容仓库名、主机名、token、证书都来自
 * 仓库外的配置/文件。发布包(archive)不含任何秘密,可以安全落在服务器磁盘上。
 */

export const DEPLOY_TARGETS = [
  'x86_64-unknown-linux-musl',
  'aarch64-unknown-linux-musl',
] as const;
export type DeployTarget = (typeof DEPLOY_TARGETS)[number];

export interface DeployConfig {
  /** SSH 目标:可以是 `~/.ssh/config` 别名,或 user@host。 */
  readonly host: string;
  /** 显式 SSH 端口;省略时交给 ssh 配置决定。 */
  readonly port?: number;
  readonly target: DeployTarget;
  readonly serverName: string;
  readonly contentRepo: string;
  /** 本机 token 文件(0600),内容 `BLOG_CONTENT_TOKEN=...`;默认 ~/.local/state/blog/product.env。 */
  readonly tokenFile: string;
  /** 服务器上手动放发布包的目录,相对远端 $HOME;默认 blog-releases。 */
  readonly archiveRemoteDir: string;
  /** 服务器上证书目录,相对远端 $HOME;默认 cert。 */
  readonly certSourceDir: string;
}

export interface DeployStep {
  readonly label: string;
  readonly kind: 'local' | 'remote' | 'upload';
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
}

export const REMOTE_PATHS = {
  staging: '/tmp/blog-deploy',
  binDir: '/usr/local/bin',
  dataDir: '/var/lib/blog',
  webDir: '/var/lib/blog/web/dist',
  tokenTarget: '/var/lib/blog/product.env',
  unitDir: '/etc/systemd/system',
  nginxAvailable: '/etc/nginx/sites-available/blog.conf',
  nginxEnabled: '/etc/nginx/sites-enabled/blog.conf',
  certDir: '/etc/nginx/cert',
} as const;

export const RELEASE_BINARIES = ['product', 'data', 'blog-admin-credentials'] as const;

export interface ReleaseManifest {
  readonly format: 1;
  readonly target: DeployTarget;
  readonly serverName: string;
  readonly contentRepo: string;
  readonly createdAt: string;
  /** 相对路径 → sha256;用于安装前校验二进制与配置。 */
  readonly sha256: Readonly<Record<string, string>>;
}

function requireText(value: unknown, field: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`deploy config: ${field} 非法`);
  }
  return value;
}

function optionalText(value: unknown, field: string, pattern: RegExp): string | undefined {
  if (value === undefined) return undefined;
  return requireText(value, field, pattern);
}

export function defaultTokenFile(home: string | undefined): string {
  return `${home ?? '~'}/.local/state/blog/product.env`;
}

function parseTarget(value: unknown): DeployTarget {
  if (typeof value !== 'string' || !(DEPLOY_TARGETS as readonly string[]).includes(value)) {
    throw new Error(`deploy config: target 必须是 ${DEPLOY_TARGETS.join(' | ')}`);
  }
  return value as DeployTarget;
}

export function parseDeployConfig(text: string, home?: string): DeployConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('deploy config: 不是合法 JSON');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('deploy config: 顶层必须是对象');
  }
  const value = raw as Record<string, unknown>;
  const allowed = new Set([
    'host',
    'port',
    'target',
    'serverName',
    'contentRepo',
    'tokenFile',
    'archiveRemoteDir',
    'certSourceDir',
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`deploy config: 未知字段 ${key}`);
  }
  const port = value.port;
  if (port !== undefined && (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error('deploy config: port 必须是 1-65535 的整数');
  }
  const tokenFile = optionalText(value.tokenFile, 'tokenFile', /^\/[^\n]+$/);
  return {
    host: requireText(value.host, 'host', /^[^\s]+$/),
    port,
    target: parseTarget(value.target),
    serverName: requireText(value.serverName, 'serverName', /^[a-z0-9][a-z0-9.-]*$/i),
    contentRepo: requireText(value.contentRepo, 'contentRepo', /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/),
    tokenFile: tokenFile ?? defaultTokenFile(home),
    archiveRemoteDir:
      optionalText(value.archiveRemoteDir, 'archiveRemoteDir', /^[A-Za-z0-9._-]+$/) ?? 'blog-releases',
    certSourceDir:
      optionalText(value.certSourceDir, 'certSourceDir', /^[A-Za-z0-9._-]+$/) ?? 'cert',
  };
}

export function releaseArchiveName(config: DeployConfig, stamp: string): string {
  return `blog-release-${config.target}-${stamp}.tar.gz`;
}

export function renderTemplate(text: string, values: Readonly<Record<string, string>>): string {
  const placeholders = new Set([...text.matchAll(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g)].map((match) => match[1]!));
  for (const key of placeholders) {
    if (!(key in values)) throw new Error(`template: 缺少占位符取值 ${key}`);
  }
  let output = text;
  for (const [key, value] of Object.entries(values)) output = output.replaceAll(`{{${key}}}`, value);
  if (/\{\{[a-zA-Z]/.test(output)) throw new Error('template: 存在未解析占位符');
  return output;
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function privileged(uid: number, script: string): string {
  return uid === 0 ? script : `sudo -n sh -c ${shellQuote(script)}`;
}

export function sshStep(host: string, port: number | undefined, label: string, script: string): DeployStep {
  return {
    label,
    kind: 'remote',
    command: 'ssh',
    args: sshArgs(host, port, script),
  };
}

export function scpStep(
  host: string,
  port: number | undefined,
  label: string,
  sources: readonly string[],
  target: string,
): DeployStep {
  const args = ['-o', 'BatchMode=yes', '-p'];
  if (port !== undefined) args.push('-P', String(port));
  args.push(...sources, `${host}:${target}`);
  return { label, kind: 'upload', command: 'scp', args };
}

function sshArgs(host: string, port: number | undefined, script: string): string[] {
  const args = ['-o', 'BatchMode=yes'];
  if (port !== undefined) args.push('-p', String(port));
  args.push(host, script);
  return args;
}

/** 打包步骤:构建前端 → 交叉编译 → tar(staging 组装由应用层完成)。 */
export function packageSteps(config: DeployConfig, workspaceRoot: string, archive: string): DeployStep[] {
  const crossScript = [
    'set -e',
    'export PATH="$(dirname "$(rustup which cargo)"):$PATH"',
    `cd ${shellQuote(`${workspaceRoot}/src`)}`,
    `cargo zigbuild --release --locked --target ${config.target}`,
  ].join('; ');
  return [
    {
      label: '构建前端 dist',
      kind: 'local',
      command: 'pnpm',
      args: ['-C', 'src/frontend', 'run', 'build'],
      cwd: workspaceRoot,
    },
    {
      label: `交叉编译 Rust(${config.target})`,
      kind: 'local',
      command: 'nix',
      args: ['shell', 'nixpkgs#zig', 'nixpkgs#cargo-zigbuild', '-c', 'sh', '-c', crossScript],
      cwd: workspaceRoot,
    },
    {
      label: `打包 ${archive.split('/').pop()}`,
      kind: 'local',
      command: 'tar',
      args: ['-czf', archive, '-C', `${workspaceRoot}/deploy/dist/.staging`, '.'],
      cwd: workspaceRoot,
    },
  ];
}

/** 部署流程的稳定大纲,用于 plan 展示;真实脚本在探测远端后生成。 */
export function deployOutline(config: DeployConfig): readonly string[] {
  return [
    `连接 ${config.host} 并探测权限/家目录/最新发布包`,
    '服务器准备:安装 nginx(缺失时)、创建 blog 用户与目录',
    `解包并校验 MANIFEST(target=${config.target})`,
    '安装二进制到 /usr/local/bin、dist 到 /var/lib/blog/web/dist',
    '安装 systemd unit 并 daemon-reload/enable',
    '安装 nginx 配置(禁用默认站点)',
    `安装证书 ${config.certSourceDir}/${config.serverName}.pem|.key → /etc/nginx/cert`,
    '上传并安装 token → /var/lib/blog/product.env(0600)',
    'nginx -t + reload,重启 blog-data/blog-product,健康检查',
    '保留最近 3 份发布包,清理 staging',
  ];
}
