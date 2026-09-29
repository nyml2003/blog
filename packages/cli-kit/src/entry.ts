import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_FAILURE } from './errors.ts';

export function isEntry(moduleUrl: string): boolean {
  const argv1 = process.argv[1];
  return argv1 !== undefined && resolve(argv1) === resolve(fileURLToPath(moduleUrl));
}

export function runEntry(main: () => Promise<number>): void {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = EXIT_FAILURE;
  });
}
