export type OutputLevel = 'debug' | 'info' | 'warn' | 'error';
export type OutputChannel = 'stdout' | 'stderr';

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
export type OutputEvent = OutputLogEvent | OutputResultEvent | OutputTelemetryEvent;
export interface OutputPort {
  emit(event: OutputEvent): void;
  log(event: Omit<OutputLogEvent, 'kind'>): void;
  result(event: Omit<OutputResultEvent, 'kind'>): void;
  telemetry(event: Omit<OutputTelemetryEvent, 'kind'>): void;
}
export class NullOutputPort implements OutputPort {
  emit(_event: OutputEvent): void {}
  log(_event: Omit<OutputLogEvent, 'kind'>): void {}
  result(_event: Omit<OutputResultEvent, 'kind'>): void {}
  telemetry(_event: Omit<OutputTelemetryEvent, 'kind'>): void {}
}
export class CaptureOutputPort implements OutputPort {
  readonly events: OutputEvent[] = [];
  emit(event: OutputEvent): void { this.events.push(event); }
  log(event: Omit<OutputLogEvent, 'kind'>): void { this.emit({ kind: 'log', ...event }); }
  result(event: Omit<OutputResultEvent, 'kind'>): void { this.emit({ kind: 'result', ...event }); }
  telemetry(event: Omit<OutputTelemetryEvent, 'kind'>): void { this.emit({ kind: 'telemetry', ...event }); }
}
