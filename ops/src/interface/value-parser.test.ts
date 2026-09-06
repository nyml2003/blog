import test from 'node:test';
import assert from 'node:assert/strict';
import { parseValue } from './value-parser.ts';
import { INT32_MIN, INT32_MAX, validateParameter, type ParameterSpec } from '../domain/parameters.ts';

const integer = { kind: 'int32', min: INT32_MIN, max: INT32_MAX } as const;

test('int32 preserves signed decimal integers without truncation or wrapping', () => {
  for (const [text, value] of [['-2147483648', INT32_MIN], ['2147483647', INT32_MAX], ['+12', 12], ['0012', 12], ['0', 0]] as const) {
    assert.deepEqual(parseValue(integer, { kind: 'value', text }), { ok: true, value });
  }
  for (const text of ['', ' ', ' 12', '12 ', '1.5', '1e3', '0x10', '12px', '--1', 'NaN', 'Infinity', '2147483648', '-2147483649', '9'.repeat(400)]) {
    assert.equal(parseValue(integer, { kind: 'value', text }).ok, false, text);
  }
  const port = { kind: 'int32', min: 1024, max: 65535 } as const;
  for (const text of ['1024', '65535']) assert.equal(parseValue(port, { kind: 'value', text }).ok, true);
  for (const text of ['0', '1023', '65536', '-1']) assert.equal(parseValue(port, { kind: 'value', text }).ok, false);
});

test('enum matching is exact and errors list the complete choices', () => {
  const model = { kind: 'enum', values: ['default', 'empty', 'slow', 'server-error', 'malformed-response'] } as const;
  for (const text of model.values) assert.deepEqual(parseValue(model, { kind: 'value', text }), { ok: true, value: text });
  for (const text of ['', 'DEFAULT', ' default', 'def', 'production']) {
    const result = parseValue(model, { kind: 'value', text });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error('expected enum error');
    for (const choice of model.values) assert.ok(result.message.includes(choice));
  }
});

test('switch accepts presence only and value models cannot manufacture missing input', () => {
  for (const present of [true, false]) {
    assert.deepEqual(parseValue({ kind: 'switch' }, { kind: 'presence', present }), { ok: true, value: present });
  }
  assert.equal(parseValue({ kind: 'switch' }, { kind: 'value', text: 'false' }).ok, false);
  assert.equal(parseValue(integer, { kind: 'presence', present: false }).ok, false);
});

test('field declarations reject custom hooks, unknown models and invalid constraints', () => {
  const valid = { name: 'count', description: 'count', model: integer };
  validateParameter(valid);
  for (const key of ['default', 'env', 'validate', 'parse', 'required', 'type']) {
    assert.throws(() => validateParameter({ ...valid, [key]: () => 1 }), /unsupported parameter metadata/);
  }
  const malformed: unknown[] = [
    { kind: 'int32', min: INT32_MIN - 1, max: INT32_MAX },
    { kind: 'int32', min: 2, max: 1 },
    { kind: 'int32', min: 0.5, max: 2 },
    { kind: 'int32' },
    { kind: 'enum', values: [] },
    { kind: 'enum', values: ['a', 'a'] },
    { kind: 'enum', values: [''] },
    { kind: 'enum', values: [1] },
    { kind: 'switch', default: true },
    { kind: 'path' },
    { kind: 'string' },
  ];
  for (const model of malformed) {
    // Deliberately bypass the static API to exercise registration's runtime boundary.
    const spec = { ...valid, model } as ParameterSpec;
    assert.throws(() => validateParameter(spec), /invalid|unsupported/);
  }
});
