import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { ProcessPort, FsPort, Reporter } from '../domain/ports.ts';
import {
  RELEASE_BINARIES,
  RELEASE_NGINX,
  RELEASE_UNITS,
  packageStagingDir,
  packageSteps,
  releaseArchiveName,
  releaseArtifacts,
  type DeployTarget,
  type PackageStep,
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

async function runStep(step: PackageStep, ports: DeployPorts): Promise<number> {
  const result = await ports.process.run(step.command, [...step.args], step.cwd);
  if (result.code === 0) {
    ports.reporter.ok(step.label);
    return 0;
  }
  ports.reporter.fail(`${step.label}(exit ${result.code})`);
  const detail = (result.stderr || result.stdout).trim();
  if (detail) ports.reporter.info(detail.slice(-2000));
  return 20;
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
}

export function archivePath(root: string, target: DeployTarget): string {
  return join(root, 'deploy', 'dist', releaseArchiveName(target, stamp()));
}

/** 构建并产出环境无关的发布包;包内不含任何秘密或部署配置。 */
export async function runDeployPackage(target: DeployTarget, ports: DeployPorts, options: { dryRun: boolean }): Promise<number> {
  const archive = archivePath(ports.root, target);
  const staging = packageStagingDir(ports.root);
  const steps = packageSteps(target, ports.root, archive);
  if (options.dryRun) {
    ports.reporter.info(`发布包将写入 ${archive}`);
    for (const step of steps) ports.reporter.info(`- ${step.label}`);
    return 0;
  }
  const fs = requireFilePorts(ports.fs);
  for (const step of steps.slice(0, 2)) {
    const code = await runStep(step, ports);
    if (code !== 0) return code;
  }

  try {
    await ports.process.run('rm', ['-rf', staging], ports.root);
    for (const dir of ['bin', 'web/dist', 'systemd', 'nginx']) await ports.fs.mkdir(join(staging, dir));
    const targetDir = join(ports.root, 'src', 'target', target, 'release');
    for (const name of RELEASE_BINARIES) {
      await fs.copy(join(targetDir, name), join(staging, 'bin', name));
    }
    const distRoot = join(ports.root, 'src', 'frontend', 'dist');
    for (const file of await ports.fs.files(distRoot)) {
      const relative = file.slice(distRoot.length + 1);
      await fs.copy(file, join(staging, 'web', 'dist', relative));
    }
    for (const name of RELEASE_UNITS) {
      await fs.copy(join(ports.root, 'deploy', 'systemd', name), join(staging, 'systemd', name));
    }
    await fs.copy(join(ports.root, 'deploy', 'nginx', RELEASE_NGINX), join(staging, 'nginx', RELEASE_NGINX));
    await fs.copy(join(ports.root, 'deploy', 'install.sh'), join(staging, 'install.sh'));

    const artifacts = releaseArtifacts();
    const sha256Map: Record<string, string> = {};
    for (const relative of artifacts) {
      sha256Map[relative] = sha256(await fs.readBytes(join(staging, relative)));
    }
    await fs.write(
      join(staging, 'SHA256SUMS'),
      `${artifacts.map((relative) => `${sha256Map[relative]}  ${relative}`).join('\n')}\n`,
    );
    const manifest: ReleaseManifest = {
      format: 1,
      target,
      createdAt: new Date().toISOString(),
      sha256: sha256Map,
    };
    await fs.write(join(staging, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const code = await runStep(steps[2]!, ports);
    if (code !== 0) return code;
    await ports.process.run('rm', ['-rf', staging], ports.root);
    ports.reporter.info(`发布包:${archive}`);
    return 0;
  } catch (error) {
    ports.reporter.fail(`组装发布包失败:${error instanceof Error ? error.message : String(error)}`);
    return 20;
  }
}
