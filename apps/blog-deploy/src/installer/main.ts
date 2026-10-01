#!/usr/bin/env node
/**
 * 博客服务器安装器(单文件 mjs,公开 Release,无需下载 token)。
 *
 *   node blog-deploy.mjs init [--config /etc/blog/blog.json] [--force]
 *   node blog-deploy.mjs deploy|redeploy [--config …] [--dry-run]
 *
 * 秘密只存在于 blog.json 与其派生的 /var/lib/blog/product.env;命令参数只有路径。
 */
import { spawnSync } from 'node:child_process';
import packageInfo from '../../package.json' with { type: 'json' };
import { access, chmod, copyFile, mkdir, readFile, rename, rm, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { apexAlias, configTemplate, parseBlogConfig, seedFromLegacy, type BlogConfig } from './config.ts';
import { EXIT_FAILURE, EXIT_LOCKED, EXIT_OK, EXIT_USAGE, type OpsErrorCode } from '@fluvient-cli/cli-kit/errors.ts';
import type { HttpKernel } from '@fluvient/core/http';
import {
  BIN_DIR,
  CONFIG_DIR,
  CONFIG_FILE,
  CONFIG_DIR_MODE,
  CONFIG_FILE_MODE,
  DATA_DIR,
  HEALTH_URL,
  NGINX_AVAILABLE,
  NGINX_CERT_DIR,
  NGINX_ENABLED,
  PRODUCT_ENV,
  RELEASE_REPO,
  UNIT_DIR,
  WEB_DIR,
} from './paths.ts';
import { renderTemplate } from './render.ts';
import { createReporter, type Reporter } from './reporter.ts';
import {
  downloadAsset,
  fetchReleases,
  pickAsset,
  pickBuildRelease,
  targetForArch,
  isHttpFailure,
  TransportFailure,
  type ReleaseAsset,
  verifyChecksums,
  verifyAssetChecksum,
  pickChecksumAsset,
  pickScriptAsset,
  pickScriptRelease,
} from './release.ts';
import { createDefaultProbes, runPreflight, type PreflightProbes } from './preflight.ts';
import { RELEASE_BINARIES, RELEASE_NGINX, RELEASE_UNITS } from '../deploy-plan.ts';

declare const __BLOG_DEPLOY_RELEASE_VERSION__: string | undefined;

export interface InstallerOptions {
  readonly configFile?: string;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly packageFile?: string;
}

export interface InstallerDeps {
  readonly kernel: HttpKernel;
  readonly reporter: Reporter;
  readonly probes?: PreflightProbes;
}

export interface InstallerOutcome {
  readonly exitCode: number;
  readonly code?: OpsErrorCode;
  readonly retryable?: boolean;
  readonly message?: string;
}

/** The package version is the single source of truth for script-v* releases. */
export const INSTALLER_VERSION =
  typeof __BLOG_DEPLOY_RELEASE_VERSION__ === 'string' ? __BLOG_DEPLOY_RELEASE_VERSION__ : packageInfo.version;
class RunError extends Error {}

const GITHUB_API_HOST = 'api.github.com';
const TARBALL_TOTAL_MS = 600_000;
const SCRIPT_TOTAL_MS = 120_000;

function configPath(options: InstallerOptions): string {
  return options.configFile ?? CONFIG_FILE;
}

function run(command: string, args: readonly string[]): void {
  const result = spawnSync(command, [...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim().split('\n').slice(-6).join('\n');
    throw new RunError(`执行失败:${command} ${args.join(' ')}${detail ? `\n${detail}` : ''}`);
  }
}

function isRoot(required: boolean): boolean {
  if (!required) return true;
  if (process.env.BLOG_DEPLOY_ALLOW_NON_ROOT === '1') return true;
  return typeof process.getuid !== 'function' || process.getuid() === 0;
}

function networkConfigSummary(): string {
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  return [
    `代理:${proxy === undefined ? '未配置(使用环境默认)' : proxy}`,
    '证书:系统默认校验',
    '超时:API 响应头 15s/总 30s;下载响应头 30s/读体空闲 60s',
    '重试:最多 3 次,退避 1-8s(仅瞬断/超时/429/5xx)',
  ].join(';');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

export async function runInit(options: InstallerOptions, deps: InstallerDeps): Promise<InstallerOutcome> {
  const reporter = deps.reporter;
  const configFile = configPath(options);
  const directory = dirname(configFile);
  await mkdir(directory, { recursive: true, mode: CONFIG_DIR_MODE });
  await chmod(directory, CONFIG_DIR_MODE).catch(() => undefined);
  if (await exists(configFile)) {
    if (!options.force) {
      reporter.fail(`blog.json 已存在:${configFile}(要重写请加 --force)`);
      return { exitCode: EXIT_USAGE, code: 'USAGE' };
    }
  }
  const legacy = await legacySeed(configFile);
  await writeFile(configFile, configTemplate(legacy.seed), { mode: CONFIG_FILE_MODE });
  await chmod(configFile, CONFIG_FILE_MODE);
  reporter.stage('install_step', `已生成 ${configFile}(0600)`);
  if (legacy.found.length > 0) reporter.stage('install_step', `已从旧文件预填:${legacy.found.join('、')}`);
  reporter.stage('install_step', '待办:');
  reporter.stage('install_step', `  1. 填写 serverName / contentRepo / contentToken(buildTag 固定为 latest)`);
  const serverName = legacy.seed.serverName ?? '<serverName>';
  reporter.stage('install_step', `  2. 放证书:${directory}/${serverName}.pem 与 ${directory}/${serverName}.key(0600)`);
  reporter.stage('install_step', `  3. 执行:node ${process.argv[1]} deploy`);
  return { exitCode: EXIT_OK };
}

async function legacySeed(configFile: string): Promise<{ seed: Partial<BlogConfig>; found: string[] }> {
  const found: string[] = [];
  const deployEnv = configFile === CONFIG_FILE ? await readOptional(join(CONFIG_DIR, 'deploy.env')) : undefined;
  const productEnv =
    (await readOptional(PRODUCT_ENV)) ?? (await readOptional(join(CONFIG_DIR, '..', '..', 'root', 'product.env')));
  if (deployEnv) found.push('deploy.env');
  if (productEnv) found.push('product.env');
  return { seed: seedFromLegacy({ deployEnv, productEnv }), found };
}

function targetNow(): string {
  return targetForArch(process.arch);
}

export async function runDeploy(options: InstallerOptions, deps: InstallerDeps): Promise<InstallerOutcome> {
  const reporter = deps.reporter;
  const configFile = configPath(options);
  const directory = dirname(configFile);
  if (!isRoot(!options.dryRun)) {
    reporter.fail('请以 root 运行(例如 sudo node blog-deploy.mjs deploy)');
    return { exitCode: EXIT_USAGE, code: 'USAGE' };
  }
  let config: BlogConfig;
  try {
    config = parseBlogConfig(await readFile(configFile, 'utf8'));
  } catch (error) {
    reporter.fail(`配置不可用:${error instanceof Error ? error.message : String(error)}`);
    reporter.stage('install_step', `请先执行:node ${process.argv[1]} init(或检查 ${configFile})`, { severity: 'hint' });
    return { exitCode: EXIT_USAGE, code: 'CONFIG_INVALID' };
  }
  const target = targetNow();
  const certPem = join(directory, `${config.serverName}.pem`);
  const certKey = join(directory, `${config.serverName}.key`);
  if (!(await exists(certPem)) || !(await exists(certKey))) {
    reporter.fail(`缺少证书:${certPem} / ${certKey}`);
    return { exitCode: EXIT_USAGE, code: 'CONFIG_INVALID' };
  }

  let onlineAsset: ReleaseAsset | undefined;
  if (options.packageFile !== undefined) {
    if (!(await exists(options.packageFile))) {
      reporter.fail(`本地发布包不存在:${options.packageFile}`);
      return { exitCode: EXIT_USAGE, code: 'CONFIG_INVALID' };
    }
    reporter.stage('release_resolved', `本地发布包 ${basename(options.packageFile)}(离线模式,跳过网络预检与下载)`, {
      asset: basename(options.packageFile),
      offline: true,
    });
    if (options.dryRun) {
      reporter.stage('dry_run_report', 'dry-run:已确认本地包存在,未解包、未安装、未重启');
      return { exitCode: EXIT_OK };
    }
  } else {

  reporter.stage('network_preflight_started', `网络预检(${options.dryRun ? 'dry-run' : 'deploy'}):当前安装器 script-v${INSTALLER_VERSION},架构 ${target}`, {
    command: 'deploy',
    dryRun: options.dryRun,
    installerVersion: INSTALLER_VERSION,
    arch: target,
  });
  const preflight = await runPreflight(
    {
      apiHost: GITHUB_API_HOST,
      apiPort: 443,
      resolveApi: async () => {
        const release = pickBuildRelease(await fetchReleases(RELEASE_REPO, deps.kernel));
        return { release, asset: pickAsset(release, target) };
      },
      assetsOf: ({ asset }) => [{ label: `发布包 ${asset.name}`, url: asset.url }],
    },
    deps.probes ?? createDefaultProbes(deps.kernel),
    reporter,
  );
  if (!preflight.ok || preflight.resolved === undefined) {
    reporter.fail(`网络预检未通过,已阻止下载与安装。建议:${preflight.suggestion ?? '检查网络后重试'}`);
    return { exitCode: EXIT_FAILURE, code: 'PREFLIGHT_FAILED', retryable: true, message: '网络预检未通过' };
  }
  const { release, asset } = preflight.resolved;
  onlineAsset = asset;
  const assetProbe = preflight.assetResults.find((probe) => probe.url === asset.url);
  reporter.stage('release_resolved', `目标 Release ${release.tag},资产 ${asset.name}${assetProbe?.contentLength === undefined ? '(大小未知)' : `(${assetProbe.contentLength} 字节)`}`, {
    tag: release.tag,
    asset: asset.name,
    size: assetProbe?.contentLength,
    url: asset.url,
  });
  reporter.stage('network_preflight_completed', `预检通过。${networkConfigSummary()}`, { ok: true });
  if (options.dryRun) {
    reporter.stage('dry_run_report', 'dry-run:已完成 Release 解析与网络预检,未下载、未安装、未重启');
    return { exitCode: EXIT_OK };
  }
  }

  const workDir = `/tmp/blog-deploy-${process.pid}`;
  try {
    await rm(workDir, { recursive: true, force: true });
    await mkdir(workDir, { recursive: true, mode: 0o700 });
    const tarball = options.packageFile ?? join(workDir, onlineAsset?.name ?? 'release.tar.gz');
    if (options.packageFile === undefined && onlineAsset !== undefined) try {
      await downloadAsset(onlineAsset, tarball, { kernel: deps.kernel, reporter, totalMs: TARBALL_TOTAL_MS });
    } catch (error) {
      if (error instanceof TransportFailure) {
        const retryable = isHttpFailure(error.failure) && error.failure.retryable;
        const status = isHttpFailure(error.failure) ? error.failure.status : undefined;
        const detail = isHttpFailure(error.failure) ? error.failure.message : '已取消';
        reporter.fail(`下载失败:${error.failure.kind}${status === undefined ? '' : ` ${status}`}:${detail}${retryable ? '(可稍后重试)' : '(不建议直接重试)'}`);
        return { exitCode: EXIT_FAILURE, code: 'DOWNLOAD_FAILED', retryable, message: '资产下载失败' };
      }
      throw error;
    }
    run('tar', ['-xzf', tarball, '-C', workDir]);
    reporter.stage('checksum_started', '校验发布包(SHA256SUMS)');
    try {
      await verifyChecksums(workDir, join(workDir, 'SHA256SUMS'));
    } catch (error) {
      reporter.fail(`校验失败:${error instanceof Error ? error.message : String(error)};已阻止安装,服务器保持原状`);
      return { exitCode: EXIT_FAILURE, code: 'CHECKSUM_MISMATCH', retryable: false, message: '发布包校验失败' };
    }
    reporter.stage('checksum_completed', '发布包校验通过');
    reporter.stage('install_started', '开始安装二进制、unit 与 nginx 配置');

    const values = { serverName: config.serverName, contentRepo: config.contentRepo, apexName: apexAlias(config.serverName) };
    const renderedDir = join(workDir, 'rendered');
    await mkdir(join(renderedDir, 'systemd'), { recursive: true, mode: 0o700 });
    await mkdir(join(renderedDir, 'nginx'), { recursive: true, mode: 0o700 });
    for (const unit of RELEASE_UNITS) {
      const source = await readFile(join(workDir, 'systemd', unit), 'utf8');
      await writeFile(join(renderedDir, 'systemd', unit), renderTemplate(source, values), { mode: 0o644 });
    }
    const nginxSource = await readFile(join(workDir, 'nginx', RELEASE_NGINX), 'utf8');
    await writeFile(join(renderedDir, 'nginx', RELEASE_NGINX), renderTemplate(nginxSource, values), { mode: 0o644 });
    reporter.stage('install_step', '✓ 模板渲染完成');

    if (spawnSync('sh', ['-c', 'command -v nginx'], { encoding: 'utf8' }).status !== 0) {
      reporter.stage('install_step', '安装 nginx');
      run('sh', ['-c', 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx']);
    }
    run('sh', [
      '-c',
      'id -u blog >/dev/null 2>&1 || useradd --system --home-dir /var/lib/blog --shell /usr/sbin/nologin blog',
    ]);
    run('install', ['-d', '-o', 'blog', '-g', 'blog', DATA_DIR, `${DATA_DIR}/web`]);
    for (const name of RELEASE_BINARIES) {
      run('install', ['-m', '0755', join(workDir, 'bin', name), join(BIN_DIR, name)]);
    }
    await rm(WEB_DIR, { recursive: true, force: true });
    run('cp', ['-a', join(workDir, 'web', 'dist'), WEB_DIR]);
    run('chown', ['-R', 'blog:blog', `${DATA_DIR}/web`]);
    for (const unit of RELEASE_UNITS) {
      run('install', ['-m', '0644', join(renderedDir, 'systemd', unit), join(UNIT_DIR, unit)]);
    }
    run('systemctl', ['daemon-reload']);
    run('systemctl', ['enable', 'blog-data.service', 'blog-product.service']);
    reporter.stage('install_step', '✓ 二进制与 systemd unit 安装完成');

    run('install', ['-m', '0644', join(renderedDir, 'nginx', RELEASE_NGINX), NGINX_AVAILABLE]);
    run('ln', ['-sfn', NGINX_AVAILABLE, NGINX_ENABLED]);
    await rm('/etc/nginx/sites-enabled/default', { force: true });
    await mkdir(NGINX_CERT_DIR, { recursive: true, mode: 0o755 });
    run('install', ['-m', '0644', certPem, join(NGINX_CERT_DIR, `${config.serverName}.pem`)]);
    run('install', ['-m', '0600', certKey, join(NGINX_CERT_DIR, `${config.serverName}.key`)]);
    reporter.stage('install_step', '✓ nginx 配置与证书安装完成');

    await writeFile(PRODUCT_ENV, `BLOG_CONTENT_TOKEN=${config.contentToken}\n`, { mode: 0o600 });
    await chmod(PRODUCT_ENV, 0o600);
    reporter.stage('install_step', '✓ 内容 token 已派生到 /var/lib/blog/product.env(0600)');

    run('nginx', ['-t']);
    run('systemctl', ['enable', '--now', 'nginx']);
    run('sh', ['-c', 'systemctl reload nginx || systemctl restart nginx']);
    run('systemctl', ['restart', 'blog-data.service', 'blog-product.service']);
    reporter.stage('install_step', '✓ 服务已重启,等待健康检查');

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const healthy = await deps.kernel
        .request({ url: HEALTH_URL, timeouts: { headersMs: 2_000, totalMs: 3_000 } })
        .then((response) => response.ok && response.value.status === 200)
        .catch(() => false);
      if (healthy) {
        try {
          run('systemctl', ['is-active', '--quiet', 'blog-data.service', 'blog-product.service']);
          reporter.stage('healthcheck_completed', '健康检查通过');
          reporter.stage('deployment_completed', `部署完成:https://${config.serverName}`);
          return { exitCode: EXIT_OK };
        } catch {
          /* 服务仍在拉起,继续等待 */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    reporter.fail('健康检查超时;排查:journalctl -u blog-product -n 100 --no-pager');
    return { exitCode: EXIT_FAILURE, code: 'SERVICE_START_FAILED', message: '健康检查超时' };
  } catch (error) {
    reporter.fail(`部署失败:${error instanceof Error ? error.message : String(error)}`);
    reporter.stage('install_step', '旧文件与配置未被修改,可修复后重试');
    return { exitCode: EXIT_FAILURE, code: 'EXTERNAL_COMMAND_FAILED', message: '部署执行失败' };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function installerPath(): Promise<string> {
  return process.env.BLOG_DEPLOY_INSTALLER_PATH ?? process.argv[1] ?? '/etc/blog/blog-deploy.mjs';
}

interface SelfUpdateResolved {
  readonly tag: string;
  readonly script: { readonly name: string; readonly url: string };
  readonly checksum: { readonly name: string; readonly url: string };
  readonly isLatest: boolean;
}

export async function runSelfUpdate(options: InstallerOptions, deps: InstallerDeps): Promise<InstallerOutcome> {
  const reporter = deps.reporter;
  const target = await installerPath();
  if (!isRoot(!options.dryRun)) {
    reporter.fail('请以 root 运行 self-update');
    return { exitCode: EXIT_USAGE, code: 'USAGE' };
  }
  reporter.stage('network_preflight_started', `self-update 网络预检(${options.dryRun ? 'dry-run' : '更新前'}):当前 script-v${INSTALLER_VERSION}`, {
    command: 'self-update',
    dryRun: options.dryRun,
    installerVersion: INSTALLER_VERSION,
  });
  const preflight = await runPreflight<SelfUpdateResolved>(
    {
      apiHost: GITHUB_API_HOST,
      apiPort: 443,
      resolveApi: async () => {
        const release = pickScriptRelease(await fetchReleases(RELEASE_REPO, deps.kernel));
        const script = pickScriptAsset(release);
        const checksum = pickChecksumAsset(release);
        return { tag: release.tag, script, checksum, isLatest: release.tag === `script-v${INSTALLER_VERSION}` };
      },
      assetsOf: (resolved) =>
        resolved.isLatest
          ? []
          : [
              { label: `安装器 ${resolved.script.name}`, url: resolved.script.url },
              { label: `校验 ${resolved.checksum.name}`, url: resolved.checksum.url },
            ],
    },
    deps.probes ?? createDefaultProbes(deps.kernel),
    reporter,
  );
  if (!preflight.ok || preflight.resolved === undefined) {
    reporter.fail(`网络预检未通过,已阻止下载与替换。建议:${preflight.suggestion ?? '检查网络后重试'}`);
    return { exitCode: EXIT_FAILURE, code: 'PREFLIGHT_FAILED', retryable: true, message: '网络预检未通过' };
  }
  const resolved = preflight.resolved;
  if (resolved.isLatest) {
    reporter.stage('install_step', `安装器已是最新:script-v${INSTALLER_VERSION}`);
    return { exitCode: EXIT_OK };
  }
  const scriptProbe = preflight.assetResults.find((probe) => probe.url === resolved.script.url);
  reporter.stage('release_resolved', `self-update:script-v${INSTALLER_VERSION} → ${resolved.tag},资产 ${resolved.script.name} 与 ${resolved.checksum.name}${scriptProbe?.contentLength === undefined ? '' : `(${scriptProbe.contentLength} 字节)`}`, {
    from: `script-v${INSTALLER_VERSION}`,
    tag: resolved.tag,
  });
  reporter.stage('network_preflight_completed', `预检通过。${networkConfigSummary()}`, { ok: true });
  if (options.dryRun) {
    reporter.stage('dry_run_report', 'dry-run:已完成 Release 解析与网络预检,未下载、未替换、未重启业务服务');
    return { exitCode: EXIT_OK };
  }

  const directory = dirname(target);
  const lock = `${target}.self-update.lock`;
  const temp = join(directory, `.${basename(target)}.${process.pid}.tmp`);
  const checksumTemp = `${temp}.sums`;
  const backup = join(directory, `${basename(target)}.bak-${INSTALLER_VERSION}-${Date.now()}`);
  let replacementAttempted = false;
  let backupCreated = false;
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch {
    reporter.fail(`已有 self-update 正在运行:${lock}`);
    return { exitCode: EXIT_LOCKED, code: 'PORT_EXHAUSTED', message: 'self-update 锁被占用' };
  }
  try {
    try {
      await downloadAsset(resolved.script, temp, { kernel: deps.kernel, reporter, totalMs: SCRIPT_TOTAL_MS });
      await downloadAsset(resolved.checksum, checksumTemp, { kernel: deps.kernel, reporter, totalMs: SCRIPT_TOTAL_MS });
    } catch (error) {
      if (error instanceof TransportFailure) {
        const retryable = isHttpFailure(error.failure) && error.failure.retryable;
        const detail = isHttpFailure(error.failure) ? error.failure.message : '已取消';
        reporter.fail(`下载失败:${error.failure.kind}:${detail}${retryable ? '(可稍后重试)' : ''}`);
        return { exitCode: EXIT_FAILURE, code: 'DOWNLOAD_FAILED', retryable, message: '安装器资产下载失败' };
      }
      throw error;
    }
    reporter.stage('checksum_started', '校验安装器资产(SHA256SUMS)');
    try {
      await verifyAssetChecksum(temp, checksumTemp, 'blog-deploy.mjs');
    } catch (error) {
      reporter.fail(`校验失败:${error instanceof Error ? error.message : String(error)};已阻止替换,当前安装器保持原状`);
      return { exitCode: EXIT_FAILURE, code: 'CHECKSUM_MISMATCH', retryable: false, message: '安装器校验失败' };
    }
    const downloaded = await readFile(temp, 'utf8');
    if (!downloaded.startsWith('#!') || !downloaded.includes('blog-deploy')) throw new Error('安装器资产格式非法');
    await copyFile(target, backup);
    backupCreated = true;
    await chmod(backup, 0o600);
    replacementAttempted = true;
    await rename(temp, target);
    const check = spawnSync(process.execPath, [target, '--help'], { encoding: 'utf8' });
    if (check.status !== 0) {
      throw new Error(`新安装器 --help 失败:${(check.stderr || check.stdout || '').trim().slice(-500)}`);
    }
    reporter.stage('checksum_completed', '校验通过');
    const backups = (await readdir(directory)).filter((name) => name.startsWith(`${basename(target)}.bak-`)).sort();
    await Promise.all(backups.slice(0, -1).map((name) => rm(join(directory, name), { force: true })));
    reporter.stage('installer_updated', `安装器已更新:script-v${INSTALLER_VERSION} → ${resolved.tag}`);
    return { exitCode: EXIT_OK };
  } catch (error) {
    let detail = error instanceof Error ? error.message : String(error);
    if (replacementAttempted && backupCreated) {
      try {
        await rename(backup, target);
        detail += `;已恢复旧安装器(备份:${backup})`;
      } catch (restoreError) {
        detail += `;恢复失败，人工恢复备份:${backup};${restoreError instanceof Error ? restoreError.message : String(restoreError)}`;
      }
    }
    reporter.fail(`self-update 失败:${detail}`);
    return { exitCode: EXIT_FAILURE, code: 'EXTERNAL_COMMAND_FAILED', message: '安装器更新失败' };
  } finally {
    await rm(temp, { force: true }).catch(() => undefined);
    await rm(`${temp}.sums`, { force: true }).catch(() => undefined);
    await rm(lock, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function runInstallerCommand(
  command: string,
  options: InstallerOptions,
  deps: InstallerDeps,
): Promise<InstallerOutcome> {
  if (command === 'init') return runInit(options, deps);
  if (command === 'deploy' || command === 'redeploy') return runDeploy(options, deps);
  if (command === 'self-update') return runSelfUpdate(options, deps);
  deps.reporter.fail(`未知命令:${command}`);
  return { exitCode: EXIT_USAGE, code: 'USAGE' };
}


