#!/usr/bin/env node
// blog 本地常驻守护：Data(prod SQLite) + Product(同源挂载前端产物)。
// 与服务器安装器(deploy/README.md)同风格：配置只来自 local.json，不读任何环境变量；
// Rust 二进制要求的管理凭证与内容仓凭证由本脚本解析后在子进程环境内注入。
// 平台无关：macOS launchd 与 Linux systemd 单元都以本文件为入口。
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';

const DEFAULT_CONFIG = path.join(homedir(), '.local', 'state', 'blog', 'local-deploy', 'local.json');
const ADMIN_ENV_KEYS = ['BLOG_ADMIN_PASSWORD_HASH', 'BLOG_ADMIN_TOTP_SECRET', 'BLOG_ADMIN_RUNTIME_DIR'];
const HEALTH_TIMEOUT_MS = 30_000;

const log = (...args) => console.log(`[${new Date().toISOString()}]`, ...args);

function fail(message) {
  console.error(`[serve] ${message}`);
  process.exit(1);
}

function expandHome(value) {
  return value.startsWith('~/') ? path.join(homedir(), value.slice(2)) : value;
}

export function loadConfig(configPath) {
  if (!existsSync(configPath)) fail(`配置不存在: ${configPath}（先运行 install.mjs 生成）`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    fail(`配置不是合法 JSON: ${configPath}（${error.message}）`);
  }
  const config = {
    repoRoot: expandHome(raw.repoRoot ?? ''),
    stateDir: expandHome(raw.stateDir ?? '~/.local/state/blog'),
    productPort: raw.productPort ?? 8080,
    dataPort: raw.dataPort ?? 8081,
    contentSource: raw.contentSource ?? 'fixture',
    contentRepo: raw.contentRepo ?? '',
    contentToken: raw.contentToken ?? '',
    adminAuth: raw.adminAuth ?? 'on',
    dataBin: raw.dataBin ? expandHome(raw.dataBin) : null,
    productBin: raw.productBin ? expandHome(raw.productBin) : null,
    webDir: raw.webDir ? expandHome(raw.webDir) : null,
  };
  if (!config.repoRoot) fail('配置缺少 repoRoot');
  if (!Number.isInteger(config.productPort) || !Number.isInteger(config.dataPort)) fail('端口必须是整数');
  if (config.productPort === config.dataPort) fail('productPort 与 dataPort 不能相同');
  if (config.contentSource !== 'fixture' && config.contentSource !== 'github') {
    fail('contentSource 只支持 fixture 或 github');
  }
  // bypass 免 GUI 登录：仅适合 loopback 的个人本地部署（二进制强制 loopback 监听）
  if (config.adminAuth !== 'on' && config.adminAuth !== 'bypass') {
    fail('adminAuth 只支持 on 或 bypass');
  }
  if (config.contentSource === 'github' && (!config.contentRepo || !config.contentToken)) {
    fail('contentSource=github 需要同时提供 contentRepo 与 contentToken');
  }
  return config;
}

function resolveArtifacts(config) {
  const artifacts = {
    dataBin: config.dataBin ?? path.join(config.repoRoot, 'src', 'target', 'release', 'data'),
    productBin: config.productBin ?? path.join(config.repoRoot, 'src', 'target', 'release', 'product'),
    webDir: config.webDir ?? path.join(config.repoRoot, 'src', 'frontend', 'dist'),
  };
  for (const [name, file] of [['data 二进制', artifacts.dataBin], ['product 二进制', artifacts.productBin]]) {
    if (!existsSync(file)) fail(`${name} 不存在: ${file}（先在仓库运行 ops delivery build，或在配置里改路径）`);
  }
  if (!existsSync(artifacts.webDir)) fail(`前端产物目录不存在: ${artifacts.webDir}（先构建 dist，或在配置里改 webDir）`);
  return artifacts;
}

