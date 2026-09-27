/** 公开 Release 的解析、下载与校验(服务器侧无需 token)。 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ReleaseAsset {
  readonly name: string;
  readonly url: string;
}
export interface BuildRelease {
  readonly tag: string;
  readonly assets: readonly ReleaseAsset[];
}
export type FetchLike = (input: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export function targetForArch(arch: string): string {
  if (arch === 'arm64') return 'aarch64-unknown-linux-musl';
  if (arch === 'x64') return 'x86_64-unknown-linux-musl';
  throw new Error(`不支持的架构:${arch}(仅支持 x64 / arm64)`);
}

function semverOf(tag: string): readonly [number, number, number] | undefined {
  const match = /^build-v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function newer(left: string, right: string): boolean {
  const a = semverOf(left);
  const b = semverOf(right);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) {
    if (a[index]! !== b[index]!) return a[index]! > b[index]!;
  }
  return false;
}

export function pickBuildRelease(releases: readonly BuildRelease[], buildTag?: string): BuildRelease {
  if (buildTag) {
    const exact = releases.find((release) => release.tag === buildTag);
    if (!exact) throw new Error(`找不到 Release ${buildTag}`);
    return exact;
  }
  const candidates = releases.filter((release) => semverOf(release.tag) !== undefined);
  if (candidates.length === 0) throw new Error('仓库里还没有 build-v* Release');
  return candidates.reduce((best, next) => (newer(next.tag, best.tag) ? next : best));
}

export function pickAsset(release: BuildRelease, target: string): ReleaseAsset {
  const asset = release.assets.find((entry) => entry.name.includes(target) && entry.name.endsWith('.tar.gz'));
  if (!asset) throw new Error(`Release ${release.tag} 缺少 ${target} 资产`);
  return asset;
}

export async function fetchReleases(repo: string, fetchImpl: FetchLike): Promise<BuildRelease[]> {
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
    headers: { 'user-agent': 'blog-deploy', accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`GitHub API 返回 ${response.status}`);
  const payload = (await response.json()) as Array<{
    tag_name?: string;
    assets?: Array<{ name?: string; browser_download_url?: string }>;
  }>;
  return payload.flatMap((entry) =>
    entry.tag_name && Array.isArray(entry.assets)
      ? [
          {
            tag: entry.tag_name,
            assets: entry.assets.flatMap((asset) =>
              asset.name && asset.browser_download_url
                ? [{ name: asset.name, url: asset.browser_download_url }]
                : [],
            ),
          },
        ]
      : [],
  );
}

export async function downloadAsset(asset: ReleaseAsset, dest: string, fetchImpl: FetchLike): Promise<void> {
  const response = await fetchImpl(asset.url, { headers: { 'user-agent': 'blog-deploy' } });
  if (!response.ok) throw new Error(`下载 ${asset.name} 失败:HTTP ${response.status}`);
  await writeFile(dest, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
}

export async function verifyChecksums(directory: string, checksumFile: string): Promise<void> {
  const lines = (await readFile(checksumFile, 'utf8')).trim().split('\n');
  if (lines.length === 0) throw new Error('SHA256SUMS 为空');
  for (const line of lines) {
    const [hash, path] = line.trim().split(/\s+/);
    if (!hash || !path) throw new Error(`SHA256SUMS 格式错误:${line}`);
    const actual = createHash('sha256').update(await readFile(join(directory, path))).digest('hex');
    if (actual !== hash) throw new Error(`校验失败:${path}`);
  }
}
