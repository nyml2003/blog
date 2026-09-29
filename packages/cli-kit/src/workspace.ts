import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Workspace { root: string; web: string; apps: string; appSource: string; appTests: string }
export function findWorkspaceRoot(start: string | URL): string {
  const input = typeof start === 'string' && start.startsWith('file:') ? fileURLToPath(start) : typeof start === 'string' ? start : fileURLToPath(start);
  let candidate = resolve(input);
  if (!isWorkspaceRoot(candidate)) candidate = dirname(candidate);
  while (true) {
    if (isWorkspaceRoot(candidate)) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) throw new Error(`无法从 ${input} 找到工作区根目录`);
    candidate = parent;
  }
}

function isWorkspaceRoot(candidate: string): boolean {
  if (existsSync(join(candidate, 'pnpm-workspace.yaml'))) return true;
  const manifest = join(candidate, 'package.json');
  if (!existsSync(manifest)) return false;
  try {
    return JSON.parse(readFileSync(manifest, 'utf8')).name === 'blog-workspace';
  } catch {
    return false;
  }
}

export function resolveWorkspace(start: string | URL): Workspace {
  const normalized = findWorkspaceRoot(start);
  const app = join(normalized, 'apps', 'blog');
  return { root: normalized, web: join(normalized, 'src', 'frontend'), apps: join(normalized, 'apps'), appSource: join(app, 'src'), appTests: join(app, 'test') };
}
