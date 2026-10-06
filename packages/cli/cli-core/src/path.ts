import { basename, dirname, extname, join, normalize } from 'node:path';
import type { PathPort } from '@fluvient-cli/cli-kit/ports.ts';

export class NodePath implements PathPort {
  join(...parts: string[]): string { return join(...parts); }
  normalize(path: string): string { return normalize(path); }
  dirname(path: string): string { return dirname(path); }
  basename(path: string): string { return basename(path); }
  extname(path: string): string { return extname(path); }
}
