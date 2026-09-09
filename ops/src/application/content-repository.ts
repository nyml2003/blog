import type { CommandContext } from '../domain/commands.ts';
import { INJECTION_ENV } from '../domain/runtime-plan.ts';

export async function initializeContentRepository(context: CommandContext): Promise<number> {
  context.reporter.section(context.dryRun ? 'content repository init dry-run' : 'content repository init');
  const repository = context.environment[INJECTION_ENV.contentRepo]?.trim();
  const token = context.environment[INJECTION_ENV.contentToken];
  if (!repository || !token?.trim()) {
    context.reporter.fail('BLOG_CONTENT_REPO and BLOG_CONTENT_TOKEN are required');
    return 20;
  }
  const binary = await context.binaries.resolve('product');
  if (!binary) {
    context.reporter.fail('Product binary is not built; run ops delivery build first');
    return 20;
  }
  if (context.dryRun) {
    context.reporter.info(`${binary} content-repository init`);
    return 0;
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
    return 20;
  }
  context.reporter.ok('empty content repository main is initialized');
  return 0;
}
