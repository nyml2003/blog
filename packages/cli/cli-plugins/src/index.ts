import { renderCommandHelp } from '@fluvient-cli/cli-kit/help.ts';
import type { CliPlugin } from '@fluvient-cli/cli-kit/plugin.ts';
import type { RunnerEvent } from '@fluvient-cli/cli-kit/runner.ts';
import type { ParameterSpec } from '@fluvient-cli/cli-kit/parameters.ts';
import { EXIT_OK, EXIT_USAGE } from '@fluvient-cli/cli-kit/errors.ts';

const helpOption = { name: 'help', description: '显示帮助', model: { kind: 'switch' as const } } satisfies ParameterSpec;
const versionOption = { name: 'version', description: '显示版本', model: { kind: 'switch' as const } } satisfies ParameterSpec;
const dryRunOption = { name: 'dry-run', description: '只显示操作，不执行副作用', model: { kind: 'switch' as const } } satisfies ParameterSpec;
const jsonOption = { name: 'json', description: '使用命令的 JSON 输出模式', model: { kind: 'switch' as const } } satisfies ParameterSpec;

function text(event: RunnerEvent, key: 'help' | 'version' | 'hint', message: string, channel: 'stdout' | 'stderr' = 'stdout'): void {
  event.output.log({ level: channel === 'stderr' ? 'error' : 'info', source: 'ops', channel, message: { key, params: { message } } });
}

function pathExists(event: RunnerEvent, path: readonly string[]): boolean {
  return path.length === 0 || Boolean(event.registry.resolve(path)) || Boolean(event.registry.group(path));
}

function usagePath(event: RunnerEvent): readonly string[] {
  const path = event.raw.filter((token) => !token.startsWith('-'));
  for (let length = path.length; length >= 0; length -= 1) {
    const candidate = path.slice(0, length);
    if (pathExists(event, candidate)) return candidate;
  }
  return [];
}

function usageText(event: RunnerEvent, path: readonly string[] = usagePath(event)): string {
  return renderCommandHelp(event.registry, path, {
    name: event.appName,
    globalOptions: event.globalOptions,
  });
}

export function usagePlugin(options: {
  noCommandExit?: number;
  unknownCommand?: (event: RunnerEvent) => { message: string; correction: string; path?: readonly string[] } | undefined;
} = {}): CliPlugin {
  const noCommandExit = options.noCommandExit ?? EXIT_OK;
  return {
    name: 'usage',
    globalOptions: [helpOption],
    hooks: {
      transformArgs(args) {
        const result = [...args];
        for (let index = 0; index < result.length; index += 1) {
          if (result[index] === '-h') result[index] = '--help';
        }
        if (result[0] === 'help') {
          result.shift();
          const marker = result.indexOf('--');
          result.splice(marker === -1 ? result.length : marker, 0, '--help');
        } else if (result.at(-1) === 'help') {
          result[result.length - 1] = '--help';
        }
        return result;
      },
      beforeRun(event) {
        if (event.globals.help === true) {
          const invalid = event.raw.find((token) => token.startsWith('-') && token !== '--');
          if (invalid) {
            event.reporter.fail(`未知选项: ${invalid}`);
            const path = usagePath(event);
            text(event, 'hint', `查看帮助: ${event.appName} ${path.join(' ')} --help`, 'stderr');
            text(event, 'hint', `如何修正: 移除 ${invalid}，或使用已声明的选项`, 'stderr');
            text(event, 'help', usageText(event));
            return EXIT_USAGE;
          }
          text(event, 'help', usageText(event));
          return EXIT_OK;
        }
        // Version is a terminal global action. Do not let an empty command path
        // fall through to the root usage output before versionPlugin handles it.
        if (event.globals.version === true) return undefined;
        if (event.raw.length === 0 || event.registry.group(event.raw)) {
          text(event, 'help', usageText(event, event.raw));
          return noCommandExit;
        }
        return undefined;
      },
      onUnknownCommand(event) {
        const hint = options.unknownCommand?.(event);
        if (hint) {
          event.reporter.fail(hint.message);
          text(event, 'hint', `如何修正: ${hint.correction}`, 'stderr');
          text(event, 'help', usageText(event, hint.path ?? usagePath(event)));
          return EXIT_USAGE;
        }
        event.reporter.fail(`未知命令: ${event.raw.join(' ')}`);
        const words = event.raw.filter((token) => !token.startsWith('-'));
        const candidate = event.registry.definitions
          .map((definition) => definition.meta.path)
          .find((path) => path.length === words.length && path.slice(0, -1).join(' ') === words.slice(0, -1).join(' '));
        if (candidate) text(event, 'hint', `如何修正: 尝试: ${event.appName} ${candidate.join(' ')}`, 'stderr');
        text(event, 'help', usageText(event, candidate ?? usagePath(event)));
        return EXIT_USAGE;
      },
      onUsageError(event) {
        const path = event.command ?? usagePath(event);
        text(event, 'hint', `查看帮助: ${event.appName} ${path.join(' ')} --help`, 'stderr');
        text(event, 'hint', `如何修正: 检查参数后重试: ${event.appName} ${path.join(' ')} --help`, 'stderr');
        text(event, 'help', usageText(event, path));
        return EXIT_USAGE;
      },
    },
  };
}

export function versionPlugin(): CliPlugin {
  return {
    name: 'version',
    globalOptions: [versionOption],
    hooks: {
      transformArgs(args) { return args.map((token) => token === '-V' ? '--version' : token); },
      beforeRun(event) {
        if (event.globals.version === true) {
          text(event, 'version', event.appVersion);
          return EXIT_OK;
        }
        return undefined;
      },
    },
  };
}

export function dryRunPlugin(): CliPlugin {
  return { name: 'dry-run', globalOptions: [dryRunOption] };
}

export function jsonPlugin(): CliPlugin {
  return { name: 'json', globalOptions: [jsonOption] };
}
