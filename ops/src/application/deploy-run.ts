import { join } from 'node:path';
import type { ProcessPort, ProcessResult } from '../domain/ports.ts';
import {
  REMOTE_PATHS,
  RELEASE_BINARIES,
  deployOutline,
  privileged,
  scpStep,
  sshStep,
  type DeployConfig,
  type DeployStep,
  type ReleaseManifest,
} from '../domain/deploy-plan.ts';
import type { DeployPorts } from './deploy-package.ts';

async function runStep(step: DeployStep, ports: DeployPorts): Promise<number> {
  const result = await ports.process.run(step.command, [...step.args], step.cwd ?? ports.root);
  if (result.code === 0) {
    ports.reporter.ok(step.label);
    return 0;
  }
  ports.reporter.fail(`${step.label}(exit ${result.code})`);
  const detail = (result.stderr || result.stdout).trim();
  if (detail) ports.reporter.info(detail.slice(-2000));
  return 20;
}

async function sshRun(ports: DeployPorts, config: DeployConfig, script: string): Promise<ProcessResult> {
  const step = sshStep(config.host, config.port, 'ssh', script);
  return ports.process.run(step.command, [...step.args], ports.root);
}

/** 幂等安装:准备环境、校验发布包、安装产物与配置、重启并做健康检查。 */
export async function runDeployApply(config: DeployConfig, ports: DeployPorts, options: { dryRun: boolean }): Promise<number> {
  if (options.dryRun) {
    ports.reporter.info(`部署目标 ${config.host}(发布包目录 ~/${config.archiveRemoteDir})`);
    for (const label of deployOutline(config)) ports.reporter.info(`- ${label}`);
    return 0;
  }
  if (!await ports.fs.exists(config.tokenFile)) {
    ports.reporter.fail(`本机 token 文件不存在:${config.tokenFile}`);
    return 10;
  }
  const probe = await sshRun(ports, config, `printf '%s\\n%s\\n' "$(id -u)" "$HOME"`);
  if (probe.code !== 0) {
    ports.reporter.fail(`无法连接 ${config.host}:${(probe.stderr || probe.stdout).trim()}`);
    return 20;
  }
  const [uidLine, homeLine] = probe.stdout.trim().split('\n');
  const uid = Number(uidLine);
  const home = homeLine ?? '';
  if (!Number.isInteger(uid) || home.length === 0) {
    ports.reporter.fail(`探测远端权限失败:${probe.stdout.trim()}`);
    return 20;
  }

  const archive = (await sshRun(
    ports,
    config,
    `ls -1t "$HOME/${config.archiveRemoteDir}"/blog-release-*.tar.gz 2>/dev/null | head -n 1`,
  )).stdout.trim();
  if (archive.length === 0) {
    ports.reporter.fail(`未在 ~/${config.archiveRemoteDir} 找到发布包,请先上传 blog-release-*.tar.gz`);
    return 20;
  }
  ports.reporter.info(`使用发布包 ${archive}`);

  const sudo = (script: string) => privileged(uid, script);
  const steps: DeployStep[] = [
    sshStep(config.host, config.port, '服务器准备(nginx/user/目录)', sudo([
      'set -e',
      'if ! command -v nginx >/dev/null 2>&1; then',
      '  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx',
      'fi',
      'id -u blog >/dev/null 2>&1 || useradd --system --home-dir /var/lib/blog --shell /usr/sbin/nologin blog',
      'install -d -o blog -g blog /var/lib/blog /var/lib/blog/web',
    ].join('\n'))),
    sshStep(config.host, config.port, '准备 staging 目录', [
      'set -e',
      `rm -rf ${REMOTE_PATHS.staging}`,
      `install -d -m 0755 ${REMOTE_PATHS.staging}`,
    ].join('\n')),
    sshStep(config.host, config.port, '解开发布包', sudo([
      'set -e',
      `tar -xzf ${JSON.stringify(archive)} -C ${REMOTE_PATHS.staging} --no-same-owner`,
      `test -f ${REMOTE_PATHS.staging}/MANIFEST.json`,
    ].join('\n'))),
  ];
  for (const step of steps) {
    const code = await runStep(step, ports);
    if (code !== 0) return code;
  }

  const manifestResult = await sshRun(ports, config, `cat ${REMOTE_PATHS.staging}/MANIFEST.json`);
  let manifest: ReleaseManifest;
  try {
    manifest = JSON.parse(manifestResult.stdout) as ReleaseManifest;
  } catch {
    ports.reporter.fail('发布包 MANIFEST.json 无法解析');
    return 20;
  }
  if (manifest.format !== 1 || manifest.target !== config.target || manifest.serverName !== config.serverName) {
    ports.reporter.fail('发布包与当前配置不匹配(target/serverName/format)');
    return 20;
  }
  const listed = Object.keys(manifest.sha256);
  const checksum = await sshRun(
    ports,
    config,
    `cd ${REMOTE_PATHS.staging} && sha256sum ${listed.map((path) => JSON.stringify(path)).join(' ')}`,
  );
  const mismatches: string[] = [];
  const seen = new Map<string, string>();
  for (const line of checksum.stdout.trim().split('\n')) {
    const [hash, path] = line.trim().split(/\s+/);
    if (hash && path) seen.set(path, hash);
  }
  for (const path of listed) {
    if (seen.get(path) !== manifest.sha256[path]) mismatches.push(path);
  }
  if (checksum.code !== 0 || mismatches.length > 0) {
    ports.reporter.fail(`发布包校验失败:${mismatches.join(', ') || 'sha256sum 未完成'}`);
    return 20;
  }
  ports.reporter.ok('发布包校验通过');

  const certPem = `${home}/${config.certSourceDir}/${config.serverName}.pem`;
  const certKey = `${home}/${config.certSourceDir}/${config.serverName}.key`;
  const installSteps: DeployStep[] = [
    sshStep(config.host, config.port, '安装二进制', sudo([
      'set -e',
      ...RELEASE_BINARIES.map(
        (name) => `install -m 0755 ${REMOTE_PATHS.staging}/bin/${name} ${REMOTE_PATHS.binDir}/${name}`,
      ),
    ].join('\n'))),
    sshStep(config.host, config.port, '安装前端 dist', sudo([
      'set -e',
      `rm -rf ${REMOTE_PATHS.webDir}`,
      `cp -a ${REMOTE_PATHS.staging}/web/dist ${REMOTE_PATHS.webDir}`,
      `chown -R blog:blog ${REMOTE_PATHS.dataDir}/web`,
    ].join('\n'))),
    sshStep(config.host, config.port, '安装 systemd unit', sudo([
      'set -e',
      `install -m 0644 ${REMOTE_PATHS.staging}/systemd/blog-data.service ${REMOTE_PATHS.unitDir}/blog-data.service`,
      `install -m 0644 ${REMOTE_PATHS.staging}/systemd/blog-product.service ${REMOTE_PATHS.unitDir}/blog-product.service`,
      'systemctl daemon-reload',
      'systemctl enable blog-data.service blog-product.service',
    ].join('\n'))),
    sshStep(config.host, config.port, '安装 nginx 站点', sudo([
      'set -e',
      `install -m 0644 ${REMOTE_PATHS.staging}/nginx/blog.conf ${REMOTE_PATHS.nginxAvailable}`,
      `ln -sfn ${REMOTE_PATHS.nginxAvailable} ${REMOTE_PATHS.nginxEnabled}`,
      'rm -f /etc/nginx/sites-enabled/default',
    ].join('\n'))),
    sshStep(config.host, config.port, '安装证书', sudo([
      'set -e',
      `test -f ${JSON.stringify(certPem)} || { echo "缺少 ${certPem}" >&2; exit 1; }`,
      `test -f ${JSON.stringify(certKey)} || { echo "缺少 ${certKey}" >&2; exit 1; }`,
      `install -d -m 0755 ${REMOTE_PATHS.certDir}`,
      `install -m 0644 ${JSON.stringify(certPem)} ${REMOTE_PATHS.certDir}/${config.serverName}.pem`,
      `install -m 0600 ${JSON.stringify(certKey)} ${REMOTE_PATHS.certDir}/${config.serverName}.key`,
    ].join('\n'))),
    sshStep(config.host, config.port, 'nginx 校验并重载', sudo([
      'set -e',
      'nginx -t',
      'systemctl enable --now nginx',
      'systemctl reload nginx || systemctl restart nginx',
    ].join('\n'))),
    scpStep(config.host, config.port, '上传 token', [config.tokenFile], `${REMOTE_PATHS.staging}/product.env`),
    sshStep(config.host, config.port, '安装 token', sudo(
      `set -e\ninstall -m 0600 -o root -g root ${REMOTE_PATHS.staging}/product.env ${REMOTE_PATHS.tokenTarget}`,
    )),
    sshStep(config.host, config.port, '重启并健康检查', sudo([
      'set -e',
      'systemctl restart blog-data.service blog-product.service',
      'for i in $(seq 1 60); do',
      '  if curl -fsS http://127.0.0.1:17800/healthz >/dev/null 2>&1; then',
      '    systemctl is-active --quiet blog-data.service blog-product.service',
      '    exit 0',
      '  fi',
      '  sleep 0.5',
      'done',
      'echo "healthz 超时" >&2; exit 1',
    ].join('\n'))),
    sshStep(config.host, config.port, '清理 staging', sudo(`rm -rf ${REMOTE_PATHS.staging}`)),
    sshStep(
      config.host,
      config.port,
      '保留最近 3 份发布包',
      `ls -1t "$HOME/${config.archiveRemoteDir}"/blog-release-*.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm -f`,
    ),
  ];
  for (const step of installSteps) {
    const code = await runStep(step, ports);
    if (code !== 0) return code;
  }
  ports.reporter.info(`部署完成:${config.host}(${config.serverName})`);
  return 0;
}

/** 把 ops CLI 打成单文件 JS,便于在任意有 Node 的机器执行。 */
export async function runDeployBundle(ports: DeployPorts, options: { dryRun: boolean }): Promise<number> {
  const entry = join(ports.root, 'ops', 'src', 'interface', 'cli.ts');
  const output = join(ports.root, 'deploy', 'dist', 'blog-deploy.mjs');
  const args = [
    'run',
    'nixpkgs#esbuild',
    '--',
    entry,
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node22',
    `--outfile=${output}`,
  ];
  if (options.dryRun) {
    ports.reporter.info(`nix ${args.join(' ')}`);
    return 0;
  }
  await ports.fs.mkdir(join(ports.root, 'deploy', 'dist'));
  const result = await ports.process.run('nix', args, ports.root);
  if (result.code !== 0) {
    ports.reporter.fail(`bundle 失败(exit ${result.code})`);
    ports.reporter.info((result.stderr || result.stdout).trim().slice(-2000));
    return 20;
  }
  ports.reporter.ok(`单文件脚本已生成:${output}`);
  return 0;
}
