import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { EXIT_FAILURE, EXIT_OK } from '@fluvient-cli/cli-kit/errors.ts';
import type { FsPort, ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';

/**
 * `ops local install|uninstall`：把打包产物注册为系统常驻服务。
 *
 * 拓扑与实现约定见 deploy/local/README.md：守护本体是 deploy/local/serve.mjs（平台无关，
 * 由系统单元直接执行，不依赖 ops/nix shell），本模块只负责生成配置、注册/移除
 * macOS LaunchAgent 或 Linux systemd 用户单元并做健康验证。
 * bootout 是异步的：注册前必须等旧 label 真正消失，否则 bootstrap 报 I/O error。
 */

const LABEL = 'local.blog.server';
const UNIT_NAME = 'blog-local.service';
const SERVE_SCRIPT = join('deploy', 'local', 'serve.mjs');
const LABEL_GONE_TIMEOUT_MS = 15_000;
const BOOTSTRAP_ATTEMPTS = 3;
// product 启动包含内容源同步（github 源可达数十秒），健康验证窗口需覆盖同步时间。
const HEALTH_TIMEOUT_MS = 60_000;

export type LocalDeployAction = 'install' | 'uninstall';

export interface LocalDeployPorts {
  readonly process: ProcessPort;
  readonly fs: FsPort;
  readonly reporter: Reporter;
  readonly root: string;
}

interface LocalConfig {
  readonly productPort: number;
  readonly dataPort: number;
}

const deployDir = join(homedir(), '.local', 'state', 'blog', 'local-deploy');
const configPath = join(deployDir, 'local.json');
const logsDir = join(deployDir, 'logs');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function run(ports: LocalDeployPorts, command: string, args: readonly string[]) {
  return ports.process.run(command, [...args], ports.root);
}

// 单元文件要钉住绝对路径；node 来自用户环境（如 nvm），取运行 ops 的 node，
// nvm 切换/升级默认版本后需重跑 ops local install。
function resolveNodePath(): string {
  return process.execPath;
}

async function loadOrCreateConfig(ports: LocalDeployPorts): Promise<LocalConfig | null> {
  if (!await ports.fs.exists(configPath)) {
    const template = {
      repoRoot: ports.root,
      stateDir: '~/.local/state/blog',
      productPort: 8080,
      dataPort: 8081,
      contentSource: 'fixture',
      contentRepo: '',
      contentToken: '',
      adminAuth: 'bypass',
    };
    if (ports.fs.write === undefined) return null;
    await ports.fs.write(configPath, `${JSON.stringify(template, null, 2)}\n`);
    await run(ports, 'chmod', ['600', configPath]);
    ports.reporter.info(`已生成默认配置: ${configPath}（0600，fixture 内容源；切 GitHub 真源见 deploy/local/README.md）`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await ports.fs.read(configPath));
  } catch (error) {
    ports.reporter.fail(`配置不是合法 JSON: ${configPath}（${error instanceof Error ? error.message : String(error)}）`);
    return null;
  }
  if (typeof raw !== 'object' || raw === null) {
    ports.reporter.fail(`配置必须是 JSON 对象: ${configPath}`);
    return null;
  }
  const record = raw as Record<string, unknown>;
  const config: LocalConfig = {
    productPort: typeof record.productPort === 'number' ? record.productPort : 8080,
    dataPort: typeof record.dataPort === 'number' ? record.dataPort : 8081,
  };
  return config;
}

// 端口预检只拦"外来占用者"：本服务自身在运行时端口必然被占，此时 install 语义是重启。
async function assertForeignPortsFree(ports: LocalDeployPorts, config: LocalConfig, ownRunning: boolean): Promise<boolean> {
  if (ownRunning) {
    ports.reporter.info('检测到常驻服务已在运行，本次 install 将重启它');
    return true;
  }
  const checks: ReadonlyArray<readonly [string, number]> = [['productPort', config.productPort], ['dataPort', config.dataPort]];
  for (const [name, port] of checks) {
    if (await portInUse(port)) {
      ports.reporter.fail(`端口 ${port}（${name}）已被占用——可能是 ops runtime 栈或其他服务；先停掉占用进程，或修改 ${configPath}`);
      return false;
    }
  }
  return true;
}

async function launchdLabelRegistered(ports: LocalDeployPorts, uid: number): Promise<boolean> {
  const result = await run(ports, 'launchctl', ['print', `gui/${uid}/${LABEL}`]);
  return result.code === 0;
}

async function waitLaunchdLabelGone(ports: LocalDeployPorts, uid: number, timeoutMs = LABEL_GONE_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!await launchdLabelRegistered(ports, uid)) return true;
    await sleep(300);
  }
  return false;
}

