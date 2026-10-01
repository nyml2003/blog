import type { OutputPort } from '@fluvient-cli/cli-kit/output.ts';

export type DeployEventName =
  | 'release_resolved'
  | 'network_preflight_started'
  | 'preflight_check'
  | 'network_preflight_completed'
  | 'download_started'
  | 'download_progress'
  | 'download_retry'
  | 'download_completed'
  | 'checksum_started'
  | 'checksum_completed'
  | 'install_started'
  | 'install_step'
  | 'healthcheck_completed'
  | 'deployment_completed'
  | 'deployment_failed'
  | 'installer_updated'
  | 'dry_run_report';

export interface ReporterDeps {
  readonly output: OutputPort;
  readonly json: boolean;
  readonly tty: boolean;
  readonly stdout?: { write(text: string): void };
  readonly now?: () => number;
}

interface Sample {
  readonly at: number;
  readonly received: number;
}

const SOURCE = 'blog-deploy';
const PROGRESS_EVENT_INTERVAL_MS = 1_000;
const BAR_INTERVAL_MS = 100;
const SPEED_WINDOW_MS = 2_000;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

export interface Reporter {
  stage(event: DeployEventName, text: string, data?: Readonly<Record<string, unknown>>): void;
  warn(text: string, data?: Readonly<Record<string, unknown>>): void;
  fail(text: string, data?: Readonly<Record<string, unknown>>): void;
  downloadStarted(asset: string, total: number | undefined): void;
  downloadProgress(received: number, total: number | undefined): void;
  downloadRetry(attempt: number, delayMs: number, reason: string): void;
  downloadCompleted(bytes: number, elapsedMs: number): void;
}

export function createReporter(deps: ReporterDeps): Reporter {
  const output = deps.output;
  const json = deps.json;
  const tty = deps.tty && !json;
  const stdout = deps.stdout ?? process.stdout;
  const now = deps.now ?? Date.now;
  let barActive = false;
  let barWidth = 0;
  let assetName = '';
  let startedAt = 0;
  let totalBytes: number | undefined;
  let lastEventAt = 0;
  let lastBarAt = 0;
  let samples: Sample[] = [];

  const emit = (
    event: DeployEventName,
    text: string,
    data: Readonly<Record<string, unknown>>,
    level: 'info' | 'warn' | 'error',
    channel: 'stdout' | 'stderr',
  ): void => {
    output.log({
      level,
      source: SOURCE,
      channel,
      message: { key: event, params: { message: text } },
      data: { event, ...data },
    });
  };

  const clearBar = (): void => {
    if (!barActive) return;
    stdout.write(`\r${' '.repeat(barWidth)}\r`);
    barActive = false;
  };

  const speed = (at: number): number | undefined => {
    samples = samples.filter((sample) => at - sample.at <= SPEED_WINDOW_MS);
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (!first || !last || first === last) return undefined;
    const dt = (last.at - first.at) / 1000;
    if (dt <= 0) return undefined;
    return (last.received - first.received) / dt;
  };

  const renderBar = (received: number, at: number): void => {
    const elapsed = formatDuration(at - startedAt);
    const rate = speed(at);
    const rateText = rate === undefined ? '计算中' : `${formatBytes(rate)}/s`;
    let line: string;
    if (totalBytes !== undefined && totalBytes > 0) {
      const percent = Math.min(100, Math.floor((received / totalBytes) * 100));
      const filled = Math.round((percent / 100) * 30);
      line = `⇣ ${assetName} ${percent}% [${'='.repeat(filled)}${'·'.repeat(30 - filled)}] ${formatBytes(received)}/${formatBytes(totalBytes)} · ${rateText} · ${elapsed}`;
    } else {
      line = `⇣ ${assetName} ${formatBytes(received)} · ${rateText} · ${elapsed}(总量未知)`;
    }
    barWidth = Math.max(line.length + 1, barWidth);
    stdout.write(`\r${line.padEnd(barWidth, ' ')}`);
    barActive = true;
  };

  return {
    stage(event, text, data = {}) {
      clearBar();
      emit(event, text, data, 'info', 'stdout');
    },
    warn(text, data = {}) {
      clearBar();
      emit('install_step', text, { ...data, severity: 'warn' }, 'warn', 'stderr');
    },
    fail(text, data = {}) {
      clearBar();
      emit('install_step', text, { ...data, severity: 'error' }, 'error', 'stderr');
    },
    downloadStarted(asset, total) {
      assetName = asset;
      totalBytes = total;
      startedAt = now();
      lastEventAt = startedAt;
      lastBarAt = 0;
      samples = [];
      emit('download_started', `开始下载 ${asset}`, { asset, total }, 'info', 'stdout');
    },
    downloadProgress(received, total) {
      totalBytes = total;
      const at = now();
      samples.push({ at, received });
      if (at - lastEventAt >= PROGRESS_EVENT_INTERVAL_MS) {
        lastEventAt = at;
        const rate = speed(at);
        emit(
          'download_progress',
          `已下载 ${formatBytes(received)}${total !== undefined ? `/${formatBytes(total)}` : ''}`,
          {
            asset: assetName,
            received,
            ...(total !== undefined ? { total } : {}),
            ...(rate !== undefined ? { bytesPerSecond: Math.round(rate) } : {}),
            elapsedMs: at - startedAt,
          },
          'info',
          'stdout',
        );
      }
      if (tty && at - lastBarAt >= BAR_INTERVAL_MS) {
        lastBarAt = at;
        renderBar(received, at);
      }
    },
    downloadRetry(attempt, delayMs, reason) {
      clearBar();
      samples = [];
      emit(
        'download_retry',
        `下载中断(${reason}),${delayMs}ms 后第 ${attempt + 1} 次重试`,
        { attempt, delayMs, reason },
        'warn',
        'stderr',
      );
    },
    downloadCompleted(bytes, elapsedMs) {
      clearBar();
      emit(
        'download_completed',
        `下载完成 ${formatBytes(bytes)},用时 ${formatDuration(elapsedMs)}`,
        { bytes, elapsedMs },
        'info',
        'stdout',
      );
    },
  };
}
