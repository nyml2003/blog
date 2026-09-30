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
import {
  downloadAsset,
  fetchReleases,
  pickAsset,
  pickBuildRelease,
  targetForArch,
  verifyChecksums,
  verifyAssetChecksum,
  pickChecksumAsset,
  pickScriptAsset,
  pickScriptRelease,
  type FetchLike,
} from './release.ts';
import { RELEASE_BINARIES, RELEASE_NGINX, RELEASE_UNITS } from '../deploy-plan.ts';

declare const __BLOG_DEPLOY_RELEASE_VERSION__: string | undefined;

export interface InstallerOptions {
  readonly configFile?: string;
  readonly dryRun: boolean;
  readonly force: boolean;
}
/** The package version is the single source of truth for script-v* releases. */
export const INSTALLER_VERSION =
  typeof __BLOG_DEPLOY_RELEASE_VERSION__ === 'string' ? __BLOG_DEPLOY_RELEASE_VERSION__ : packageInfo.version;
class RunError extends Error {}

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

function ok(message: string): void {
  console.log(`✓ ${message}`);
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

export async function runInit(options: InstallerOptions): Promise<number> {
  const configFile = configPath(options);
  const directory = dirname(configFile);
  await mkdir(directory, { recursive: true, mode: CONFIG_DIR_MODE });
  await chmod(directory, CONFIG_DIR_MODE).catch(() => undefined);
  if (await exists(configFile)) {
    if (!options.force) {
      console.error(`blog.json 已存在:${configFile}(要重写请加 --force)`);
      return 10;
    }
  }
  const legacy = await legacySeed(configFile);
  await writeFile(configFile, configTemplate(legacy.seed), { mode: CONFIG_FILE_MODE });
  await chmod(configFile, CONFIG_FILE_MODE);
  console.log(`已生成 ${configFile}(0600)`);
  if (legacy.found.length > 0) console.log(`已从旧文件预填:${legacy.found.join('、')}`);
  console.log('');
  console.log('待办:');
  console.log(`  1. 填写 serverName / contentRepo / contentToken(buildTag 固定为 latest)`);
  const serverName = legacy.seed.serverName ?? '<serverName>';
  console.log(`  2. 放证书:${directory}/${serverName}.pem 与 ${directory}/${serverName}.key(0600)`);
  console.log(`  3. 执行:node ${process.argv[1]} deploy`);
  return 0;
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

export async function runDeploy(options: InstallerOptions, fetchImpl: FetchLike): Promise<number> {
  const configFile = configPath(options);
  const directory = dirname(configFile);
  if (!options.dryRun && typeof process.getuid === 'function' && process.getuid() !== 0) {
    console.error('请以 root 运行(例如 sudo node blog-deploy.mjs deploy)');
    return 10;
  }
  let config: BlogConfig;
  try {
    config = parseBlogConfig(await readFile(configFile, 'utf8'));
  } catch (error) {
    console.error(`配置不可用:${error instanceof Error ? error.message : String(error)}`);
    console.error(`请先执行:node ${process.argv[1]} init(或检查 ${configFile})`);
    return 10;
  }
  const target = targetNow();
  const certPem = join(directory, `${config.serverName}.pem`);
  const certKey = join(directory, `${config.serverName}.key`);
  if (!(await exists(certPem)) || !(await exists(certKey))) {
    console.error(`缺少证书:${certPem} / ${certKey}`);
    return 10;
  }

  let releaseTag = '(最新稳定 build-v*)';
  let assetName = '(按架构选择)';
  if (options.dryRun) {
    try {
      const release = pickBuildRelease(await fetchReleases(RELEASE_REPO, fetchImpl));
      const asset = pickAsset(release, target);
      releaseTag = release.tag;
      assetName = asset.name;
    } catch (error) {
      console.log(`(dry-run 未解析到 Release:${error instanceof Error ? error.message : String(error)})`);
    }
  }
  console.log(`安装计划:`);
  console.log(`  域名      ${config.serverName}`);
  console.log(`  内容仓库  ${config.contentRepo}`);
  console.log(`  架构      ${target}`);
  console.log(`  版本      ${releaseTag}`);
  console.log(`  资产      ${assetName}`);
  console.log(`  证书      ${certPem} / ${certKey} → ${NGINX_CERT_DIR}`);
  console.log(`  发布包    ${RELEASE_REPO}`);
  if (options.dryRun) {
    console.log('dry-run:未下载、未安装、未重启');
    return 0;
  }

  const release = pickBuildRelease(await fetchReleases(RELEASE_REPO, fetchImpl));
  const asset = pickAsset(release, target);
  const workDir = `/tmp/blog-deploy-${process.pid}`;
  try {
    await rm(workDir, { recursive: true, force: true });
    await mkdir(workDir, { recursive: true, mode: 0o700 });
    const tarball = join(workDir, asset.name);
    console.log(`下载 ${asset.name}(${release.tag})`);
    await downloadAsset(asset, tarball, fetchImpl);
    run('tar', ['-xzf', tarball, '-C', workDir]);
    await verifyChecksums(workDir, join(workDir, 'SHA256SUMS'));
    ok('发布包校验通过');

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
    ok('模板渲染完成');

    if (spawnSync('sh', ['-c', 'command -v nginx'], { encoding: 'utf8' }).status !== 0) {
      console.log('安装 nginx');
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
    ok('二进制与 systemd unit 安装完成');

    run('install', ['-m', '0644', join(renderedDir, 'nginx', RELEASE_NGINX), NGINX_AVAILABLE]);
    run('ln', ['-sfn', NGINX_AVAILABLE, NGINX_ENABLED]);
    await rm('/etc/nginx/sites-enabled/default', { force: true });
    await mkdir(NGINX_CERT_DIR, { recursive: true, mode: 0o755 });
    run('install', ['-m', '0644', certPem, join(NGINX_CERT_DIR, `${config.serverName}.pem`)]);
    run('install', ['-m', '0600', certKey, join(NGINX_CERT_DIR, `${config.serverName}.key`)]);
    ok('nginx 配置与证书安装完成');

    await writeFile(PRODUCT_ENV, `BLOG_CONTENT_TOKEN=${config.contentToken}\n`, { mode: 0o600 });
    await chmod(PRODUCT_ENV, 0o600);
    ok('内容 token 已派生到 /var/lib/blog/product.env(0600)');

    run('nginx', ['-t']);
    run('systemctl', ['enable', '--now', 'nginx']);
    run('sh', ['-c', 'systemctl reload nginx || systemctl restart nginx']);
    run('systemctl', ['restart', 'blog-data.service', 'blog-product.service']);

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const healthy = await fetchImpl(HEALTH_URL)
        .then((response) => response.ok)
        .catch(() => false);
      if (healthy) {
        try {
          run('systemctl', ['is-active', '--quiet', 'blog-data.service', 'blog-product.service']);
          console.log(`部署完成:https://${config.serverName}`);
          return 0;
        } catch {
          /* 服务仍在拉起,继续等待 */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    console.error('健康检查超时;排查:journalctl -u blog-product -n 100 --no-pager');
    return 20;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function installerPath(): Promise<string> {
  return process.env.BLOG_DEPLOY_INSTALLER_PATH ?? process.argv[1] ?? '/etc/blog/blog-deploy.mjs';
}

export async function runSelfUpdate(options: InstallerOptions, fetchImpl: FetchLike): Promise<number> {
  const target = await installerPath();
  if (!options.dryRun && typeof process.getuid === 'function' && process.getuid() !== 0) {
    console.error('请以 root 运行 self-update');
    return 10;
  }
  let release;
  try {
    release = pickScriptRelease(await fetchReleases(RELEASE_REPO, fetchImpl));
  } catch (error) {
    console.error(`无法查询 script Release:${error instanceof Error ? error.message : String(error)}`);
    return 20;
  }
  const current = `script-v${INSTALLER_VERSION}`;
  if (release.tag === current) {
    console.log(`安装器已是最新:${current}`);
    return 0;
  }
  const script = pickScriptAsset(release);
  const checksum = pickChecksumAsset(release);
  if (options.dryRun) {
    console.log(`self-update:${current} → ${release.tag} (dry-run,未下载、未替换)`);
    return 0;
  }
  const directory = dirname(target);
  const lock = `${target}.self-update.lock`;
  const temp = join(directory, `.${basename(target)}.${process.pid}.tmp`);
  const backup = join(directory, `${basename(target)}.bak-${INSTALLER_VERSION}-${Date.now()}`);
  let replacementAttempted = false;
  let backupCreated = false;
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch {
    console.error(`已有 self-update 正在运行:${lock}`);
    return 30;
  }
  try {
    await downloadAsset(script, temp, fetchImpl);
    const checksumTemp = `${temp}.sums`;
    await downloadAsset(checksum, checksumTemp, fetchImpl);
    await verifyAssetChecksum(temp, checksumTemp, 'blog-deploy.mjs');
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
    const backups = (await readdir(directory)).filter((name) => name.startsWith(`${basename(target)}.bak-`)).sort();
    await Promise.all(backups.slice(0, -1).map((name) => rm(join(directory, name), { force: true })));
    console.log(`安装器已更新:${current} → ${release.tag}`);
    return 0;
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
    console.error(`self-update 失败:${detail}`);
    return 20;
  } finally {
    await rm(temp, { force: true }).catch(() => undefined);
    await rm(`${temp}.sums`, { force: true }).catch(() => undefined);
    await rm(lock, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function runInstallerCommand(command: string, options: InstallerOptions, fetchImpl: FetchLike): Promise<number> {
  if (command === 'init') return runInit(options);
  if (command === 'deploy' || command === 'redeploy') return runDeploy(options, fetchImpl);
  if (command === 'self-update') return runSelfUpdate(options, fetchImpl);
  console.error(`未知命令:${command}`);
  return 10;
}
