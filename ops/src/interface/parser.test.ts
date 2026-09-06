import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommandArgs } from './parser.ts';

const meta = {
  path: ['example'] as const,
  summary: 'example',
  positionals: [{ name: 'name', type: 'string' as const, required: true, description: 'name' }],
  options: [
    { name: 'count', type: 'number' as const, env: 'EXAMPLE_COUNT', default: 1, description: 'count' },
    { name: 'verbose', type: 'boolean' as const, description: 'verbose' },
  ],
};

test('parser applies CLI over environment over defaults', () => {
  const result = parseCommandArgs(meta, ['alice', '--count', '3', '--verbose'], { EXAMPLE_COUNT: '2' });
  assert.deepEqual(result, { args: { name: 'alice', count: 3, verbose: true } });
  const fromEnv = parseCommandArgs(meta, ['alice'], { EXAMPLE_COUNT: '4' });
  assert.deepEqual(fromEnv, { args: { name: 'alice', count: 4 } });
});

test('parser rejects unknown, missing and extra arguments', () => {
  assert.match(JSON.stringify(parseCommandArgs(meta, [], {})), /缺少位置参数/);
  assert.match(JSON.stringify(parseCommandArgs(meta, ['a', 'b'], {})), /位置参数过多/);
  assert.match(JSON.stringify(parseCommandArgs(meta, ['a', '--wat'], {})), /未知选项/);
});
