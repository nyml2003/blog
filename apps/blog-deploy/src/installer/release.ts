/** 公开 Release 的解析、下载与校验(服务器侧无需 token)。 */
import { createHash } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CancellationFailure } from '@fluvient/core';
import { httpStatusError, withHttpRetry, type HttpError, type HttpKernel, type HttpRetryPolicy } from '@fluvient-loom/web-http';
import { compareBuildVersion, parseBuildVersion, parseScriptVersion, type BuildVersion } from './version.ts';
import type { Reporter } from './reporter.ts';

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
export type FetchLike = typeof fetch;

export const API_TIMEOUTS = { headersMs: 15_000, totalMs: 30_000 } as const;
export const DOWNLOAD_TIMEOUTS = { headersMs: 30_000, bodyIdleMs: 60_000 } as const;
export const DOWNLOAD_RETRY: HttpRetryPolicy = { maxAttempts: 3, initialDelayMs: 1_000, maxDelayMs: 8_000 };

export type KernelFailure = HttpError | CancellationFailure;

export function isHttpFailure(failure: KernelFailure): failure is HttpError {
  return failure.kind !== 'cancelled';
}

export class TransportFailure extends Error {
  readonly failure: KernelFailure;
  constructor(failure: KernelFailure) {
    super(failure.kind === 'cancelled' ? '传输已取消' : failure.message);
    this.failure = failure;
    this.name = 'TransportFailure';
  }
}

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

export function releasesApiUrl(repo: string): string {
  return `https://api.github.com/repos/${repo}/releases?per_page=100`;
}

export async function fetchReleases(repo: string, kernel: HttpKernel): Promise<BuildRelease[]> {
  const url = releasesApiUrl(repo);
  let text: string;
  try {
    const response = await kernel.request({
      url,
      headers: { 'user-agent': 'blog-deploy', accept: 'application/vnd.github+json' },
      timeouts: API_TIMEOUTS,
    });
    if (!response.ok) throw new TransportFailure(response.error);
    if (response.value.status !== 200) throw new TransportFailure(httpStatusError(response.value.status, url));
    text = await response.value.readText();
  } catch (error) {
    if (error instanceof TransportFailure) throw error;
    throw new TransportFailure({ kind: 'transport', message: `Release API 响应无法读取:${String(error)}`, retryable: false });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new TransportFailure({ kind: 'transport', message: 'Release API 响应不是合法 JSON', retryable: false });
  }
  if (!Array.isArray(payload)) throw new TransportFailure({ kind: 'transport', message: 'Release API 响应格式异常', retryable: false });
  return payload.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { tag_name: tagName, draft, prerelease, assets } = entry as Record<string, unknown>;
    if (typeof tagName !== 'string' || !Array.isArray(assets)) return [];
    return [
      {
        tag: tagName,
        ...(draft === true ? { draft: true } : {}),
        ...(prerelease === true ? { prerelease: true } : {}),
        assets: assets.flatMap((asset) => {
          if (typeof asset !== 'object' || asset === null) return [];
          const { name, browser_download_url: downloadUrl } = asset as Record<string, unknown>;
          return typeof name === 'string' && typeof downloadUrl === 'string' ? [{ name, url: downloadUrl }] : [];
        }),
      },
    ];
  });
}

export interface DownloadOptions {
  readonly kernel: HttpKernel;
  readonly reporter?: Reporter;
  readonly retry?: HttpRetryPolicy;
  readonly totalMs?: number;
}

export async function downloadAsset(
  asset: ReleaseAsset,
  dest: string,
  options: DownloadOptions,
): Promise<{ readonly bytes: number; readonly elapsedMs: number }> {
  const retry = options.retry ?? DOWNLOAD_RETRY;
  const startedAt = Date.now();
  const response = await withHttpRetry(
    async () => {
      const attempt = await options.kernel.request({
        url: asset.url,
        headers: { 'user-agent': 'blog-deploy' },
        timeouts: { ...DOWNLOAD_TIMEOUTS, ...(options.totalMs === undefined ? {} : { totalMs: options.totalMs }) },
      });
      if (attempt.ok && attempt.value.status !== 200) {
        return { ok: false as const, error: httpStatusError(attempt.value.status, asset.url) };
      }
      return attempt;
    },
    retry,
    {
      onRetry: ({ attempt, delayMs, error }) =>
        options.reporter?.downloadRetry(attempt, delayMs, `${error.kind}${error.status === undefined ? '' : ` ${error.status}`}`),
    },
  );
  if (!response.ok) throw new TransportFailure(response.error);
  const { contentLength, status } = response.value;
  if (status !== 200) throw new TransportFailure(httpStatusError(status, asset.url));
  options.reporter?.downloadStarted(asset.name, contentLength);
  const handle = await open(dest, 'w', 0o600);
  let bytes = 0;
  try {
    const final = await response.value.readStream(async (chunk, info) => {
      await handle.write(chunk);
      bytes = info.received;
      options.reporter?.downloadProgress(info.received, info.total);
    });
    bytes = final.received;
  } finally {
    await handle.close();
  }
  const elapsedMs = Date.now() - startedAt;
  options.reporter?.downloadCompleted(bytes, elapsedMs);
  return { bytes, elapsedMs };
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
