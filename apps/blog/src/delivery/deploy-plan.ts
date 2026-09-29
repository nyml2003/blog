/**
 * `ops delivery package|bundle` 的发布包计划。
 *
 * 发布包是环境无关的:只含构建产物与模板(占位符),域名/仓库名由服务器端
 * `install.sh` 读取 `/etc/blog/deploy.env` 后注入。仓库与产物都不含秘密。
 */

export const DEPLOY_TARGETS = [
  'x86_64-unknown-linux-musl',
  'aarch64-unknown-linux-musl',
] as const;
export type DeployTarget = (typeof DEPLOY_TARGETS)[number];

export const RELEASE_BINARIES = ['product', 'data', 'blog-admin-credentials'] as const;
export const RELEASE_UNITS = ['blog-data.service', 'blog-product.service'] as const;
export const RELEASE_NGINX = 'blog.conf';

/** 需要写入 MANIFEST/SHA256SUMS 的包内路径(渲染前的二进制与模板)。 */
export function releaseArtifacts(): string[] {
  return [
    ...RELEASE_BINARIES.map((name) => `bin/${name}`),
    ...RELEASE_UNITS.map((name) => `systemd/${name}`),
    `nginx/${RELEASE_NGINX}`,
  ];
}

export interface ReleaseManifest {
  readonly format: 1;
  readonly target: DeployTarget;
  readonly createdAt: string;
  /** 相对路径 → sha256;安装前由 install.sh 通过 SHA256SUMS 校验。 */
  readonly sha256: Readonly<Record<string, string>>;
}

export interface PackageStep {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

export function releaseArchiveName(target: DeployTarget, stamp: string): string {
  return `blog-release-${target}-${stamp}.tar.gz`;
}

export function packageStagingDir(workspaceRoot: string): string {
  return `${workspaceRoot}/deploy/dist/.staging`;
}

/** 构建前端 → 交叉编译目标架构 → 打包 staging(组装由应用层完成)。 */
export function packageSteps(target: DeployTarget, workspaceRoot: string, archive: string): PackageStep[] {
  const crossScript = [
    'set -e',
    'export PATH="$(dirname "$(rustup which cargo)"):$PATH"',
    `cd '${workspaceRoot}/src'`,
    `cargo zigbuild --release --locked --target ${target}`,
  ].join('; ');
  return [
    {
      label: '构建前端 dist',
      command: 'pnpm',
      args: ['-C', 'src/frontend', 'run', 'build'],
      cwd: workspaceRoot,
    },
    {
      label: `交叉编译 Rust(${target})`,
      command: 'nix',
      args: ['shell', 'nixpkgs#zig', 'nixpkgs#cargo-zigbuild', '-c', 'sh', '-c', crossScript],
      cwd: workspaceRoot,
    },
    {
      label: `打包 ${archive.split('/').pop()}`,
      command: 'tar',
      args: ['-czf', archive, '-C', packageStagingDir(workspaceRoot), '.'],
      cwd: workspaceRoot,
    },
  ];
}

export function parseDeployTarget(value: unknown): DeployTarget {
  if (typeof value !== 'string' || !(DEPLOY_TARGETS as readonly string[]).includes(value)) {
    throw new Error(`target 必须是 ${DEPLOY_TARGETS.join(' | ')}`);
  }
  return value as DeployTarget;
}
