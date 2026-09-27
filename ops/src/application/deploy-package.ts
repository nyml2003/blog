import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { ProcessPort, FsPort, Reporter } from '../domain/ports.ts';
import {
  RELEASE_BINARIES,
  packageSteps,
  releaseArchiveName,
  renderTemplate,
  type DeployConfig,
  type DeployStep,
  type ReleaseManifest,
} from '../domain/deploy-plan.ts';

export interface DeployPorts {
  process: ProcessPort;
  fs: FsPort;
  reporter: Reporter;
  root: string;
}

function requireFilePorts(fs: FsPort): Required<Pick<FsPort, 'write' | 'copy' | 'readBytes'>> {
  if (!fs.write || !fs.copy || !fs.readBytes) throw new Error('文件系统端口缺少 write/copy/readBytes');
  return { write: fs.write.bind(fs), copy: fs.copy.bind(fs), readBytes: fs.readBytes.bind(fs) };
}

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

function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** 构建并产出发布包;包内不含任何秘密。 */
export async function runDeployPackage(config: DeployConfig, ports: DeployPorts, options: { dryRun: boolean }): Promise<number> {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
  const archive = join(ports.root, 'deploy', 'dist', releaseArchiveName(config, stamp));
  const staging = join(ports.root, 'deploy', 'dist', '.staging');
  if (options.dryRun) {
    ports.reporter.info(`发布包将写入 ${archive}`);
    for (const step of packageSteps(config, ports.root, archive)) ports.reporter.info(`- ${step.label}`);
    return 0;
  }
  const fs = requireFilePorts(ports.fs);
  const [frontendStep, crossStep, tarStep] = packageSteps(config, ports.root, archive);
  for (const step of [frontendStep!, crossStep!]) {
    const code = await runStep(step, ports);
    if (code !== 0) return code;
  }

  try {
    await ports.process.run('rm', ['-rf', staging], ports.root);
    for (const dir of ['bin', 'web/dist', 'systemd', 'nginx']) await ports.fs.mkdir(join(staging, dir));
    const targetDir = join(ports.root, 'src', 'target', config.target, 'release');
    for (const name of RELEASE_BINARIES) {
      await fs.copy(join(targetDir, name), join(staging, 'bin', name));
    }
    const distRoot = join(ports.root, 'src', 'frontend', 'dist');
    for (const file of await ports.fs.files(distRoot)) {
      const relative = file.slice(distRoot.length + 1);
      await fs.copy(file, join(staging, 'web', 'dist', relative));
    }
    const values = { contentRepo: config.contentRepo, serverName: config.serverName };
    for (const unit of ['blog-data.service', 'blog-product.service']) {
      const source = await ports.fs.read(join(ports.root, 'deploy', 'systemd', unit));
      await fs.write(join(staging, 'systemd', unit), renderTemplate(source, values));
    }
    const nginxSource = await ports.fs.read(join(ports.root, 'deploy', 'nginx', 'blog.conf'));
    await fs.write(join(staging, 'nginx', 'blog.conf'), renderTemplate(nginxSource, values));

    const hashed = [
      ...RELEASE_BINARIES.map((name) => `bin/${name}`),
      'systemd/blog-data.service',
      'systemd/blog-product.service',
      'nginx/blog.conf',
    ];
    const sha256Map: Record<string, string> = {};
    for (const relative of hashed) {
      sha256Map[relative] = sha256(await fs.readBytes(join(staging, relative)));
    }
    const manifest: ReleaseManifest = {
      format: 1,
      target: config.target,
      serverName: config.serverName,
      contentRepo: config.contentRepo,
      createdAt: new Date().toISOString(),
      sha256: sha256Map,
    };
    await fs.write(join(staging, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const code = await runStep(tarStep, ports);
    if (code !== 0) return code;
    await ports.process.run('rm', ['-rf', staging], ports.root);
    ports.reporter.info(`上传到服务器:~/${config.archiveRemoteDir}/`);
    ports.reporter.info(`scp ${archive} ${config.host}:${config.archiveRemoteDir}/`);
    return 0;
  } catch (error) {
    ports.reporter.fail(`组装发布包失败:${error instanceof Error ? error.message : String(error)}`);
    return 20;
  }
}
