import { isModelValue, validateParameter, type ParameterSpec, type PositionalSpec, type ModelValue, type CommandArgs } from './parameters.ts';
import type { OutputPort } from './output.ts';
import type { Result } from '@fluvient/core';
export type { CommandArgs, PositionalSpec } from './parameters.ts';
export type OptionSpec = ParameterSpec;
export interface ExitCodeSpec { code: number; meaning: string }
export interface GroupMeta {
  path: readonly [string, ...string[]];
  summary: string;
  description: string;
  order: number;
  workflow: string;
}
export interface CommandMeta {
  path: readonly [string, ...string[]]; summary: string; description?: string;
  positionals?: readonly PositionalSpec[]; options?: readonly OptionSpec[];
  examples?: readonly string[]; exitCodes?: readonly ExitCodeSpec[]
}
type Fields<M extends CommandMeta> =
  (M extends { options: readonly (infer F extends ParameterSpec)[] } ? F : never)
  | (M extends { positionals: readonly (infer F extends PositionalSpec)[] } ? F : never);
export type ParsedArgs<M extends CommandMeta> = {
  [F in Fields<M> as F extends { optional: true } ? never : F['name']]: ModelValue<F['model']>;
} & {
  [F in Fields<M> as F extends { optional: true } ? F['name'] : never]?: ModelValue<F['model']>;
};
export interface CommandContext {
  workspace: import('./workspace.ts').Workspace;
  process: import('./ports.ts').ProcessPort;
  supervisor: import('./ports.ts').ProcessSupervisor;
  fs: import('./ports.ts').FsPort;
  reporter: import('./ports.ts').Reporter;
  output: OutputPort;
  log: import('./ports.ts').RuntimeLog;
  probe: import('./ports.ts').PortProbe;
  readiness: import('./ports.ts').ReadinessProbe;
  binaries: import('./ports.ts').BinaryResolver;
  signals?: import('./ports.ts').SignalPort;
  environment: Readonly<Record<string, string | undefined>>;
  effects: import('./effects.ts').EffectPort;
  dryRun: boolean;
  json: boolean;
}
export type CommandOutcome = Result<{ readonly exitCode?: number }, import('./errors.ts').OpsFailure>;
export type CommandHandler = (context: CommandContext, args: CommandArgs) => Promise<CommandOutcome> | CommandOutcome;
export interface CommandDefinition { readonly meta: CommandMeta; readonly handler: CommandHandler }
export interface GroupDefinition { readonly meta: GroupMeta }

function argumentsMatch<M extends CommandMeta>(meta: M, args: CommandArgs): args is ParsedArgs<M> {
  const fields = [...(meta.options ?? []), ...(meta.positionals ?? [])];
  const allowed = new Set(fields.map((field) => field.name));
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) return false;
  }
  return fields.every((field) => {
    const optional = field.model.kind !== 'switch' && field.optional === true;
    if (!Object.hasOwn(args, field.name)) return optional;
    return isModelValue(field.model, args[field.name]);
  });
}

export function defineCommand<const M extends CommandMeta>(meta: M, handler: (context: CommandContext, args: ParsedArgs<M>) => Promise<CommandOutcome> | CommandOutcome): CommandDefinition {
  for (const field of [...(meta.options ?? []), ...(meta.positionals ?? [])]) {
    validateParameter(field);
    if (field.model.kind === 'enum') Object.freeze(field.model.values);
    Object.freeze(field.model);
    Object.freeze(field);
  }
  Object.freeze(meta.options);
  Object.freeze(meta.positionals);
  Object.freeze(meta);
  const invoke: CommandHandler = (context, args) => {
    if (!argumentsMatch(meta, args)) throw new Error(`invalid parsed arguments: ${meta.path.join(' ')}`);
    return handler(context, args);
  };
  return Object.freeze({ meta: Object.freeze({ ...meta, path: Object.freeze([...meta.path]), options: Object.freeze([...(meta.options ?? [])]), positionals: Object.freeze([...(meta.positionals ?? [])]) }), handler: invoke });
}

