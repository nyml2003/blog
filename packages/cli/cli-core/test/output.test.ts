import assert from 'node:assert/strict';
import test from 'node:test';
import { ConsoleOutputPort } from '../src/output.ts';

test('console output redacts sensitive fields and truncates long diagnostic values', () => {
  const lines: string[] = [];
  const errors: string[] = [];
  const original = console.log;
  const originalError = console.error;
  console.log = (...values) => lines.push(values.join(' '));
  console.error = (...values) => errors.push(values.join(' '));
  try {
    new ConsoleOutputPort(true).log({ level: 'error', source: 'ops', channel: 'stderr', message: { key: 'diagnostic', params: { message: 'token=inline-secret' } }, data: { token: 'secret-value', output: 'x'.repeat(2100) } });
  } finally {
    console.log = original;
    console.error = originalError;
  }
  assert.equal(lines.length, 0, 'stderr events must not be written to stdout');
  assert.match(errors[0] ?? '', /REDACTED/);
  assert.doesNotMatch(errors[0] ?? '', /inline-secret/);
  assert.match(errors[0] ?? '', /truncated/);
});

test('JSON child lines preserve the originating stream', () => {
  const lines: string[] = [];
  const errors: string[] = [];
  const original = console.log;
  const originalError = console.error;
  console.log = (...values) => lines.push(values.join(' '));
  console.error = (...values) => errors.push(values.join(' '));
  try {
    const output = new ConsoleOutputPort(true);
    output.log({ level: 'info', source: 'web', channel: 'stdout', message: { key: 'runtime.line', params: { message: 'ready' } } });
    output.log({ level: 'info', source: 'web', channel: 'stderr', message: { key: 'runtime.line', params: { message: 'warning' } } });
  } finally {
    console.log = original;
    console.error = originalError;
  }
  assert.deepEqual(lines.map((line) => JSON.parse(line).channel), ['stdout']);
  assert.deepEqual(errors.map((line) => JSON.parse(line).channel), ['stderr']);
  assert.ok([...lines, ...errors].every((line) => JSON.parse(line).schemaVersion === 1));
});
