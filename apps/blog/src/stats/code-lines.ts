import type { FsPort, PathPort, ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';

export interface CodeStatsOptions {
  /** 只显示行数最多的前 N 个扩展名；缺省显示全部。 */
  readonly top?: number;
}

export interface ExtensionStats {
  readonly extension: string;
  readonly files: number;
  readonly lines: number;
}

export interface CodeStats {
  readonly files: number;
  readonly lines: number;
  readonly byExtension: readonly ExtensionStats[];
}

/** 参与统计的文本扩展名；二进制与配置外的格式不计入。 */
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.cjs',
  '.rs', '.md', '.json', '.css', '.html', '.yml', '.yaml',
  '.toml', '.sh', '.sql', '.nix',
]);
const NUL = '\u0000';
const LIST_ARGS = ['ls-files', '-z', '--cached', '--others', '--exclude-standard'];

function countLines(content: string): number {
  if (content.length === 0) return 0;
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
}

/**
 * 通过 `git ls-files` 列出仓库文件（含未跟踪、遵循 .gitignore），逐个读取并按扩展名汇总。
 * 只读命令：观察在 dry-run 与真实运行中都执行，两者结果一致。
 */
export async function runCodeStats(
  workspace: Workspace,
  process: ProcessPort,
  fs: FsPort,
  path: PathPort,
  reporter: Reporter,
  options: CodeStatsOptions,
): Promise<boolean> {
  reporter.section('代码行数');
  const listed = await process.run('git', LIST_ARGS, workspace.root);
  if (listed.code !== 0) {
    reporter.fail(`git ls-files 失败(exit ${listed.code})`);
    reporter.info(listed.stderr.trim() || listed.stdout.trim());
    return false;
  }

  const paths = listed.stdout.split(NUL).filter((file) => file.length > 0 && TEXT_EXTENSIONS.has(path.extname(file)));
  const byExtension = new Map<string, ExtensionStats>();
  let lines = 0;
  let skipped = 0;
  for (const file of paths) {
    let content: string;
    try {
      content = await fs.read(path.join(workspace.root, file));
    } catch {
      // 例如已从工作树删除但仍在索引中的文件；统计不应因此失败。
      skipped += 1;
      continue;
    }
    const counted = countLines(content);
    lines += counted;
    const extension = path.extname(file);
    const previous = byExtension.get(extension) ?? { extension, files: 0, lines: 0 };
    byExtension.set(extension, { extension, files: previous.files + 1, lines: previous.lines + counted });
  }

  const groups = [...byExtension.values()].sort((left, right) => right.lines - left.lines || left.extension.localeCompare(right.extension));
  const shown = options.top === undefined ? groups : groups.slice(0, options.top);
  reporter.info(`共 ${paths.length - skipped} 个文件，${lines} 行`);
  if (skipped > 0) reporter.info(`跳过无法读取的文件: ${skipped}`);
  for (const group of shown) {
    reporter.info(`${group.extension.padEnd(7)} ${String(group.files).padStart(4)} 文件 ${String(group.lines).padStart(7)} 行`);
  }
  reporter.ok('统计完成');
  return true;
}
