import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_FAILURE } from './errors.ts';
import type { OutputPort } from './output.ts';

export function isEntry(moduleUrl: string): boolean {
  const argv1 = process.argv[1];
  return argv1 !== undefined && resolve(argv1) === resolve(fileURLToPath(moduleUrl));
}

export function runEntry(main: () => Promise<number>, output?: OutputPort): void {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    output?.result({ status: 'failure', command: '', exitCode: EXIT_FAILURE, code: 'INTERNAL_ERROR', data: { message, details: [] } });
    if (!output) process.stderr.write(`${message}\n`);
    process.exitCode = EXIT_FAILURE;
  });
}
