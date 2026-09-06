import test from 'node:test';
import assert from 'node:assert/strict';
import { defineCommand, reflectCommandRegistry, validateRegistry } from './commands.ts';

const handler = () => 0;

test('registry reflects command metadata into detailed help', () => {
  const command = defineCommand({ path: ['quality', 'check'], summary: 'Run checks', options: [{ name: 'json', type: 'boolean', description: 'JSON output' }], examples: ['ops quality check --json'] }, handler);
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
  assert.throws(() => validateRegistry([defineCommand({ path: ['quality', 'check'], summary: 'Bad', options: [{ name: 'x', type: 'boolean', description: 'x' }, { name: 'x', type: 'boolean', description: 'x' }] }, handler)]), /duplicate argument/);
});
