import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Workspace { root: string; web: string; ops: string; opsSource: string; opsTests: string }
export function findWorkspaceRoot(start: string | URL): string {
  const input = typeof start === 'string' && start.startsWith('file:') ? fileURLToPath(start) : typeof start === 'string' ? start : fileURLToPath(start);
  let candidate = resolve(input);
  if (!existsSync(join(candidate, 'package.json'))) candidate = dirname(candidate);
  while (true) {
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) throw new Error(`无法从 ${input} 找到工作区根目录`);
    candidate = parent;
  }
}

export function resolveWorkspace(start: string | URL): Workspace {
  const normalized = findWorkspaceRoot(start);
  const ops = join(normalized, 'ops');
  return { root: normalized, web: join(normalized, 'src', 'frontend'), ops, opsSource: join(ops, 'src'), opsTests: join(ops, 'test') };
}
