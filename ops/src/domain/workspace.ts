import { resolve, join } from 'node:path';

export interface Workspace { root: string; web: string; ops: string }
export function resolveWorkspace(root: string): Workspace {
  const normalized = resolve(root);
  return { root: normalized, web: join(normalized, 'src', 'frontend'), ops: join(normalized, 'ops') };
}
