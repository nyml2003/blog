import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FsPort } from '../domain/ports.ts';
export class NodeFs implements FsPort {
  async read(path: string): Promise<string> { return readFile(path, 'utf8'); }
  async exists(path: string): Promise<boolean> { try { await stat(path); return true; } catch { return false; } }
  async mkdir(path: string): Promise<void> { await mkdir(path, { recursive: true }); }
  async inspect(path: string) {
    const metadata = await lstat(path);
    let kind: 'file' | 'directory' | 'symlink' | 'other' = 'other';
    if (metadata.isSymbolicLink()) kind = 'symlink';
    else if (metadata.isFile()) kind = 'file';
    else if (metadata.isDirectory()) kind = 'directory';
    return { kind, mode: metadata.mode & 0o777, uid: metadata.uid };
  }
  async readSecure(path: string, maxBytes: number) {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const metadata = await handle.stat();
      if (metadata.size > maxBytes) throw new Error(`secure file exceeds ${maxBytes} bytes`);
      const content = await handle.readFile('utf8');
      return {
        content,
        metadata: {
          kind: metadata.isFile() ? 'file' as const : 'other' as const,
          mode: metadata.mode & 0o777,
          uid: metadata.uid,
        },
      };
    } finally {
      await handle.close();
    }
  }
  effectiveUid(): number | undefined { return process.getuid?.(); }
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
