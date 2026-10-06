import { err, ok, type Result } from '@fluvient/core';
import type { ProcessPort, FsPort, HashPort, PathPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import { effectFailure, reversibleEffect, reportPlan, type EffectFailure, type EffectPort } from '@fluvient-cli/cli-kit/effects.ts';
import { EXIT_FAILURE, EXIT_OK } from '@fluvient-cli/cli-kit/errors.ts';
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
} from './deploy-plan.ts';

export interface DeployPorts {
  process: ProcessPort;
  fs: FsPort;
  path: PathPort;
  hash: HashPort;
  reporter: Reporter;
  root: string;
  effects: EffectPort;
}

function requireFilePorts(fs: FsPort): Required<Pick<FsPort, 'write' | 'copy' | 'readBytes'>> {
  if (!fs.write || !fs.copy || !fs.readBytes) throw new Error('文件系统端口缺少 write/copy/readBytes');
  return { write: fs.write.bind(fs), copy: fs.copy.bind(fs), readBytes: fs.readBytes.bind(fs) };
}

// 失败输出保留末尾 12000 字符:链接器/编译器错误通常在 stderr 尾部,
// 2000 字符会把 undefined symbol 等关键行截掉,导致 CI 上无法定位。
const FAILURE_DETAIL_CHARS = 12_000;

function reportFailureDetail(ports: DeployPorts, output: string): void {
  const detail = output.trim();
  if (!detail) return;
  for (const line of detail.slice(-FAILURE_DETAIL_CHARS).split('\n')) {
    ports.reporter.info(line);
  }
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
}

export function archivePath(path: PathPort, root: string, target: DeployTarget): string {
  return path.join(root, 'deploy', 'dist', releaseArchiveName(target, stamp()));
}

function stepEffect(ports: DeployPorts, step: PackageStep) {
  return reversibleEffect<void, EffectFailure>({
    describe: () => ({ summary: step.label }),
    execute: async (): Promise<Result<void, EffectFailure>> => {
      // 工具链走 nix develop 时,命令本身需要完整环境;失败详情原样保留留给人工定位。
      const result = await ports.process.run(step.command, [...step.args], step.cwd);
      if (result.code === EXIT_OK) {
        ports.reporter.ok(step.label);
        return ok(undefined);
      }
      ports.reporter.fail(`${step.label}(exit ${result.code})`);
      reportFailureDetail(ports, result.stderr || result.stdout);
      return err(effectFailure(`${step.label}(exit ${result.code})`));
    },
  });
}

function assembleEffect(ports: DeployPorts, target: DeployTarget, archive: string) {
  // 批量等待互相独立的文件操作；显式 `Promise<void>` 注解表明这些调用没有可读的返回值。
  const applyAll = (operations: readonly Promise<unknown>[]): Promise<void> => Promise.all(operations).then(() => undefined);
  return reversibleEffect<void, EffectFailure>({
    describe: () => ({ summary: `组装发布包 ${archive.split('/').pop()}` }),
    execute: async (): Promise<Result<void, EffectFailure>> => {
      const fs = requireFilePorts(ports.fs);
      const { path } = ports;
      const staging = packageStagingDir(ports.root);
      try {
        const cleaned = await ports.process.run('rm', ['-rf', staging], ports.root);
        if (cleaned.code !== EXIT_OK) return err(effectFailure(`清理 staging 失败(exit ${cleaned.code})`));
        const targetDir = path.join(ports.root, 'src', 'target', target, 'release');
        const distRoot = path.join(ports.root, 'src', 'frontend', 'dist');
        const distFiles = await ports.fs.files(distRoot);
        await applyAll([
          ...['bin', 'web/dist', 'systemd', 'nginx'].map((dir) => ports.fs.mkdir(path.join(staging, dir))),
          ...RELEASE_BINARIES.map((name) => fs.copy(path.join(targetDir, name), path.join(staging, 'bin', name))),
          ...distFiles.map((file) => fs.copy(file, path.join(staging, 'web', 'dist', file.slice(distRoot.length + 1)))),
          ...RELEASE_UNITS.map((name) => fs.copy(path.join(ports.root, 'deploy', 'systemd', name), path.join(staging, 'systemd', name))),
          fs.copy(path.join(ports.root, 'deploy', 'nginx', RELEASE_NGINX), path.join(staging, 'nginx', RELEASE_NGINX)),
        ]);

        const artifacts = releaseArtifacts();
        const sha256Map: Record<string, string> = {};
        for (const relative of artifacts) {
          sha256Map[relative] = ports.hash.sha256(await fs.readBytes(path.join(staging, relative)));
        }
        const manifest: ReleaseManifest = {
          format: 1,
          target,
          createdAt: new Date().toISOString(),
          sha256: sha256Map,
        };
        await applyAll([
          fs.write(path.join(staging, 'SHA256SUMS'), `${artifacts.map((relative) => `${sha256Map[relative]}  ${relative}`).join('\n')}\n`),
          fs.write(path.join(staging, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`),
        ]);
        return ok(undefined);
      } catch (error) {
        ports.reporter.fail(`组装发布包失败:${error instanceof Error ? error.message : String(error)}`);
        return err(effectFailure('组装发布包失败'));
      }
    },
  });
}

/** 构建并产出环境无关的发布包;包内不含任何秘密或部署配置。 */
export async function runDeployPackage(target: DeployTarget, ports: DeployPorts): Promise<number> {
  const archive = archivePath(ports.path, ports.root, target);
  const steps = packageSteps(target, ports.root, archive);

  for (const step of [steps[0]!, steps[1]!]) {
    const built = await ports.effects.run(stepEffect(ports, step), undefined);
    if (!built.ok) return EXIT_FAILURE;
  }
  const assembled = await ports.effects.run(assembleEffect(ports, target, archive), undefined);
  if (!assembled.ok) return EXIT_FAILURE;
  const packed = await ports.effects.run(stepEffect(ports, steps[2]!), undefined);
  if (!packed.ok) return EXIT_FAILURE;

  reportPlan(ports.effects, ports.reporter);
  ports.reporter.info(`发布包:${archive}`);
  return EXIT_OK;
}
