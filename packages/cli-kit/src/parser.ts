import type { CommandMeta, CommandArgs, ParsedArgs } from './commands.ts';
import type { ParameterSpec } from './parameters.ts';
import { parseValue, type RawParameter } from './value-parser.ts';

export interface ParseFailure { message: string }
export type ParseResult<M extends CommandMeta = CommandMeta> = { args: ParsedArgs<M> } | { error: ParseFailure };

function storeValue(args: CommandArgs, spec: ParameterSpec, raw: RawParameter): ParseFailure | undefined {
  const parsed = parseValue(spec.model, raw);
  if (!parsed.ok) return { message: `${spec.name}: ${parsed.message}` };
  Object.defineProperty(args, spec.name, { value: parsed.value, enumerable: true, configurable: true });
  return undefined;
}

export function parseCommandArgs<const M extends CommandMeta>(meta: M, raw: readonly string[]): ParseResult<M> {
  const options = new Map<string, ParameterSpec>((meta.options ?? []).map((spec) => [`--${spec.name}`, spec]));
  const values: CommandArgs = {};
  const positionalValues: string[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index];
    if (token === '--') { positionalValues.push(...raw.slice(index + 1)); break; }
    if (!token.startsWith('--')) { positionalValues.push(token); continue; }
    const equal = token.indexOf('=');
    const key = equal === -1 ? token : token.slice(0, equal);
    const spec = options.get(key);
    if (!spec) return { error: { message: `未知选项: ${key}` } };
    if (spec.model.kind === 'switch') {
      if (equal !== -1) return { error: { message: `${key}: switch 不接受值` } };
      const error = storeValue(values, spec, { kind: 'presence', present: true });
      if (error) return { error };
      continue;
    }
    if (Object.hasOwn(values, spec.name)) return { error: { message: `重复选项: ${key}` } };
    const text = equal === -1 ? raw[++index] : token.slice(equal + 1);
    if (text === undefined || (equal === -1 && text.startsWith('--'))) {
      return { error: { message: `选项缺少值: ${key}` } };
    }
    const error = storeValue(values, spec, { kind: 'value', text });
    if (error) return { error };
  }
  const positionals = meta.positionals ?? [];
  if (positionalValues.length > positionals.length) {
    return { error: { message: `位置参数过多: ${positionalValues[positionals.length]}` } };
  }
  for (const [index, spec] of positionals.entries()) {
    const text = positionalValues[index];
    if (text === undefined) return { error: { message: `缺少位置参数: ${spec.name}` } };
    const error = storeValue(values, spec, { kind: 'value', text });
    if (error) return { error };
  }
  for (const spec of meta.options ?? []) {
    if (Object.hasOwn(values, spec.name)) continue;
    if (spec.model.kind !== 'switch' && spec.optional !== true) return { error: { message: `缺少选项: --${spec.name}` } };
    if (spec.model.kind === 'switch') {
      const error = storeValue(values, spec, { kind: 'presence', present: false });
      if (error) return { error };
    }
  }
  return { args: values as ParsedArgs<M> };
}

export type GlobalResult = { raw: string[]; indices: number[]; values: CommandArgs } | { error: ParseFailure };

export function extractGlobalSwitches(tokens: readonly string[], specs: readonly ParameterSpec[]): GlobalResult {
  const raw: string[] = [];
  const indices: number[] = [];
  const values: CommandArgs = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--') {
      raw.push(...tokens.slice(index));
      indices.push(...tokens.slice(index).map((_, offset) => index + offset));
      break;
    }
    const key = token.split('=', 1)[0];
    const spec = specs.find((field) => `--${field.name}` === key);
    if (!spec) { raw.push(token); indices.push(index); continue; }
    const input: RawParameter = token === key
      ? { kind: 'presence', present: true }
      : { kind: 'value', text: token.slice(key.length + 1) };
    const parsed = parseValue(spec.model, input);
    if (!parsed.ok) return { error: { message: `${key}: ${parsed.message}` } };
    const error = storeValue(values, spec, input);
    if (error) return { error };
  }
  return { raw, indices, values };
}
