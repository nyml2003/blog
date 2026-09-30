import type { OutputPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
export class TerminalReporter implements Reporter {
  private readonly output?: OutputPort;
  constructor(output?: OutputPort) { this.output = output; }
  section(title: string): void { this.output?.log({ level: 'info', source: 'ops', channel: 'stdout', message: { key: 'section', params: { title } } }); if (!this.output) console.log(`\n-- ${title} --`); }
  ok(message: string): void { this.output?.log({ level: 'info', source: 'ops', channel: 'stdout', message: { key: 'ok', params: { message } } }); if (!this.output) console.log(`OK ${message}`); }
  fail(message: string): void { this.output?.log({ level: 'error', source: 'ops', channel: 'stderr', message: { key: 'fail', params: { message } } }); if (!this.output) console.error(`FAIL ${message}`); }
  info(message: string): void { this.output?.log({ level: 'info', source: 'ops', channel: 'stdout', message: { key: 'info', params: { message } } }); if (!this.output) console.log(`  ${message}`); }
}
