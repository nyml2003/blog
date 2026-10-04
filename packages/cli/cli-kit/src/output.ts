export type OutputLevel = 'debug' | 'info' | 'warn' | 'error';
export type OutputChannel = 'stdout' | 'stderr';
export const OUTPUT_SCHEMA_VERSION = 1;
import { EXIT_OK } from './errors.ts';

export interface OutputLogEvent {
  readonly kind: 'log';
  readonly level: OutputLevel;
  readonly source: string;
  readonly channel: OutputChannel;
  readonly message: { readonly key: string; readonly params?: Readonly<Record<string, string | number | boolean>> };
  readonly data?: Readonly<Record<string, unknown>>;
}
export interface OutputResultEvent {
  readonly kind: 'result';
  readonly status: 'success' | 'failure' | 'skipped';
  readonly command: string;
  readonly exitCode: number;
  readonly code: string;
  readonly data?: Readonly<Record<string, unknown>>;
}
export interface OutputTelemetryEvent {
  readonly kind: 'telemetry';
  readonly name: string;
  readonly data: Readonly<Record<string, unknown>>;
}
export interface OutputLifecycleEvent {
  readonly kind: 'lifecycle';
  readonly command: string;
  readonly event: 'services_ready' | 'dry_run';
  readonly data: Readonly<Record<string, unknown>>;
}
export type OutputEvent = OutputLogEvent | OutputResultEvent | OutputTelemetryEvent | OutputLifecycleEvent;
export interface OutputPort {
  setJson(json: boolean): void;
  emit(event: OutputEvent): void;
  log(event: Omit<OutputLogEvent, 'kind'>): void;
  result(event: Omit<OutputResultEvent, 'kind'>): void;
  telemetry(event: Omit<OutputTelemetryEvent, 'kind'>): void;
  lifecycle(event: Omit<OutputLifecycleEvent, 'kind'>): void;
}
export class NullOutputPort implements OutputPort {
  setJson(_json: boolean): void {}
  emit(_event: OutputEvent): void {}
  log(_event: Omit<OutputLogEvent, 'kind'>): void {}
  result(_event: Omit<OutputResultEvent, 'kind'>): void {}
  telemetry(_event: Omit<OutputTelemetryEvent, 'kind'>): void {}
  lifecycle(_event: Omit<OutputLifecycleEvent, 'kind'>): void {}
}
export class CaptureOutputPort implements OutputPort {
  readonly events: OutputEvent[] = [];
  setJson(_json: boolean): void {}
  emit(event: OutputEvent): void { this.events.push(event); }
  log(event: Omit<OutputLogEvent, 'kind'>): void { this.emit({ kind: 'log', ...event }); }
  result(event: Omit<OutputResultEvent, 'kind'>): void { this.emit({ kind: 'result', ...event }); }
  telemetry(event: Omit<OutputTelemetryEvent, 'kind'>): void { this.emit({ kind: 'telemetry', ...event }); }
  lifecycle(event: Omit<OutputLifecycleEvent, 'kind'>): void { this.emit({ kind: 'lifecycle', ...event }); }
}

export function outputPayload(event: OutputEvent): Readonly<Record<string, unknown>> {
  if (event.kind === 'lifecycle') {
    return { ...event.data, schemaVersion: OUTPUT_SCHEMA_VERSION, event: event.event, command: event.command, ok: true, code: event.event === 'dry_run' ? 'DRY_RUN' : 'SERVICES_READY', exitCode: EXIT_OK, message: event.event };
  }
  if (event.kind === 'result') {
    const message = typeof event.data?.message === 'string' ? event.data.message : event.code;
    return { schemaVersion: OUTPUT_SCHEMA_VERSION, event: 'terminated', command: event.command, ok: event.status === 'success', status: event.status, code: event.code, exitCode: event.exitCode, message, data: event.data ?? {} };
  }
  if (event.kind === 'telemetry') {
    return { schemaVersion: OUTPUT_SCHEMA_VERSION, event: 'telemetry', command: '', ok: true, code: 'TELEMETRY', exitCode: EXIT_OK, message: event.name, name: event.name, data: event.data };
  }
  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    event: 'log',
    command: '',
    ok: true,
    code: 'LOG',
    exitCode: EXIT_OK,
    message: event.message.key,
    source: event.source,
    level: event.level,
    channel: event.channel,
    params: event.message.params ?? {},
    data: event.data ?? {},
  };
}
