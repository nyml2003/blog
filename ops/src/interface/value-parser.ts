import { isModelValue, modelDescription, type ParameterModel } from '../domain/parameters.ts';

export type RawParameter = { kind: 'value'; text: string } | { kind: 'presence'; present: boolean };
export type ValueResult = { ok: true; value: string | number | boolean } | { ok: false; message: string };

export function parseValue(model: ParameterModel, raw: RawParameter): ValueResult {
  if (model.kind === 'switch') {
    if (raw.kind !== 'presence') return { ok: false, message: 'switch 不接受值' };
    return { ok: true, value: raw.present };
  }
  if (raw.kind !== 'value') return { ok: false, message: `必须显式给值 (${modelDescription(model)})` };
  if (model.kind === 'enum') {
    if (!isModelValue(model, raw.text)) {
      return { ok: false, message: `非法值: ${JSON.stringify(raw.text)} (${modelDescription(model)})` };
    }
    return { ok: true, value: raw.text };
  }
  if (!/^[+-]?[0-9]+$/.test(raw.text)) {
    return { ok: false, message: `必须是十进制整数: ${JSON.stringify(raw.text)} (${modelDescription(model)})` };
  }
  const value = Number(raw.text);
  if (!isModelValue(model, value)) {
    return { ok: false, message: `整数超出范围: ${raw.text} (${modelDescription(model)})` };
  }
  return { ok: true, value };
}
