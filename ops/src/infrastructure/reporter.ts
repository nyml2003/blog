import type { Reporter } from '../framework/ports.ts';
export class TerminalReporter implements Reporter {
  section(title: string): void { console.log(`\n-- ${title} --`); }
  ok(message: string): void { console.log(`OK ${message}`); }
  fail(message: string): void { console.error(`FAIL ${message}`); }
  info(message: string): void { console.log(`  ${message}`); }
}
