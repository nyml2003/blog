import type { CommandDefinition, GroupDefinition } from '../domain/commands.ts';

export interface HelpRegistry {
  resolve(path: readonly string[]): CommandDefinition | undefined;
  definitions: readonly CommandDefinition[];
  children?: (path: readonly string[]) => readonly CommandDefinition[];
  groups?: (path: readonly string[]) => readonly CommandDefinition[];
  group?: (path: readonly string[]) => GroupDefinition | undefined;
  groupDefinitions?: readonly GroupDefinition[];
}

function childrenFor(registry: HelpRegistry, path: readonly string[]): readonly CommandDefinition[] {
  if (registry.children) return registry.children(path);
  if (registry.groups) return registry.groups(path);
  const prefix = path.join(' ');
  const depth = path.length + 1;
  return registry.definitions.filter((definition) =>
    definition.meta.path.slice(0, path.length).join(' ') === prefix
    && definition.meta.path.length === depth,
  );
}

function rootGroups(registry: HelpRegistry): readonly GroupDefinition[] {
  if (registry.groupDefinitions) return registry.groupDefinitions;
  const seen = new Set<string>();
  return registry.definitions.flatMap((definition) => {
    const path = [definition.meta.path[0]] as [string];
    const key = path.join(' ');
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ meta: { path, summary: key, description: '', order: seen.size, workflow: '' } }];
  });
}

function leafExitCodes(command: CommandDefinition): readonly { code: number; meaning: string }[] {
  const codes = [...(command.meta.exitCodes ?? [])];
  if (!codes.some((entry) => entry.code === 10)) {
    codes.push({ code: 10, meaning: '参数或命令用法错误' });
  }
  return [...codes].sort((left, right) => left.code - right.code);
}

export function renderCommandHelp(registry: HelpRegistry, path: readonly string[] = []): string {
  const command = registry.resolve(path);
  const lines = [`blog ops${path.length ? ` ${path.join(' ')}` : ''}`];

  if (!path.length) {
    lines.push('', '命令分组:');
    for (const group of rootGroups(registry)) {
      lines.push(`  ${group.meta.path.join(' ')}  ${group.meta.summary}`);
      if (group.meta.description) lines.push(`    ${group.meta.description}`);
      if (group.meta.workflow) lines.push(`    工作流: ${group.meta.workflow}`);
    }
    lines.push('', '可执行命令:');
    for (const group of rootGroups(registry)) {
      const children = registry.definitions
        .filter((definition) => definition.meta.path[0] === group.meta.path[0])
        .sort((left, right) => left.meta.path.join(' ').localeCompare(right.meta.path.join(' ')));
      for (const child of children) {
        lines.push(`  ops ${child.meta.path.join(' ')}  ${child.meta.summary}`);
      }
    }
    lines.push('', '常用入口:', '  ops workspace doctor', '  ops runtime dev', '  ops quality check', '  ops delivery build');
    return lines.join('\n');
  }

  if (!command) {
    const group = registry.group?.(path);
    lines.push('', `命令分组: ${path.join(' ')}`);
    if (group?.meta.description) lines.push(group.meta.description);
    if (group?.meta.workflow) lines.push(`工作流: ${group.meta.workflow}`);
    lines.push('', '直接子命令:');
    for (const child of childrenFor(registry, path)) {
      lines.push(`  ${child.meta.path.slice(path.length).join(' ')}  ${child.meta.summary}`);
    }
    lines.push('', `继续查看: ops ${path.join(' ')} <command> --help`);
    return lines.join('\n');
  }

  const meta = command.meta;
  lines.push('', meta.summary);
  if (meta.description) lines.push(meta.description);
  const usage = ['ops', ...path, ...(meta.positionals ?? []).map((position) => position.required ? `<${position.name}>` : `[${position.name}]`)].join(' ');
  lines.push('', `用法: ${usage}`);
  lines.push('', '全局选项:', '      --help      显示帮助', '      --dry-run   只显示操作，不执行副作用');
  if (meta.positionals?.length) lines.push('', '位置参数:', ...meta.positionals.map((position) => `  ${position.name}  ${position.description}`));
  if (meta.options?.length) lines.push('', '选项:', ...meta.options.map((option) => `      --${option.name}${option.type === 'boolean' ? '' : ` <${option.valueName ?? option.name}>`}  ${option.description}${option.env ? ` (env: ${option.env})` : ''}${option.default !== undefined ? ` [默认: ${String(option.default)}]` : ''}`));
  if (meta.examples?.length) lines.push('', '示例:', ...meta.examples.map((example) => `  ${example}`));
  lines.push('', '退出码:', ...leafExitCodes(command).map((entry) => `  ${entry.code}  ${entry.meaning}`));
  return lines.join('\n');
}
