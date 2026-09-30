import type { OutputEvent, OutputPort } from '@fluvient-cli/cli-kit/output.ts';

export class ConsoleOutputPort implements OutputPort {
  private json: boolean;
  constructor(json = false) { this.json = json; }
  get jsonMode(): boolean { return this.json; }
  setJson(json: boolean): void { this.json = json; }
  emit(event: OutputEvent): void {
    if (event.kind === 'telemetry') return;
    if (this.json) { console.log(JSON.stringify(event)); return; }
    if (event.kind === 'result') {
      const text = `[ops] ${event.status} ${event.code} (${event.exitCode})`;
      if (event.status === 'failure') console.error(text); else console.log(text);
      return;
    }
    const text = render(event);
    if (event.channel === 'stderr') console.error(`[${event.source}] ${text}`); else console.log(`[${event.source}] ${text}`);
  }
  log(event: Omit<Extract<OutputEvent, { kind: 'log' }>, 'kind'>): void { this.emit({ kind: 'log', ...event }); }
  result(event: Omit<Extract<OutputEvent, { kind: 'result' }>, 'kind'>): void { this.emit({ kind: 'result', ...event }); }
  telemetry(event: Omit<Extract<OutputEvent, { kind: 'telemetry' }>, 'kind'>): void { this.emit({ kind: 'telemetry', ...event }); }
}

function render(event: Extract<OutputEvent, { kind: 'log' }>): string {
  const params = event.message.params ?? {};
  if (event.message.key === 'section') return `-- ${params.title ?? ''} --`;
  if (event.message.key === 'ok') return `OK ${params.message ?? ''}`;
  if (event.message.key === 'fail') return `FAIL ${params.message ?? ''}`;
  return String(params.message ?? event.message.key);
}
