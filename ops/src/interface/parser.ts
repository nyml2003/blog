import type { CommandMeta, CommandArgs, OptionSpec } from '../domain/commands.ts';

export interface ParseFailure { message: string }
export type ParseResult = { args: CommandArgs } | { error: ParseFailure };

function convert(value: string, spec: OptionSpec | { type: OptionSpec['type'] }): string | number | boolean {
  if (spec.type === 'string') return value;
  if (spec.type === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`必须是数字: ${value}`);
    return parsed;
  }
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new Error(`必须是布尔值: ${value}`);
}

export function parseCommandArgs(meta: CommandMeta, raw: readonly string[], environment: NodeJS.ProcessEnv = process.env): ParseResult {
  const options = new Map<string, OptionSpec>();
  for (const option of meta.options ?? []) {
    options.set(`--${option.name}`, option);
  }
  const values: CommandArgs = {};
  const positionals = meta.positionals ?? [];
  const positionalValues: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const token = raw[i];
    if (token === undefined) continue;
    if (token === '--') { positionalValues.push(...raw.slice(i + 1)); break; }
    if (token.startsWith('-')) {
      const equal = token.indexOf('=');
      const key = equal === -1 ? token : token.slice(0, equal);
      const spec = options.get(key);
      if (!spec) return { error: { message: `未知选项: ${token}` } };
      let value: string;
      if (spec.type === 'boolean') value = equal === -1 ? 'true' : token.slice(equal + 1);
      else {
        value = equal === -1 ? (raw[++i] ?? '') : token.slice(equal + 1);
        if (!value || value.startsWith('-')) return { error: { message: `选项缺少值: ${key}` } };
      }
      try { values[spec.name] = convert(value, spec); } catch (error) { return { error: { message: `${key}: ${(error as Error).message}` } }; }
      const invalid = spec.validate?.(values[spec.name]);
      if (invalid) return { error: { message: `${key}: ${invalid}` } };
      continue;
    }
    positionalValues.push(token);
  }
  if (positionalValues.length > positionals.length) return { error: { message: `位置参数过多: ${positionalValues[positionals.length]}` } };
  for (let i = 0; i < positionals.length; i += 1) {
    const spec = positionals[i]; const value = positionalValues[i];
    if (value === undefined) { if (spec?.required) return { error: { message: `缺少位置参数: ${spec.name}` } }; continue; }
    try { values[spec.name] = convert(value, spec); } catch (error) { return { error: { message: `${spec.name}: ${(error as Error).message}` } }; }
    const invalid = spec.validate?.(values[spec.name]);
    if (invalid) return { error: { message: `${spec.name}: ${invalid}` } };
  }
  for (const spec of meta.options ?? []) {
    if (values[spec.name] !== undefined) continue;
    const envValue = spec.env ? environment[spec.env] : undefined;
    if (envValue !== undefined) { try { values[spec.name] = convert(envValue, spec); } catch (error) { return { error: { message: `${spec.env}: ${(error as Error).message}` } }; } }
    else if (spec.default !== undefined) values[spec.name] = spec.default;
    else if (spec.required) return { error: { message: `缺少选项: --${spec.name}` } };
  }
  return { args: values };
}
