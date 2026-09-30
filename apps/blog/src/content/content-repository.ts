import type { CommandContext } from '@fluvient-cli/cli-kit/commands.ts';
import { INJECTION_ENV } from '../runtime/runtime-plan.ts';
import { EXIT_FAILURE, EXIT_OK } from '@fluvient-cli/cli-kit/errors.ts';

export async function initializeContentRepository(context: CommandContext): Promise<number> {
  context.reporter.section(context.dryRun ? 'content repository init dry-run' : 'content repository init');
  const repository = context.environment[INJECTION_ENV.contentRepo]?.trim();
  const token = context.environment[INJECTION_ENV.contentToken];
  if (!repository || !token?.trim()) {
    context.reporter.fail('BLOG_CONTENT_REPO and BLOG_CONTENT_TOKEN are required');
    return EXIT_FAILURE;
  }
  const binary = await context.binaries.resolve('product');
  if (!binary) {
    context.reporter.fail('Product binary is not built; run ops delivery build first');
    return EXIT_FAILURE;
  }
  if (context.dryRun) {
    context.reporter.info(`${binary} content-repository init`);
    return EXIT_OK;
  }
  const result = await context.process.run(
    binary,
    ['content-repository', 'init'],
    context.workspace.root,
    {
      [INJECTION_ENV.contentRepo]: repository,
      [INJECTION_ENV.contentToken]: token,
    },
  );
  if (result.code !== 0) {
    context.reporter.fail(result.stderr.trim() || `Product init failed with exit ${result.code}`);
    return EXIT_FAILURE;
  }
  context.reporter.ok('empty content repository main is initialized');
  return EXIT_OK;
}
