import type { ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';

export const RELEASE_KINDS = ['script', 'build', 'both'] as const;
export type ReleaseKind = (typeof RELEASE_KINDS)[number];
type ReleasePrefix = Exclude<ReleaseKind, 'both'>;

export interface ReleasePorts {
  process: ProcessPort;
  reporter: Reporter;
  root: string;
}

interface ReleaseOptions {
  dryRun: boolean;
  confirmed: boolean;
}

interface Version {
  major: number;
  minor: number;
  patch: number;
}

interface ReleasePlan {
  kind: ReleaseKind;
  tags: string[];
  sha: string;
  remote: string;
}

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const TAG_PATTERN = /^(script|build)-v(\d+)\.(\d+)\.(\d+)$/;
const TARGET_BRANCH = 'main';

function parseVersion(value: string): Version | undefined {
  const match = VERSION_PATTERN.exec(value);
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareVersion(left: Version, right: Version): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function nextVersion(tagsOutput: string, prefix: ReleasePrefix): string {
  let highest: Version = { major: 0, minor: 1, patch: -1 };
  for (const line of tagsOutput.split('\n')) {
    const match = TAG_PATTERN.exec(line.trim());
    if (!match || match[1] !== prefix) continue;
    const version = parseVersion(`${match[2]}.${match[3]}.${match[4]}`);
    if (version && compareVersion(version, highest) > 0) highest = version;
  }
  return `${prefix}-v${highest.major}.${highest.minor}.${highest.patch + 1}`;
}

async function git(ports: ReleasePorts, args: string[]) {
  return ports.process.run('git', args, ports.root);
}

async function checkCommand(ports: ReleasePorts, args: string[], failure: string): Promise<string | undefined> {
  const result = await git(ports, args);
  if (result.code !== 0) {
    ports.reporter.fail(`${failure}: ${result.stderr.trim() || `exit ${result.code}`}`);
    return undefined;
  }
  return result.stdout.trim();
}

async function buildPlan(kind: ReleaseKind, ports: ReleasePorts): Promise<ReleasePlan | undefined> {
  const status = await checkCommand(ports, ['status', '--porcelain'], '无法检查工作树');
  if (status === undefined) return undefined;
  if (status.length > 0) {
    ports.reporter.fail('工作树不干净，请先提交或暂存所有改动');
    return undefined;
  }

  const branch = await checkCommand(ports, ['branch', '--show-current'], '无法确定当前分支');
  if (branch === undefined) return undefined;
  if (branch !== TARGET_BRANCH) {
    ports.reporter.fail(`发布必须在 ${TARGET_BRANCH} 分支执行，当前为 ${branch || 'detached HEAD'}`);
    return undefined;
  }

  const sha = await checkCommand(ports, ['rev-parse', 'HEAD'], '无法确定当前提交');
  if (!sha) return undefined;
  const remote = await checkCommand(ports, ['remote', 'get-url', 'origin'], '无法确定 origin');
  if (!remote) return undefined;

  const prefixes: readonly ReleasePrefix[] = kind === 'both' ? ['script', 'build'] : [kind];
  const tags: string[] = [];
  for (const prefix of prefixes) {
    const existing = await checkCommand(ports, ['tag', '--list', `${prefix}-v*`], `无法读取 ${prefix} tag`);
    if (existing === undefined) return undefined;
    const tag = nextVersion(existing, prefix);
    const collision = await git(ports, ['rev-parse', '--verify', `refs/tags/${tag}`]);
    if (collision.code === 0) {
      ports.reporter.fail(`tag 已存在: ${tag}`);
      return undefined;
    }
    const remoteCollision = await git(ports, ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]);
    if (remoteCollision.code !== 0) {
      ports.reporter.fail(`无法检查远程 tag: ${tag}: ${remoteCollision.stderr.trim() || `exit ${remoteCollision.code}`}`);
      return undefined;
    }
    if (remoteCollision.stdout.trim().length > 0) {
      ports.reporter.fail(`远程 tag 已存在: ${tag}`);
      return undefined;
    }
    tags.push(tag);
  }
  return { kind, tags, sha, remote };
}

function workflowUrls(remote: string, kind: ReleaseKind): string[] {
  const match = /github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/.exec(remote);
  if (!match) return [];
  const workflows = kind === 'both' ? ['script-release.yml', 'build-release.yml'] : [`${kind}-release.yml`];
  return workflows.map((workflow) => `https://github.com/${match[1]}/${match[2]}/actions/workflows/${workflow}`);
}

export async function runRelease(kind: ReleaseKind, ports: ReleasePorts, options: ReleaseOptions): Promise<number> {
  ports.reporter.section(options.dryRun ? 'release dry-run' : 'release');
  const plan = await buildPlan(kind, ports);
  if (!plan) return 20;

  ports.reporter.info(`远程仓库: ${plan.remote}`);
  ports.reporter.info(`提交: ${plan.sha}`);
  ports.reporter.info(`将创建 tag: ${plan.tags.join(', ')}`);
  if (options.dryRun) return 0;
  if (!options.confirmed) {
    ports.reporter.fail('推送前需要显式确认，请重新执行并添加 --yes');
    return 10;
  }

  for (const tag of plan.tags) {
    const created = await git(ports, ['tag', tag, plan.sha]);
    if (created.code !== 0) {
      ports.reporter.fail(`创建 tag 失败: ${tag}: ${created.stderr.trim() || `exit ${created.code}`}`);
      return 20;
    }
  }
  const pushed = await git(ports, ['push', 'origin', ...plan.tags]);
  if (pushed.code !== 0) {
    ports.reporter.fail(`推送 tag 失败: ${pushed.stderr.trim() || `exit ${pushed.code}`}`);
    return 20;
  }
  ports.reporter.ok(`已推送 ${plan.tags.join(', ')}`);
  for (const url of workflowUrls(plan.remote, plan.kind)) ports.reporter.info(`GitHub Actions: ${url}`);
  ports.reporter.info('远程构建是异步的，请检查 Release 资产和下载结果');
  return 0;
}
