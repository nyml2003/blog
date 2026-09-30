import type { LogSource, LogStream, RuntimeLog } from '@fluvient-cli/cli-kit/ports.ts';
import type { OutputPort } from '@fluvient-cli/cli-kit/output.ts';

export class OutputRuntimeLog implements RuntimeLog {
  private readonly output: OutputPort;
  constructor(output: OutputPort) {
    this.output = output;
  }

  info(message: string): void { this.log('ops', message); }
  error(message: string): void { this.output.log({ level: 'error', source: 'ops', channel: 'stderr', message: { key: 'runtime.error', params: { message } } }); }
  log(role: LogSource, message: string, stream: LogStream = 'stdout'): void {
    const prefix = `[${role}] `;
    const normalized = message.startsWith(prefix) ? message.slice(prefix.length) : message;
    this.output.log({ level: 'info', source: role, channel: stream, message: { key: 'runtime.line', params: { message: normalized } } });
  }
  json(value: unknown): void {
    this.output.log({ level: 'info', source: 'ops', channel: 'stdout', message: { key: 'runtime.legacy_payload' }, data: { value } });
  }
}
