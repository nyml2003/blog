import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { brotliCompressSync, gzipSync, zstdCompressSync } from "node:zlib";
import type { Plugin } from "vite";

// 构建期预压缩：为 dist 内可压缩产物生成 `<file>.zst|.br|.gz` 兄弟文件，
// 服务器（product static_files.rs）按 Accept-Encoding 直接回发对应文件——
// 零运行时压缩 CPU，内容哈希不变的产物每次请求复用同一份压缩结果。
// 后缀与 Content-Encoding 值的对照契约见 static_files.rs 的 negotiate 注释。

/** 预压缩编码；产物后缀与 Content-Encoding 值由本模块唯一约定。 */
export type ArtifactEncoding = "zstd" | "br" | "gzip";

export interface CompressArtifactsOptions {
  /** 默认全量三种；只压部分时按需缩减。 */
  readonly encodings?: readonly ArtifactEncoding[];
  /** 参与预压缩的产物扩展名（wasm 是可压缩二进制，一并压）。 */
  readonly extensions?: readonly string[];
}

const DEFAULT_ENCODINGS: readonly ArtifactEncoding[] = ["zstd", "br", "gzip"];
const DEFAULT_EXTENSIONS = [".js", ".css", ".html", ".wasm", ".svg"];

function artifactSuffix(encoding: ArtifactEncoding): string {
  switch (encoding) {
    case "zstd":
      return ".zst";
    case "br":
      return ".br";
    case "gzip":
      return ".gz";
  }
}

function compressorOf(
  encoding: ArtifactEncoding,
): (data: Buffer) => Buffer {
  switch (encoding) {
    // 静态产物一次压缩、长期复用：直接取各编码最高档。
    // zstd 的 level 选项在 Node 里被静默忽略，压缩级要走 params
    // （键 100 = ZSTD_c_compressionLevel；实测 shared chunk 36.5KB → 32.4KB）；
    // brotli 默认即最高质量 11（实测与显式参数逐字节同长），无需选项。
    case "zstd":
      return (data) => zstdCompressSync(data, { params: { 100: 19 } });
    case "br":
      return (data) => brotliCompressSync(data);
    case "gzip":
      return (data) => gzipSync(data, { level: 9 });
  }
}

async function* walk(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

export function compressArtifacts(
  options: CompressArtifactsOptions = {},
): Plugin {
  const encodings = options.encodings ?? DEFAULT_ENCODINGS;
  const extensions = new Set(options.extensions ?? DEFAULT_EXTENSIONS);
  let outDirectory: string | undefined;

  return {
    name: "compress-artifacts",
    configResolved(config) {
      outDirectory = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      if (encodings.length === 0 || outDirectory === undefined) return;
      for await (const path of walk(outDirectory)) {
        if (!extensions.has(extname(path))) continue;
        const source = await readFile(path);
        for (const encoding of encodings) {
          await writeFile(
            `${path}${artifactSuffix(encoding)}`,
            compressorOf(encoding)(source),
          );
        }
      }
    },
  };
}
