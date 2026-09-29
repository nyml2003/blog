import test from 'node:test';
import assert from 'node:assert/strict';
import { reflectCommandRegistry } from '@fluvient-cli/cli-kit/commands.ts';
import { commandDefinitions, groupDefinitions } from '../../src/main.ts';
import { renderCommandHelp } from '@fluvient-cli/cli-kit/help.ts';

const registry = reflectCommandRegistry(commandDefinitions, groupDefinitions);

test('root and leaf help are generated from the same registry', () => {
  const root = renderCommandHelp(registry);
  assert.match(root, /命令分组:/);
  assert.match(root, /可执行命令:/);
  assert.match(root, /workspace/);
  assert.match(root, /quality/);
  assert.match(root, /delivery/);
  assert.match(root, /e2e/);
  for (const definition of commandDefinitions) assert.match(root, new RegExp(definition.meta.path.join(' ')));
  assert.match(renderCommandHelp(registry, ['runtime', 'dev']), /BLOG_API_ORIGIN|Mock/);
  assert.match(renderCommandHelp(registry, ['runtime', 'dev']), /示例:/);
  assert.match(renderCommandHelp(registry, ['runtime', 'dev']), /退出码:/);
});

test('group help lists only immediate children', () => {
  const help = renderCommandHelp(registry, ['runtime']);
  assert.match(help, /dev/);
  assert.match(help, /backend/);
  assert.match(help, /integration/);
  assert.doesNotMatch(help, /serve/);
  assert.match(help, /工作流: 本地运行与联调/);
});

test('runtime help distinguishes the three modes without reading the plan', () => {
  const help = renderCommandHelp(registry, ['runtime']);
  assert.match(help, /无真实后端/);
  assert.match(help, /无页面入口/);
  assert.match(help, /页面入口是 Product 地址/);
  for (const role of ['dev', 'backend', 'integration']) {
    const leaf = renderCommandHelp(registry, ['runtime', role]);
    assert.match(leaf, /访问地址|入口|API 基址|Vite 地址|Product 地址/);
  }
});

test('every leaf advertises the unified exit codes, never the retired 1 and 2', () => {
  for (const definition of commandDefinitions) {
    const codes = renderCommandHelp(registry, [...definition.meta.path]).match(/退出码:\n([\s\S]*)/)?.[1] ?? '';
    assert.match(codes, /10  参数或命令用法错误/, definition.meta.path.join(' '));
    assert.doesNotMatch(codes, /^\s*2  /m);
    assert.doesNotMatch(codes, /^\s*1  /m);
  }
});

test('field models generate required values, complete choices and switch semantics', () => {
  const dev = renderCommandHelp(registry, ['runtime', 'dev']);
  assert.match(dev, /--scenario <enum>/);
  assert.match(dev, /--web-port <int32>/);
  assert.match(dev, /必填/);
  assert.match(dev, /1024-65535/);
  assert.match(dev, /default, empty, slow, server-error, malformed-response/);
  assert.doesNotMatch(dev, /\[默认:|env:/);
  const format = renderCommandHelp(registry, ['quality', 'format']);
  assert.match(format, /\[--check\]/);
  assert.match(format, /出现=true, 未出现=false/);
  assert.doesNotMatch(format, /--check </);
});

test('optional value options print brackets and an optional marker', () => {
  const backend = renderCommandHelp(registry, ['runtime', 'backend']);
  assert.match(backend, /\[--database-path <path>\]/);
  assert.match(backend, /--database-path <path>.*\(可选; path/);
  assert.match(backend, /--data <enum>.*\(必填; enum; 可选: mock, test, prod\)/);
  assert.match(backend, /--database-path ~\/\.local\/state\/blog\/prod\.db/);
});