async function ownServiceRunning(ports: LocalDeployPorts, uid: number): Promise<boolean> {
  if (process.platform === 'darwin') return launchdLabelRegistered(ports, uid);
  const result = await run(ports, 'systemctl', ['--user', 'is-active', UNIT_NAME]);
  return result.code === 0;
}

async function waitPortsFree(ports: LocalDeployPorts, config: LocalConfig, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!await portInUse(config.productPort) && !await portInUse(config.dataPort)) return true;
    await sleep(300);
  }
  return false;
}

async function installDarwin(ports: LocalDeployPorts, uid: number, nodePath: string, servePath: string, config: LocalConfig): Promise<boolean> {
  const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
  await ports.fs.mkdir(join(homedir(), 'Library', 'LaunchAgents'));
  await ports.fs.mkdir(logsDir);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${servePath}</string>
        <string>${configPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Background</string>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>${join(logsDir, 'launchd.log')}</string>
    <key>StandardErrorPath</key>
    <string>${join(logsDir, 'launchd.err.log')}</string>
</dict>
</plist>
`;
  if (ports.fs.write === undefined) return false;
  await ports.fs.write(plistPath, plist);

  // 重装幂等：先等旧注册真正消失、端口真正释放（bootout 异步收尾），再注入新单元
  if (await launchdLabelRegistered(ports, uid)) {
    ports.reporter.info('检测到已注册实例，先卸载旧实例…');
    await run(ports, 'launchctl', ['bootout', `gui/${uid}/${LABEL}`]);
    if (!await waitLaunchdLabelGone(ports, uid)) {
      ports.reporter.fail(`旧实例 ${LABEL_GONE_TIMEOUT_MS / 1000}s 内未完成卸载；手动执行 launchctl bootout gui/${uid}/${LABEL} 后重试`);
      return false;
    }
    if (!await waitPortsFree(ports, config)) {
      ports.reporter.fail('旧实例停止后端口未释放；稍后重试或检查残留进程');
      return false;
    }
  }
  for (let attempt = 1; attempt <= BOOTSTRAP_ATTEMPTS; attempt++) {
    // 半注册态（上次失败残留）先清掉再试
    if (await launchdLabelRegistered(ports, uid)) {
      await run(ports, 'launchctl', ['bootout', `gui/${uid}/${LABEL}`]);
      await waitLaunchdLabelGone(ports, uid, 5_000);
    }
    const result = await run(ports, 'launchctl', ['bootstrap', `gui/${uid}`, plistPath]);
    if (result.code === 0) {
      ports.reporter.ok(`LaunchAgent 已注册并启动: ${plistPath}`);
      ports.reporter.info(`日志: ${join(logsDir, 'launchd.log')}（stderr 同目录 .err.log）`);
      return true;
    }
    ports.reporter.info(`bootstrap 第 ${attempt} 次失败: ${result.stderr || result.stdout}`);
    await sleep(1_000);
  }
  ports.reporter.fail(`launchctl bootstrap 连续 ${BOOTSTRAP_ATTEMPTS} 次失败；手动执行 launchctl bootstrap gui/${uid} ${plistPath} 查看详细错误`);
  return false;
}

async function uninstallDarwin(ports: LocalDeployPorts, uid: number): Promise<boolean> {
  await run(ports, 'launchctl', ['bootout', `gui/${uid}/${LABEL}`]);
  const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
  if (await ports.fs.exists(plistPath)) await run(ports, 'rm', ['-f', plistPath]);
  ports.reporter.ok('LaunchAgent 已停止并移除（配置与数据库保留）');
  return true;
}

async function installLinux(ports: LocalDeployPorts, nodePath: string, servePath: string): Promise<boolean> {
  const unitDir = join(homedir(), '.config', 'systemd', 'user');
  const unitPath = join(unitDir, UNIT_NAME);
  await ports.fs.mkdir(unitDir);
  await ports.fs.mkdir(logsDir);
  const unit = `[Unit]
Description=blog local stack (Data + Product)
After=network.target

[Service]
ExecStart=${nodePath} ${servePath} ${configPath}
Restart=on-failure
RestartSec=5
StandardOutput=append:${join(logsDir, 'systemd.log')}
StandardError=append:${join(logsDir, 'systemd.err.log')}

[Install]
WantedBy=default.target
`;
  if (ports.fs.write === undefined) return false;
  await ports.fs.write(unitPath, unit);
  if ((await run(ports, 'systemctl', ['--user', 'daemon-reload'])).code !== 0) return false;
  // enable 只建链接；restart 统一覆盖首次启动与重装（systemctl restart 会先停旧实例再起新的）
  if ((await run(ports, 'systemctl', ['--user', 'enable', UNIT_NAME])).code !== 0) return false;
  if ((await run(ports, 'systemctl', ['--user', 'restart', UNIT_NAME])).code !== 0) return false;
  ports.reporter.ok(`systemd 用户单元已注册并启动: ${unitPath}`);
  ports.reporter.info(`日志: ${join(logsDir, 'systemd.log')}（stderr 同目录 .err.log），或 journalctl --user -u ${UNIT_NAME}`);
  ports.reporter.info('提示：无登录会话的机器需执行 `loginctl enable-linger $USER` 才能脱离登录运行');
  return true;
}

async function uninstallLinux(ports: LocalDeployPorts): Promise<boolean> {
  await run(ports, 'systemctl', ['--user', 'disable', '--now', UNIT_NAME]);
  const unitPath = join(homedir(), '.config', 'systemd', 'user', UNIT_NAME);
  if (await ports.fs.exists(unitPath)) await run(ports, 'rm', ['-f', unitPath]);
  await run(ports, 'systemctl', ['--user', 'daemon-reload']);
  ports.reporter.ok('systemd 用户单元已停止并移除（配置与数据库保留）');
  return true;
}

async function verifyHealth(ports: LocalDeployPorts, config: LocalConfig): Promise<boolean> {
  const url = `http://127.0.0.1:${config.productPort}/healthz`;
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        ports.reporter.ok(`服务就绪，访问入口: http://127.0.0.1:${config.productPort}/`);
        ports.reporter.info(`管理端登录: http://127.0.0.1:${config.productPort}/admin/login.html`);
        return true;
      }
    } catch {
      // 尚未就绪，继续等待
    }
    await sleep(500);
  }
  ports.reporter.fail(`product ${HEALTH_TIMEOUT_MS / 1000}s 内未通过 /healthz；查看 ${logsDir} 定位`);
  return false;
}

