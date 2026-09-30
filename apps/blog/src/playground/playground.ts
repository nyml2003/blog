import type { ProcessPort, Reporter } from '@fluvient-cli/cli-kit/ports.ts';
import type { Workspace } from '@fluvient-cli/cli-kit/workspace.ts';
import { EXIT_FAILURE, EXIT_OK, EXIT_SIGINT } from '@fluvient-cli/cli-kit/errors.ts';

export interface PlaygroundDevOptions {
  readonly host: boolean;
  readonly port: number;
}

/**
 * Runs the @fluvient-loom playground demo (Vite dev server) in the
 * foreground with the terminal inherited, so Vite's banner, HMR output and
 * request log stream live. Ctrl-C reaches the whole process group (the CLI
 * maps SIGINT to the repo-wide 130 convention).
 */
export async function runPlaygroundDev(
  workspace: Workspace,
  process: ProcessPort,
  reporter: Reporter,
  options: PlaygroundDevOptions,
): Promise<number> {
  const args = ['exec', 'vite', '--port', String(options.port), '--strictPort'];
  if (options.host) args.push('--host');
  reporter.section('ops playground dev');
  if (options.host) {
    reporter.info('监听 0.0.0.0：手机经局域网访问 http://<本机IP>:' + options.port);
  }
  const command = 'pnpm';
  const commandArgs = ['-C', 'apps/playground', ...args];

  if (process.runInteractive !== undefined) {
    return process.runInteractive(command, commandArgs, workspace.root);
  }

  // Buffered fallback (tests, restricted ports): output surfaces on exit.
  const result = await process.run(command, commandArgs, workspace.root);
  if (result.code === EXIT_OK) return EXIT_OK;
  if (result.code === null) return EXIT_SIGINT;
  reporter.fail(`playground dev 退出码 ${result.code}`);
  reporter.info(result.stderr || result.stdout);
  return EXIT_FAILURE;
}
