/** 公开 Release 的解析、下载与校验(服务器侧无需 token)。 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compareBuildVersion, parseBuildVersion, parseScriptVersion, type BuildVersion } from './version.ts';

export interface ReleaseAsset {
  readonly name: string;
  readonly url: string;
}
export interface BuildRelease {
  readonly tag: string;
  readonly assets: readonly ReleaseAsset[];
  readonly draft?: boolean;
  readonly prerelease?: boolean;
}
export type ScriptRelease = BuildRelease;
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

export function pickBuildRelease(releases: readonly BuildRelease[]): BuildRelease {
  const candidates = releases
    .filter((release) => !release.draft && !release.prerelease)
    .filter((release) => parseBuildVersion(release.tag) !== undefined);
  if (candidates.length === 0) throw new Error('仓库里还没有 build-v* Release');
  return candidates.reduce((best, next) => {
    const bestVersion = parseBuildVersion(best.tag)!;
    const nextVersion = parseBuildVersion(next.tag)!;
    return compareBuildVersion(nextVersion, bestVersion) > 0 ? next : best;
  });
}

export function pickScriptRelease(releases: readonly ScriptRelease[]): ScriptRelease {
  const candidates = releases
    .filter((release) => !release.draft && !release.prerelease)
    .filter((release) => parseScriptVersion(release.tag) !== undefined);
  if (candidates.length === 0) throw new Error('仓库里还没有 script-v* Release');
  return candidates.reduce((best, next) => {
    const bestVersion = parseScriptVersion(best.tag) as BuildVersion;
    const nextVersion = parseScriptVersion(next.tag) as BuildVersion;
    return compareBuildVersion(nextVersion, bestVersion) > 0 ? next : best;
  });
}

export function pickScriptAsset(release: ScriptRelease): ReleaseAsset {
  const asset = release.assets.find((entry) => entry.name === 'blog-deploy.mjs');
  if (!asset) throw new Error(`Release ${release.tag} 缺少 blog-deploy.mjs 资产`);
  return asset;
}

export function pickChecksumAsset(release: ScriptRelease): ReleaseAsset {
  const asset = release.assets.find((entry) => entry.name === 'SHA256SUMS');
  if (!asset) throw new Error(`Release ${release.tag} 缺少 SHA256SUMS 资产`);
  return asset;
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
    draft?: boolean;
    prerelease?: boolean;
    assets?: Array<{ name?: string; browser_download_url?: string }>;
  }>;
  return payload.flatMap((entry) =>
    entry.tag_name && Array.isArray(entry.assets)
      ? [
          {
            tag: entry.tag_name,
            ...(entry.draft ? { draft: true } : {}),
            ...(entry.prerelease ? { prerelease: true } : {}),
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
    if (!/^[a-f0-9]{64}$/.test(hash) || path.startsWith('/') || path.split('/').includes('..')) throw new Error(`SHA256SUMS 路径或摘要非法:${line}`);
    const actual = createHash('sha256').update(await readFile(join(directory, path))).digest('hex');
    if (actual !== hash) throw new Error(`校验失败:${path}`);
  }
}

export async function verifyAssetChecksum(file: string, checksumFile: string, assetName: string): Promise<void> {
  const lines = (await readFile(checksumFile, 'utf8')).trim().split('\n');
  const entry = lines.map((line) => line.trim().split(/\s+/)).find((parts) => parts[1] === assetName);
  if (!entry || !entry[0] || !/^[a-f0-9]{64}$/.test(entry[0])) throw new Error(`SHA256SUMS 缺少 ${assetName} 或格式非法`);
  const actual = createHash('sha256').update(await readFile(file)).digest('hex');
  if (actual !== entry[0]) throw new Error(`校验失败:${assetName}`);
}
