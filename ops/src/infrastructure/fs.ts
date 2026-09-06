import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FsPort } from '../domain/ports.ts';
export class NodeFs implements FsPort {
  async read(path: string): Promise<string> { return readFile(path, 'utf8'); }
  async exists(path: string): Promise<boolean> { try { await stat(path); return true; } catch { return false; } }
  async mkdir(path: string): Promise<void> { await mkdir(path, { recursive: true }); }
  async files(root: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path); else out.push(path);
      }
    };
    try { await walk(root); } catch { /* optional directory */ }
    return out;
  }
}
