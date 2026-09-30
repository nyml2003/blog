import type { OutputEvent, OutputLogEvent, OutputPort } from '@fluvient-cli/cli-kit/output.ts';
import { outputPayload } from '@fluvient-cli/cli-kit/output.ts';

export class ConsoleOutputPort implements OutputPort {
  private json: boolean;
  constructor(json = false) { this.json = json; }
  get jsonMode(): boolean { return this.json; }
  setJson(json: boolean): void { this.json = json; }
  emit(event: OutputEvent): void {
    const safeEvent = sanitizeEvent(event);
    if (safeEvent.kind === 'telemetry') return;
    if (this.json) {
      const payload = JSON.stringify(outputPayload(safeEvent));
      if (safeEvent.kind === 'log' && safeEvent.channel === 'stderr') console.error(payload);
      else console.log(payload);
      return;
    }
    if (safeEvent.kind === 'result') {
      const text = `[ops] ${safeEvent.status} ${safeEvent.code} (${safeEvent.exitCode})`;
      if (safeEvent.status === 'failure') console.error(text); else console.log(text);
      return;
    }
    if (safeEvent.kind === 'lifecycle') return;
    const text = render(safeEvent);
    if (safeEvent.message.key === 'help' || safeEvent.message.key === 'version') { console.log(text); return; }
    if (safeEvent.message.key === 'hint') { console.error(text); return; }
    if (safeEvent.channel === 'stderr') console.error(`[${safeEvent.source}] ${text}`); else console.log(`[${safeEvent.source}] ${text}`);
  }
  log(event: Omit<Extract<OutputEvent, { kind: 'log' }>, 'kind'>): void { this.emit({ kind: 'log', ...event }); }
  result(event: Omit<Extract<OutputEvent, { kind: 'result' }>, 'kind'>): void { this.emit({ kind: 'result', ...event }); }
  telemetry(event: Omit<Extract<OutputEvent, { kind: 'telemetry' }>, 'kind'>): void { this.emit({ kind: 'telemetry', ...event }); }
  lifecycle(event: Omit<Extract<OutputEvent, { kind: 'lifecycle' }>, 'kind'>): void { this.emit({ kind: 'lifecycle', ...event }); }
}

const SENSITIVE_KEY = /(token|password|secret|private.?key|cookie|authorization|credential)/i;
const MAX_OUTPUT_TEXT = 2000;

function sanitizeEvent(event: OutputEvent): OutputEvent {
  if (event.kind === 'log') {
    return {
      ...event,
      message: sanitizeObject(event.message) as OutputLogEvent['message'],
      data: event.data === undefined ? undefined : sanitizeObject(event.data) as Readonly<Record<string, unknown>>,
    };
  }
  if (event.data === undefined) return event;
  return { ...event, data: sanitizeObject(event.data) as Readonly<Record<string, unknown>> };
}

function sanitizeObject(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    const redacted = value.replace(/((?:token|password|secret|private[ _-]?key|cookie|authorization|credential)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
    return redacted.length > MAX_OUTPUT_TEXT ? `${redacted.slice(0, MAX_OUTPUT_TEXT)}...[truncated]` : redacted;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeObject(item));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, sanitizeObject(item, name)]));
  }
  return value;
}

function render(event: Extract<OutputEvent, { kind: 'log' }>): string {
  const params = event.message.params ?? {};
  if (event.message.key === 'section') return `-- ${params.title ?? ''} --`;
  if (event.message.key === 'ok') return `OK ${params.message ?? ''}`;
  if (event.message.key === 'fail') return `FAIL ${params.message ?? ''}`;
  if (event.message.key === 'help' || event.message.key === 'version' || event.message.key === 'hint') return String(params.message ?? '');
  return String(params.message ?? event.message.key);
}
