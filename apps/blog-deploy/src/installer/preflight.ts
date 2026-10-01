import { promises as dns } from 'node:dns';
import { connect as tcpConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import type { HttpKernel } from '@fluvient/core/http';
import type { Reporter } from './reporter.ts';

export interface PreflightCheck {
  readonly name: 'dns' | 'tcp' | 'tls' | 'api' | 'asset';
  readonly target: string;
  readonly status: 'ok' | 'failed';
  readonly detail: string;
  readonly ms: number;
}

export interface AssetProbeRequest {
  readonly label: string;
  readonly url: string;
}

export type AssetProbeResult = AssetProbeRequest & AssetProbe;

export interface AssetProbe {
  readonly url: string;
  readonly status: number;
  readonly contentLength: number | undefined;
  readonly contentType: string | undefined;
  readonly finalUrl: string;
  readonly method: 'HEAD' | 'RANGE';
}

export interface PreflightProbes {
  resolveDns(host: string): Promise<string[]>;
  connectTcp(host: string, port: number, timeoutMs: number): Promise<void>;
  tlsHandshake(host: string, port: number, timeoutMs: number): Promise<void>;
  probeAsset(url: string): Promise<AssetProbe>;
}

export interface PreflightPlan<T> {
  readonly apiHost: string;
  readonly apiPort: number;
  readonly probeTimeoutMs?: number;
  readonly resolveApi: () => Promise<T>;
  readonly assetsOf: (resolved: T) => readonly AssetProbeRequest[];
}

export interface PreflightReport<T> {
  readonly checks: readonly PreflightCheck[];
  readonly assetResults: readonly AssetProbeResult[];
  readonly resolved: T | undefined;
  readonly ok: boolean;
  readonly suggestion: string | undefined;
}

const PROBE_TIMEOUT_MS = 5_000;

function describeFailure(failure: { readonly kind: string }): string {
  return failure.kind === 'cancelled' ? '已取消' : (failure as { readonly message?: string }).message ?? failure.kind;
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label}超时(${timeoutMs}ms)`)), timeoutMs);
    }),
  ]);
}

export function createDefaultProbes(kernel: HttpKernel): PreflightProbes {
  return {
    async resolveDns(host) {
      try {
        return await dns.resolve4(host);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') throw new Error(`DNS 解析失败:${code}`);
        throw new Error(`DNS 解析失败:${detailOf(error)}`);
      }
    },
    connectTcp(host, port, timeoutMs) {
      return new Promise<void>((resolve, reject) => {
        const socket = tcpConnect({ host, port });
        const done = (error?: Error) => {
          socket.removeAllListeners();
          socket.destroy();
          if (error) reject(new Error(`TCP 连接失败:${error.message}`));
          else resolve();
        };
        socket.setTimeout(timeoutMs, () => done(new Error(`TCP 连接超时(${timeoutMs}ms)`)));
        socket.once('connect', () => done());
        socket.once('error', (error) => done(error));
      });
    },
    tlsHandshake(host, port, timeoutMs) {
      return new Promise<void>((resolve, reject) => {
        const socket = tlsConnect({ host, port, servername: host, rejectUnauthorized: true });
        const done = (error?: Error) => {
          socket.removeAllListeners();
          socket.destroy();
          if (error) reject(new Error(`TLS 握手失败:${error.message}`));
          else resolve();
        };
        socket.setTimeout(timeoutMs, () => done(new Error(`TLS 握手超时(${timeoutMs}ms)`)));
        socket.once('secureConnect', () => done());
        socket.once('error', (error) => done(error));
      });
    },
    async probeAsset(url) {
      const head = await kernel.request({ url, method: 'HEAD', headers: { 'user-agent': 'blog-deploy' }, timeouts: { headersMs: 15_000, totalMs: 20_000 } });
      if (!head.ok) throw new Error(`资产探测失败:${head.error.kind}:${describeFailure(head.error)}`);
      const headLength = head.value.contentLength;
      const headType = head.value.headers['content-type'];
      if (head.value.status >= 200 && head.value.status < 300 && head.value.status !== 405 && headLength !== undefined) {
        return { url, status: head.value.status, contentLength: headLength, contentType: headType, finalUrl: head.value.finalUrl, method: 'HEAD' };
      }
      const range = await kernel.request({
        url,
        headers: { 'user-agent': 'blog-deploy', range: 'bytes=0-0' },
        timeouts: { headersMs: 15_000, totalMs: 20_000 },
      });
      if (!range.ok) throw new Error(`资产探测失败:${range.error.kind}:${describeFailure(range.error)}`);
      if (range.value.status >= 300) throw new Error(`资产探测失败:HTTP ${range.value.status}`);
      await range.value.readText();
      const contentRange = range.value.headers['content-range'];
      const total = /^bytes\s+\d+-\d+\/(\d+)$/i.exec(contentRange ?? '');
      return {
        url,
        status: range.value.status,
        contentLength: total === null ? undefined : Number(total[1]),
        contentType: range.value.headers['content-type'],
        finalUrl: range.value.finalUrl,
        method: 'RANGE',
      };
    },
  };
}

export function suggestionFor(check: PreflightCheck): string | undefined {
  if (check.name === 'dns') return '检查服务器 DNS 配置(/etc/resolv.conf)或网络出口';
  if (check.name === 'tcp') return '检查防火墙/安全组是否放行 443 出口';
  if (check.name === 'tls') return '检查系统时间、CA 证书或代理的 TLS 拦截设置';
  if (check.name === 'api') {
    if (check.detail.includes('429')) return 'GitHub API 限流,稍后重试';
    if (check.detail.includes('404')) return '确认 Release 仓库存在且公开可见';
    if (check.detail.includes('HTTP 5')) return 'GitHub 服务异常,稍后重试';
    return '检查到 api.github.com 的网络与代理配置';
  }
  if (check.detail.includes('404')) return 'Release 缺少该资产,确认 tag 与资产名';
  if (check.detail.includes('429')) return '下载被限流,稍后重试';
  return '下载 CDN 不可达,稍后重试或检查代理';
}

export async function runPreflight<T>(
  plan: PreflightPlan<T>,
  probes: PreflightProbes,
  reporter: Reporter,
): Promise<PreflightReport<T>> {
  const timeoutMs = plan.probeTimeoutMs ?? PROBE_TIMEOUT_MS;
  const checks: PreflightCheck[] = [];
  const timed = async (name: PreflightCheck['name'], target: string, run: () => Promise<string>): Promise<boolean> => {
    const startedAt = Date.now();
    try {
      const detail = await run();
      const check: PreflightCheck = { name, target, status: 'ok', detail, ms: Date.now() - startedAt };
      checks.push(check);
      reporter.stage('preflight_check', `${labelOf(name)} ${target}:${detail}`, { ...check });
      return true;
    } catch (error) {
      const check: PreflightCheck = { name, target, status: 'failed', detail: detailOf(error), ms: Date.now() - startedAt };
      checks.push(check);
      reporter.stage('preflight_check', `${labelOf(name)} ${target}:失败(${check.detail})`, { ...check });
      return false;
    }
  };

  let resolved: T | undefined;
  let apiPassed = false;
  let assetResults: AssetProbeResult[] = [];

  const dnsOk = await timed('dns', plan.apiHost, async () => (await probes.resolveDns(plan.apiHost)).join(', '));
  if (!dnsOk) {
    const failed = checks[checks.length - 1]!;
    return { checks, assetResults, resolved: undefined, ok: false, suggestion: suggestionFor(failed) };
  }
  if (!(await timed('tcp', `${plan.apiHost}:${plan.apiPort}`, () => probes.connectTcp(plan.apiHost, plan.apiPort, timeoutMs).then(() => '可连接')))) {
    const failed = checks[checks.length - 1]!;
    return { checks, assetResults, resolved: undefined, ok: false, suggestion: suggestionFor(failed) };
  }
  if (!(await timed('tls', `${plan.apiHost}:${plan.apiPort}`, () => probes.tlsHandshake(plan.apiHost, plan.apiPort, timeoutMs).then(() => '证书校验通过')))) {
    const failed = checks[checks.length - 1]!;
    return { checks, assetResults, resolved: undefined, ok: false, suggestion: suggestionFor(failed) };
  }

  apiPassed = await timed('api', `https://${plan.apiHost}/repos/.../releases`, async () => {
    resolved = await plan.resolveApi();
    return 'Release 列表解析成功';
  });
  if (!apiPassed) {
    const failed = checks[checks.length - 1]!;
    return { checks, assetResults, resolved: undefined, ok: false, suggestion: suggestionFor(failed) };
  }

  const assets = plan.assetsOf(resolved as T);
  const assetChecks = await Promise.all(
    assets.map(async (asset) => {
      const okProbe = await timed('asset', asset.label, async () => {
        const result = await withTimeout(probes.probeAsset(asset.url), timeoutMs * 3, asset.label);
        assetResults = [...assetResults, { ...result, label: asset.label }];
        return `HTTP ${result.status}(${result.method})${result.contentLength === undefined ? ',大小未知' : `,大小 ${result.contentLength} 字节`}`;
      });
      return okProbe;
    }),
  );
  if (assetChecks.some((passed) => !passed)) {
    const failed = checks.find((check) => check.status === 'failed' && check.name === 'asset')!;
    return { checks, assetResults, resolved, ok: false, suggestion: suggestionFor(failed) };
  }
  return { checks, assetResults, resolved, ok: true, suggestion: undefined };
}

function labelOf(name: PreflightCheck['name']): string {
  if (name === 'dns') return 'DNS 解析';
  if (name === 'tcp') return 'TCP 连接';
  if (name === 'tls') return 'TLS 握手';
  if (name === 'api') return 'Release API';
  return '资产可达';
}