export async function runLocalDeploy(ports: LocalDeployPorts, action: LocalDeployAction, dryRun = false): Promise<number> {
  ports.reporter.section(action === 'install' ? 'local install' : 'local uninstall');
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    ports.reporter.fail(`不支持的平台: ${process.platform}（仅 macOS 与 Linux）`);
    return EXIT_FAILURE;
  }
  if (dryRun) {
    ports.reporter.info(action === 'install'
      ? `将生成/复用 ${configPath}，端口预检后注册系统单元（入口 ${join(ports.root, SERVE_SCRIPT)}）并验证 /healthz`
      : '将移除系统单元并停止服务（配置与数据库保留）');
    return EXIT_OK;
  }

  if (action === 'uninstall') {
    return process.platform === 'darwin'
      ? (await uninstallDarwin(ports, process.getuid?.() ?? ports.fs.effectiveUid?.() ?? -1) ? EXIT_OK : EXIT_FAILURE)
      : (await uninstallLinux(ports) ? EXIT_OK : EXIT_FAILURE);
  }

  const servePath = join(ports.root, SERVE_SCRIPT);
  if (!await ports.fs.exists(servePath)) {
    ports.reporter.fail(`守护脚本不存在: ${servePath}（需要包含 deploy/local 的仓库版本）`);
    return EXIT_FAILURE;
  }
  const config = await loadOrCreateConfig(ports);
  if (config === null) return EXIT_FAILURE;
  const uid = process.getuid?.() ?? ports.fs.effectiveUid?.() ?? -1;
  if (!await assertForeignPortsFree(ports, config, await ownServiceRunning(ports, uid))) return EXIT_FAILURE;
  const nodePath = resolveNodePath();
  ports.reporter.info(`node: ${nodePath}（nvm 切换/升级默认 node 后需重跑 ops local install 重新钉住路径）`);
  const installed = process.platform === 'darwin'
    ? await installDarwin(ports, uid, nodePath, servePath, config)
    : await installLinux(ports, nodePath, servePath);
  if (!installed) return EXIT_FAILURE;
  return (await verifyHealth(ports, config)) ? EXIT_OK : EXIT_FAILURE;
}