export function validateRegistry(definitions: readonly CommandDefinition[], reservedOptions: readonly string[] = ['help', 'version', 'dry-run', 'json']): void {
  const seen = new Set<string>();
  for (const definition of definitions) {
    const { meta } = definition;
    if (!meta.path.length || meta.path.some((part) => !/^[a-z][a-z0-9-]*$/.test(part))) throw new Error(`invalid command path: ${meta.path.join(' ')}`);
    if (!meta.summary.trim()) throw new Error(`missing summary: ${meta.path.join(' ')}`);
    const key = meta.path.join(' ');
    if (seen.has(key)) throw new Error(`duplicate command path: ${key}`);
    seen.add(key);
    const names = new Set<string>();
    for (const spec of [...(meta.positionals ?? []), ...(meta.options ?? [])]) {
      validateParameter(spec);
      if (reservedOptions.includes(spec.name)) throw new Error(`reserved global switch: ${spec.name}`);
      if (names.has(spec.name)) throw new Error(`duplicate argument ${spec.name}: ${key}`);
      names.add(spec.name);
    }
    for (const spec of meta.positionals ?? []) {
      if (String(spec.model.kind) === 'switch') throw new Error(`positional cannot be switch: ${spec.name}`);
      if (spec.optional !== undefined) throw new Error(`positional cannot be optional: ${spec.name}`);
    }
  }
  for (const definition of definitions) for (let i = 1; i < definition.meta.path.length; i++) {
    const parent = definition.meta.path.slice(0, i).join(' ');
    if (seen.has(parent)) throw new Error(`command cannot be both leaf and group: ${parent}`);
  }
}

export function defineGroup(meta: GroupMeta): GroupDefinition {
  return Object.freeze({ meta: Object.freeze({ ...meta, path: Object.freeze([...meta.path]) as [string, ...string[]] }) });
}

export function reflectCommandRegistry(
  definitions: readonly CommandDefinition[],
  groups: readonly GroupDefinition[] = [],
  reservedOptions: readonly string[] = ['help', 'version', 'dry-run', 'json'],
) {
  validateRegistry(definitions, reservedOptions);
  const byPath = new Map(definitions.map((d) => [d.meta.path.join(' '), d]));
  const groupByPath = new Map(groups.map((group) => [group.meta.path.join(' '), group]));
  const groupPaths = new Set<string>();
  for (const definition of definitions) {
    groupPaths.add(definition.meta.path.slice(0, 1).join(' '));
  }
  for (const group of groups) {
    const key = group.meta.path.join(' ');
    if (!group.meta.path.length || group.meta.path.some((part) => !/^[a-z][a-z0-9-]*$/.test(part))) {
      throw new Error(`invalid command group path: ${key}`);
    }
    if (groupByPath.size !== groups.length) throw new Error(`duplicate command group path: ${key}`);
    if (!group.meta.summary.trim() || !group.meta.description.trim() || !group.meta.workflow.trim()) {
      throw new Error(`incomplete command group metadata: ${key}`);
    }
    if (!Number.isFinite(group.meta.order)) throw new Error(`invalid command group order: ${key}`);
  }
  for (const path of groupPaths) {
    if (groups.length > 0 && !groupByPath.has(path)) throw new Error(`missing command group metadata: ${path}`);
  }
  return {
    resolve(path: readonly string[]) { return byPath.get(path.join(' ')); },
    children(path: readonly string[]) { const prefix = path.join(' '); const depth = path.length + 1; return definitions.filter((d) => d.meta.path.slice(0, path.length).join(' ') === prefix && d.meta.path.length === depth); },
    groups(path: readonly string[] = []) {
      const prefix = path.join(' ');
      const depth = path.length;
      const seen = new Set<string>();
      return definitions.filter((d) => d.meta.path.slice(0, depth).join(' ') === prefix && d.meta.path.length > depth)
        .filter((d) => { const key = d.meta.path.slice(0, depth + 1).join(' '); if (seen.has(key)) return false; seen.add(key); return true; });
    },
    group(path: readonly string[]) { return groupByPath.get(path.join(' ')); },
    groupDefinitions: [...groups].sort((a, b) => a.meta.order - b.meta.order),
    definitions
  };
}
