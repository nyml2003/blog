export const INT32_MIN = -2147483648;
export const INT32_MAX = 2147483647;

export type ValueModel =
  | { readonly kind: 'int32'; readonly min: number; readonly max: number }
  | { readonly kind: 'enum'; readonly values: readonly string[] };
export type ParameterModel = ValueModel | { readonly kind: 'switch' };
export interface ParameterSpec {
  readonly name: string;
  readonly description: string;
  readonly model: ParameterModel;
}
export interface PositionalSpec extends ParameterSpec { readonly model: ValueModel }
export type ModelValue<M extends ParameterModel> =
  M extends { kind: 'int32' } ? number :
  M extends { kind: 'enum'; values: readonly (infer V)[] } ? V : boolean;
export type CommandArgs = Record<string, string | number | boolean>;

export const globalSwitches = [
  { name: 'help', description: '显示帮助', model: { kind: 'switch' } },
  { name: 'dry-run', description: '只显示操作，不执行副作用', model: { kind: 'switch' } },
  { name: 'json', description: '使用命令的 JSON 输出模式', model: { kind: 'switch' } },
] as const satisfies readonly ParameterSpec[];

function checkKeys(value: object, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`unsupported parameter metadata: ${key}`);
  }
}

export function validateParameter(spec: ParameterSpec): void {
  checkKeys(spec, ['name', 'description', 'model']);
  if (!/^[a-z][a-z0-9-]*$/.test(spec.name)) throw new Error(`invalid parameter name: ${spec.name}`);
  if (!spec.description.trim()) throw new Error(`missing parameter description: ${spec.name}`);
  const model = spec.model;
  if (!model || typeof model !== 'object') throw new Error(`missing parameter model: ${spec.name}`);
  switch (model.kind) {
    case 'int32':
      checkKeys(model, ['kind', 'min', 'max']);
      if (!Number.isInteger(model.min) || !Number.isInteger(model.max)
        || model.min < INT32_MIN || model.max > INT32_MAX || model.min > model.max) {
        throw new Error(`invalid int32 range: ${spec.name}`);
      }
      return;
    case 'enum':
      checkKeys(model, ['kind', 'values']);
      if (!Array.isArray(model.values) || model.values.length === 0
        || model.values.some((value) => typeof value !== 'string' || value.length === 0)
        || new Set(model.values).size !== model.values.length) {
        throw new Error(`invalid enum values: ${spec.name}`);
      }
      return;
    case 'switch':
      checkKeys(model, ['kind']);
      return;
    default:
      throw new Error(`unsupported parameter model: ${spec.name}`);
  }
}

export function modelDescription(model: ParameterModel): string {
  switch (model.kind) {
    case 'int32': return `int32; 十进制整数; 范围 ${model.min}-${model.max}`;
    case 'enum': return `enum; 可选: ${model.values.join(', ')}`;
    case 'switch': return 'switch; 出现=true, 未出现=false; 不接受值';
  }
}

export function isModelValue<M extends ParameterModel>(model: M, value: unknown): value is ModelValue<M> {
  switch (model.kind) {
    case 'int32': return typeof value === 'number' && Number.isInteger(value)
      && value >= model.min && value <= model.max && value >= INT32_MIN && value <= INT32_MAX;
    case 'enum': return typeof value === 'string' && model.values.includes(value);
    case 'switch': return typeof value === 'boolean';
  }
}