// credentials.env 是 `ops admin credentials init` 的产物（KEY=VALUE，0600）；
// Product 只认这三个环境变量，这里解析后注入子进程，用户无需自行导出。
function loadAdminEnv(config) {
  const file = path.join(config.stateDir, 'admin-auth', 'credentials.env');
  if (!existsSync(file)) fail(`管理凭证不存在: ${file}（先运行 ops admin credentials init）`);
  const values = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line === '') continue;
    const separator = line.indexOf('=');
    if (separator <= 0) fail('credentials.env 格式无效');
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  for (const key of ADMIN_ENV_KEYS) {
    if (!values[key]) fail(`credentials.env 缺少 ${key}`);
  }
  return Object.fromEntries(ADMIN_ENV_KEYS.map((key) => [key, values[key]]));
}

export function portInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

// 抛出异常而不是直接退出：此时可能已有子进程，main 统一走 shutdown 清理。
async function waitForHealth(url, label, child) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${label} 启动即退出（exit ${child.exitCode}），查看日志定位`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // 尚未就绪，继续等待
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} ${HEALTH_TIMEOUT_MS / 1000}s 内未通过 /healthz`);
}

function startChild(name, command, args, env) {
  const child = spawn(command, args, { env, stdio: ['ignore', 'inherit', 'inherit'] });
  log(`${name} 启动 pid=${child.pid}`);
  return child;
}

function stopChild(child, name) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const killTimer = setTimeout(() => {
      log(`${name} 未在 5s 内退出，发送 SIGKILL`);
      child.kill('SIGKILL');
    }, 5_000);
    child.once('exit', () => {
      clearTimeout(killTimer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function main() {
  const configPath = process.argv[2] ?? DEFAULT_CONFIG;
  const config = loadConfig(configPath);
  const artifacts = resolveArtifacts(config);
  const adminEnv = loadAdminEnv(config);

  for (const port of [config.dataPort, config.productPort]) {
    if (await portInUse(port)) fail(`端口 ${port} 已被占用（可能是残留实例），先停掉旧进程再启动`);
  }

  const productEnv = { ...adminEnv };
  if (config.contentSource === 'github') {
    productEnv.BLOG_CONTENT_REPO = config.contentRepo;
    productEnv.BLOG_CONTENT_TOKEN = config.contentToken;
  }

  let shuttingDown = false;
  const children = new Map();
  const exitSignals = [];
  const waitForExit = (child, name) =>
    new Promise((resolve) => {
      child.once('exit', (code, signal) => {
        children.delete(name);
        if (!shuttingDown) exitSignals.push({ name, code, signal });
        resolve();
      });
    });

  const shutdown = async (exitCode) => {
    shuttingDown = true;
    for (const [name, child] of [...children.entries()]) {
      await stopChild(child, name);
    }
    process.exit(exitCode);
  };
  process.on('SIGTERM', () => void shutdown(0));
  process.on('SIGINT', () => void shutdown(0));

  try {
    const data = startChild(
      'data',
      artifacts.dataBin,
      ['--listen', `127.0.0.1:${config.dataPort}`, '--data-semantics', 'prod', '--data-database-path', path.join(config.stateDir, 'prod.db')],
      { PATH: process.env.PATH ?? '/usr/bin:/bin' },
    );
    children.set('data', data);
    const dataExit = waitForExit(data, 'data');

    await waitForHealth(`http://127.0.0.1:${config.dataPort}/healthz`, 'data', data);

    const product = startChild(
      'product',
      artifacts.productBin,
      [
        '--listen', `127.0.0.1:${config.productPort}`,
        '--data-addr', `http://127.0.0.1:${config.dataPort}`,
        '--web-dir', artifacts.webDir,
        '--content-source', config.contentSource,
        '--admin', config.adminAuth,
      ],
      productEnv,
    );
    children.set('product', product);
    const productExit = waitForExit(product, 'product');

    // 任一子进程意外退出即整体退出，交给系统单元（KeepAlive / Restart）拉起完整栈。
    await Promise.race([dataExit, productExit]);
    const reason = exitSignals[0];
    log(`检测到 ${reason?.name} 退出（code=${reason?.code} signal=${reason?.signal}），关闭整个栈等待重启`);
  } catch (error) {
    console.error(`[serve] ${error.message}`);
    await shutdown(1);
  }
  await shutdown(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  await main();
}
