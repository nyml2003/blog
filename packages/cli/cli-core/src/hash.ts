import { createHash } from 'node:crypto';
import type { HashPort } from '@fluvient-cli/cli-kit/ports.ts';

export class NodeHash implements HashPort {
  sha256(content: Uint8Array): string { return createHash('sha256').update(content).digest('hex'); }
}
