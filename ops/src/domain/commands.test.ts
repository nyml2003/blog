import test from 'node:test';
import assert from 'node:assert/strict';
import { defineCommand, reflectCommandRegistry, validateRegistry } from './commands.ts';

const handler = () => 0;

test('registry reflects command metadata into detailed help', () => {
  const command = defineCommand({ path: ['quality', 'check'], summary: 'Run checks', options: [{ name: 'report', model: { kind: 'switch' }, description: 'JSON output' }], examples: ['ops quality check --json'] }, handler);
  const registry = reflectCommandRegistry([command]);
  assert.equal(registry.resolve(['quality', 'check']), command);
  assert.equal(registry.groups([])[0]?.meta.path[0], 'quality');
});

test('registry rejects duplicate paths and leaf/group conflicts', () => {
  const first = defineCommand({ path: ['runtime', 'serve'], summary: 'Serve' }, handler);
  assert.throws(() => validateRegistry([first, defineCommand({ path: ['runtime', 'serve'], summary: 'Duplicate' }, handler)]), /duplicate command path/);
  assert.throws(() => validateRegistry([defineCommand({ path: ['runtime'], summary: 'Group' }, handler), first]), /both leaf and group/);
});

test('registry rejects duplicate argument names and invalid paths', () => {
  assert.throws(() => validateRegistry([defineCommand({ path: ['bad path'], summary: 'Bad' }, handler)]), /invalid command path/);
  assert.throws(() => validateRegistry([defineCommand({ path: ['quality', 'check'], summary: 'Bad', options: [{ name: 'x', model: { kind: 'switch' }, description: 'x' }, { name: 'x', model: { kind: 'switch' }, description: 'x' }] }, handler)]), /duplicate argument/);
});

test('declarations are immutable and dispatch rejects incomplete or untyped arguments', () => {
  const command = defineCommand({
    path: ['example'], summary: 'example',
    options: [
      { name: 'count', description: 'count', model: { kind: 'int32', min: 1, max: 10 } },
      { name: 'mode', description: 'mode', model: { kind: 'enum', values: ['first', 'second'] } },
      { name: 'verbose', description: 'verbose', model: { kind: 'switch' } },
    ],
  }, (_context, args) => {
    const count: number = args.count;
    const mode: 'first' | 'second' = args.mode;
    const verbose: boolean = args.verbose;
    assert.equal(mode, 'first');
    assert.equal(verbose, false);
    return count;
  });
  const model = command.meta.options?.[1].model;
  assert.ok(model?.kind === 'enum');
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.values), true);
  // Reflect invokes the erased registry boundary with deliberately malformed caller input.
  assert.throws(() => Reflect.apply(command.handler, undefined, [{}, {}]), /invalid parsed arguments/);
  assert.throws(() => Reflect.apply(command.handler, undefined, [{}, { count: '1', mode: 'first', verbose: false }]), /invalid parsed arguments/);
  assert.throws(() => Reflect.apply(command.handler, undefined, [{}, { count: 1, mode: 'other', verbose: false }]), /invalid parsed arguments/);
  assert.equal(Reflect.apply(command.handler, undefined, [{}, { count: 1, mode: 'first', verbose: false }]), 1);
});

test('local fields cannot override global switches', () => {
  const command = defineCommand({ path: ['example'], summary: 'example', options: [{ name: 'json', description: 'json', model: { kind: 'switch' } }] }, handler);
  assert.throws(() => validateRegistry([command]), /reserved global switch/);
});
