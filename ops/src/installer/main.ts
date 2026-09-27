#!/usr/bin/env node
/**
 * 博客服务器安装器(单文件 mjs,公开 Release,无需下载 token)。
 *
 *   node blog-deploy.mjs init [--config /etc/blog/blog.json] [--force]
 *   node blog-deploy.mjs deploy|redeploy [--config …] [--build-tag build-v0.1.0] [--dry-run]
 *
 * 秘密只存在于 blog.json 与其派生的 /var/lib/blog/product.env;命令参数只有路径。
 */
import { spawnSync } from 'node:child_process';
import { access, chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configTemplate, parseBlogConfig, seedFromLegacy, type BlogConfig } from './config.ts';
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
  type FetchLike,
} from './release.ts';
import { RELEASE_BINARIES, RELEASE_NGINX, RELEASE_UNITS } from '../domain/deploy-plan.ts';

interface Options {
  readonly command: string;
  readonly configFile: string;
  readonly buildTag?: string;
  readonly dryRun: boolean;
  readonly force: boolean;
}

const USAGE = `blog-deploy - 博客服务器安装器

用法:
  node blog-deploy.mjs init [--config <blog.json>] [--force]
  node blog-deploy.mjs deploy|redeploy [--config <blog.json>] [--build-tag build-v0.1.0] [--dry-run]

说明:
  init        生成 /etc/blog 目录与 blog.json(0600),打印待办清单
  deploy      首次安装:下载最新 build-v* 中对应架构的发布包,校验后安装并重启
  redeploy    升级(与 deploy 同一实现,幂等)
  --dry-run   只展示计划,不下载、不安装
  --config    默认 ${CONFIG_FILE};证书要求放在同一目录 <serverName>.pem / <serverName>.key
`;

class UsageError extends Error {}
class HelpRequested extends Error {}
class RunError extends Error {}

function parseArgs(argv: readonly string[]): Options {
  let command = '';
  let configFile = CONFIG_FILE;
  let buildTag: string | undefined;
  let dryRun = false;
  let force = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === '--help' || token === '-h' || token === 'help') {
      throw new HelpRequested();
    }
    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (token === '--force') {
      force = true;
      continue;
    }
    if (token === '--config') {
      const value = argv[++index];
      if (!value) throw new UsageError('--config 需要一个路径');
      configFile = value;
      continue;
    }
    if (token === '--build-tag') {
      const value = argv[++index];
      if (!value) throw new UsageError('--build-tag 需要一个标签');
      buildTag = value;
      continue;
    }
    if (token.startsWith('-')) throw new UsageError(`未知选项:${token}`);
    if (command) throw new UsageError(`多余参数:${token}`);
    command = token;
  }
  return { command: command || 'deploy', configFile, buildTag, dryRun, force };
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

async function runInit(options: Options): Promise<number> {
  const directory = dirname(options.configFile);
  await mkdir(directory, { recursive: true, mode: CONFIG_DIR_MODE });
  await chmod(directory, CONFIG_DIR_MODE).catch(() => undefined);
  if (await exists(options.configFile)) {
    if (!options.force) {
      console.error(`blog.json 已存在:${options.configFile}(要重写请加 --force)`);
      return 10;
    }
  }
  const legacy = await legacySeed(options.configFile);
  await writeFile(options.configFile, configTemplate(legacy.seed), { mode: CONFIG_FILE_MODE });
  await chmod(options.configFile, CONFIG_FILE_MODE);
  console.log(`已生成 ${options.configFile}(0600)`);
  if (legacy.found.length > 0) console.log(`已从旧文件预填:${legacy.found.join('、')}`);
  console.log('');
  console.log('待办:');
  console.log(`  1. 填写 serverName / contentRepo / contentToken(以及可选的 buildTag)`);
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

async function runDeploy(options: Options, fetchImpl: FetchLike): Promise<number> {
  const directory = dirname(options.configFile);
  if (!options.dryRun && typeof process.getuid === 'function' && process.getuid() !== 0) {
    console.error('请以 root 运行(例如 sudo node blog-deploy.mjs deploy)');
    return 10;
  }
  let config: BlogConfig;
  try {
    config = parseBlogConfig(await readFile(options.configFile, 'utf8'));
  } catch (error) {
    console.error(`配置不可用:${error instanceof Error ? error.message : String(error)}`);
    console.error(`请先执行:node ${process.argv[1]} init(或检查 ${options.configFile})`);
    return 10;
  }
  const target = targetNow();
  const certPem = join(directory, `${config.serverName}.pem`);
  const certKey = join(directory, `${config.serverName}.key`);
  if (!(await exists(certPem)) || !(await exists(certKey))) {
    console.error(`缺少证书:${certPem} / ${certKey}`);
    return 10;
  }

  let releaseTag = options.buildTag ?? config.buildTag ?? '(最新 build-v*)';
  let assetName = '(按架构选择)';
  if (options.dryRun) {
    try {
      const release = pickBuildRelease(await fetchReleases(RELEASE_REPO, fetchImpl), options.buildTag ?? config.buildTag);
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

  const release = pickBuildRelease(await fetchReleases(RELEASE_REPO, fetchImpl), options.buildTag ?? config.buildTag);
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

    const values = { serverName: config.serverName, contentRepo: config.contentRepo };
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

export async function main(argv: readonly string[] = process.argv.slice(2), fetchImpl: FetchLike = fetch): Promise<number> {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof HelpRequested) {
      console.log(USAGE);
      return 0;
    }
    if (error instanceof UsageError) {
      console.error(error.message);
      console.error(USAGE);
      return 10;
    }
    throw error;
  }
  try {
    if (options.command === 'init') return await runInit(options);
    if (options.command === 'deploy' || options.command === 'redeploy') {
      return await runDeploy(options, fetchImpl);
    }
    console.error(`未知命令:${options.command}`);
    console.error(USAGE);
    return 10;
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      return 10;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 20;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 20;
    });
}
