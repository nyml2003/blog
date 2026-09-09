import { join } from 'node:path';
import { SERVICE_BINARIES } from '../domain/runtime-plan.ts';
import type { BinaryResolver, FsPort } from '../domain/ports.ts';

/**
 * Runtime modes use the locally built Rust binaries: `target/debug` first (fresh `cargo build`),
 * falling back to the `target/release` delivery artifacts. A missing binary is a structured
 * `SERVICE_START_FAILED`, never a fallback to some implicit default.
 */
export class WorkspaceBinaries implements BinaryResolver {
  private readonly profiles = ['debug', 'release'] as const;
  private readonly fs: FsPort;
  private readonly root: string;

  constructor(fs: FsPort, root: string) {
    this.fs = fs;
    this.root = root;
  }

  async resolve(role: keyof typeof SERVICE_BINARIES): Promise<string | undefined> {
    for (const profile of this.profiles) {
      const path = join(this.root, 'src', 'target', profile, SERVICE_BINARIES[role]);
      if (await this.fs.exists(path)) return path;
    }
    return undefined;
  }
}
