import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommandArgs, extractGlobalSwitches } from './parser.ts';
import type { CommandMeta } from '../domain/commands.ts';

const meta = {
  path: ['example'],
  summary: 'example',
  positionals: [{ name: 'mode', model: { kind: 'enum', values: ['first', 'second'] }, description: 'mode' }],
  options: [
    { name: 'count', model: { kind: 'int32', min: -10, max: 10 }, description: 'count' },
    { name: 'verbose', model: { kind: 'switch' }, description: 'verbose' },
  ],
} as const satisfies CommandMeta;

test('fields parse explicit strings and switches produce complete boolean values', () => {
  assert.deepEqual(parseCommandArgs(meta, ['first', '--count', '-3']), { args: { mode: 'first', count: -3, verbose: false } });
  assert.deepEqual(parseCommandArgs(meta, ['--verbose', '--verbose', '--count=+3', 'second']), { args: { mode: 'second', count: 3, verbose: true } });
  assert.deepEqual(parseCommandArgs(meta, ['--count', '0', '--', 'first']), { args: { mode: 'first', count: 0, verbose: false } });
});

test('missing, duplicate, unknown and extra arguments fail before dispatch', () => {
  for (const [args, pattern] of [
    [[], /缺少位置参数/],
    [['first'], /缺少选项: --count/],
    [['first', '--count'], /选项缺少值/],
    [['first', '--count', '--verbose'], /选项缺少值/],
    [['first', '--count='], /十进制整数/],
    [['first', '--count', '1', '--count=1'], /重复选项/],
    [['first', '--wat'], /未知选项/],
    [['first', '--verbose', 'false', '--count', '1'], /位置参数过多/],
    [['first', '--verbose=false', '--count', '1'], /switch 不接受值/],
    [['first', '--verbose=true', '--count', '1'], /switch 不接受值/],
    [['first', '--no-verbose', '--count', '1'], /未知选项/],
  ] as const) {
    assert.match(JSON.stringify(parseCommandArgs(meta, args)), pattern);
  }
});

test('optional value options may be absent and still reject duplicates and invalid values', () => {
  const optionalMeta = {
    path: ['example'],
    summary: 'example',
    options: [
      { name: 'mode', model: { kind: 'enum', values: ['first', 'second'] }, description: 'mode' },
      { name: 'database-path', model: { kind: 'path' }, description: 'path', optional: true },
    ],
  } as const satisfies CommandMeta;
  assert.deepEqual(parseCommandArgs(optionalMeta, ['--mode', 'first']), { args: { mode: 'first' } });
  assert.deepEqual(
    parseCommandArgs(optionalMeta, ['--mode', 'first', '--database-path', '/tmp/a.db']),
    { args: { mode: 'first', 'database-path': '/tmp/a.db' } },
  );
  assert.match(
    JSON.stringify(parseCommandArgs(optionalMeta, ['--mode', 'first', '--database-path', '/a', '--database-path', '/b'])),
    /重复选项/,
  );
  assert.match(JSON.stringify(parseCommandArgs(optionalMeta, ['--mode', 'first', '--database-path', ''])), /非法路径/);
  assert.match(JSON.stringify(parseCommandArgs(optionalMeta, ['--database-path', '--mode', 'first'])), /选项缺少值/);
});

test('ambient configuration cannot supply a missing value', () => {
  const previous = process.env.EXAMPLE_COUNT;
  process.env.EXAMPLE_COUNT = '3';
  try {
    assert.match(JSON.stringify(parseCommandArgs(meta, ['first'])), /缺少选项: --count/);
  } finally {
    if (previous === undefined) delete process.env.EXAMPLE_COUNT;
    else process.env.EXAMPLE_COUNT = previous;
  }
});

test('globals use switch semantics and respect the end-of-options delimiter', () => {
  assert.deepEqual(extractGlobalSwitches(['--json', 'quality', 'check', '--dry-run', '--json']), {
    raw: ['quality', 'check'], indices: [1, 2], controls: { help: false, dryRun: true, json: true },
  });
  assert.deepEqual(extractGlobalSwitches(['--', '--json', '--help']), {
    raw: ['--', '--json', '--help'], indices: [0, 1, 2], controls: { help: false, dryRun: false, json: false },
  });
  for (const name of ['help', 'json', 'dry-run']) {
    for (const value of ['true', 'false', '']) {
      assert.match(JSON.stringify(extractGlobalSwitches(['--' + name + '=' + value])), /switch 不接受值/);
    }
  }
});
