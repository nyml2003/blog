import test from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../../src/main.ts';

async function capture(args: readonly string[]) {
  const output: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...values) => output.push(values.join(' '));
  console.error = (...values) => errors.push(values.join(' '));
  try {
    const code = await main(args);
    return { code, output: output.join('\n'), errors: errors.join('\n') };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test('root help lists every leaf in a stable group order', async () => {
  const result = await capture(['help']);
  assert.equal(result.code, 0);
  assert.ok(result.output.indexOf('workspace') < result.output.indexOf('quality'));
  assert.ok(result.output.indexOf('quality') < result.output.indexOf('runtime'));
  assert.ok(result.output.indexOf('runtime') < result.output.indexOf('delivery'));
  for (const command of [
    'workspace doctor',
    'quality check',
    'quality lint',
    'quality format',
    'admin credentials init',
    'admin recovery regenerate',
    'content repository init',
    'delivery build',
    'release',
    'runtime dev',
    'runtime backend',
    'runtime integration',
  ]) {
    assert.match(result.output, new RegExp(`ops ${command}`));
  }
  assert.doesNotMatch(result.output, /runtime serve|database migrate|database\s{2}/);
});

test('global version works before or after a command path', async () => {
  const root = await capture(['--version']);
  const leaf = await capture(['quality', 'check', '--version']);
  assert.equal(root.code, 0);
  assert.equal(leaf.code, 0);
  assert.match(root.output, /^\d+\.\d+\.\d+$/);
  assert.equal(leaf.output, root.output);
});

test('help spellings and direct group navigation are equivalent', async () => {
  const fromHelp = await capture(['help', 'quality']);
  const fromFlag = await capture(['quality', '--help']);
  const fromSuffix = await capture(['quality', 'help']);
  const direct = await capture(['quality']);
  assert.equal(fromHelp.code, 0);
  assert.equal(fromFlag.code, 0);
  assert.equal(fromSuffix.code, 0);
  assert.equal(direct.code, 0);
  assert.equal(fromHelp.output, fromFlag.output);
  assert.equal(fromHelp.output, fromSuffix.output);
  assert.equal(fromHelp.output, direct.output);
});

test('usage errors explain the correction, show the nearest help and exit 10', async () => {
  const unknownOption = await capture(['help', 'quality', '--wat']);
  assert.equal(unknownOption.code, 10);
  assert.match(unknownOption.errors, /未知选项: --wat/);
  assert.match(unknownOption.errors, /如何修正/);
  assert.match(unknownOption.errors, /ops quality --help/);
  assert.match(unknownOption.output, /命令分组: quality/);

  const typo = await capture(['quality', 'chcek']);
  assert.equal(typo.code, 10);
  assert.match(typo.errors, /未知命令/);
  assert.match(typo.errors, /ops quality check/);
  assert.match(typo.output, /用法: ops quality check/);
});

test('leaf argument errors exit 10 and point at leaf help', async () => {
  const missingValue = await capture(['runtime', 'dev', '--web-port']);
  assert.equal(missingValue.code, 10);
  assert.match(missingValue.errors, /选项缺少值: --web-port/);
  assert.match(missingValue.errors, /查看帮助: ops runtime dev --help/);
  assert.match(missingValue.output, /示例:/);
});

test('port overrides are validated as usage errors before any process starts', async () => {
  for (const value of ['1023', '65536', '0', 'abc']) {
    const result = await capture(['runtime', 'backend', '--content-source', 'fixture', '--data-port', value]);
    assert.equal(result.code, 10, value);
    assert.match(result.output, /用法: ops runtime backend/);
  }
  assert.match((await capture(['runtime', 'backend', '--content-source', 'fixture', '--data-port', '1023'])).errors, /1023/);
});

test('unknown scenario names and invalid data modes are usage errors', async () => {
  const scenario = await capture(['runtime', 'dev', '--scenario', 'nope']);
  assert.equal(scenario.code, 10);
  assert.match(scenario.errors, /非法值: "nope"/);
  assert.match(scenario.errors, /default, empty, slow/);

  const data = await capture(['runtime', 'backend', '--content-source', 'fixture', '--data', 'production', '--product-port', '8080', '--data-port', '8081']);
  assert.equal(data.code, 10);
  assert.match(data.errors, /非法值: "production"/);
  assert.match(data.errors, /mock, test, prod/);
});

test('prod requires an explicit database path while other data modes forbid it', async () => {
  const missing = await capture(['runtime', 'backend', '--content-source', 'fixture', '--data', 'prod', '--product-port', '8080', '--data-port', '8081']);
  assert.equal(missing.code, 10);
  assert.match(missing.errors, /--data prod 必须显式提供 --database-path/);
  assert.match(missing.errors, /如何修正/);
  assert.match(missing.output, /用法: ops runtime backend/);
  assert.doesNotMatch(missing.output, /dry-run:/);

  const forbidden = await capture(['runtime', 'backend', '--content-source', 'fixture', '--data', 'test', '--database-path', '/tmp/x.db', '--product-port', '8080', '--data-port', '8081']);
  assert.equal(forbidden.code, 10);
  assert.match(forbidden.errors, /--database-path 仅允许与 --data prod 一起使用/);

  const dryRun = await capture(['runtime', 'backend', '--content-source', 'fixture', '--data', 'prod', '--database-path', '/tmp/x.db', '--product-port', '18080', '--data-port', '18081', '--dry-run']);
  assert.equal(dryRun.code, 0);
  assert.match(dryRun.output, /dry-run: runtime backend/);
  assert.match(dryRun.output, /--data prod --database-path \/tmp\/x\.db/);
});

test('integration refuses --data and the retired --host/--listen options', async () => {
  const data = await capture(['runtime', 'integration', '--content-source', 'fixture', '--data', 'mock']);
  assert.equal(data.code, 10);
  assert.match(data.errors, /未知选项: --data/);
  assert.doesNotMatch(data.output, /^ {2,6}--data\s/m);

  const listen = await capture(['runtime', 'integration', '--content-source', 'fixture', '--listen', '127.0.0.1:8080']);
  assert.equal(listen.code, 10);
  assert.match(listen.errors, /未知选项: --listen/);
});

test('deleted commands point at their migration target and exit 10', async () => {
  const serve = await capture(['runtime', 'serve', '--listen', '127.0.0.1:8080']);
  assert.equal(serve.code, 10);
  assert.match(serve.errors, /命令已删除: runtime serve/);
  assert.match(serve.errors, /ops runtime integration/);

  const migrate = await capture(['database', 'migrate']);
  assert.equal(migrate.code, 10);
  assert.match(migrate.errors, /命令已删除: database migrate/);
  assert.match(migrate.errors, /ops runtime backend/);
});

test('e2e requires an explicit mode and validates scenario combinations before browser setup', async () => {
  const missingMode = await capture(['e2e', '--mode']);
  assert.equal(missingMode.code, 10);
  assert.match(missingMode.errors, /选项缺少值|缺少必填选项/);

  const missingScenario = await capture(['e2e', '--mode', 'dev', '--playwright-module', 'playwright-core/index.mjs', '--chromium-path', '/tmp/chromium']);
  assert.equal(missingScenario.code, 10);
  assert.match(missingScenario.errors, /--mode dev 必须显式提供 --scenario/);

  const invalidScenario = await capture(['e2e', '--mode', 'integration', '--scenario', 'empty', '--playwright-module', 'playwright-core/index.mjs', '--chromium-path', '/tmp/chromium']);
  assert.equal(invalidScenario.code, 10);
  assert.match(invalidScenario.errors, /--scenario 仅允许与 --mode dev 一起使用/);

  const dryRun = await capture(['e2e', '--mode', 'dev', '--scenario', 'empty', '--playwright-module', 'playwright-core/index.mjs', '--chromium-path', '/tmp/chromium', '--dry-run']);
  assert.equal(dryRun.code, 0);
  assert.match(dryRun.output, /不启动进程、不绑定端口、不写文件/);
});

test('dry run prints the plan without binding ports or spawning processes', async () => {
  const dev = await capture(['runtime', 'dev', '--scenario', 'default', '--web-port', '5173', '--mock-port', '9090', '--dry-run']);
  assert.equal(dev.code, 0);
  assert.match(dev.output, /dry-run: runtime dev/);
  assert.match(dev.output, /\[mock\] 候选端口 9090/);
  assert.match(dev.output, /\[web\] 候选端口 5173/);
  assert.match(dev.output, /入口: http:\/\/127\.0\.0\.1:5173/);
  assert.doesNotMatch(dev.output, /就绪/);

  const backend = await capture(['runtime', 'backend', '--content-source', 'fixture', '--data', 'mock', '--product-port', '8080', '--data-port', '8081', '--dry-run']);
  assert.equal(backend.code, 0);
  assert.match(backend.output, /\[data\] 候选端口 8081/);
  assert.match(backend.output, /\[product\] 候选端口 8080/);
  assert.match(backend.output, /无（API-only/);

  const build = await capture(['delivery', 'build', '--dry-run']);
  assert.equal(build.code, 0);
  assert.match(build.output, /pnpm -C src\/frontend run build/);
  assert.match(build.output, /cargo build --release/);
  assert.doesNotMatch(build.output, /(^|\s)go build/);
});

test('dry run honours port overrides in the printed plan', async () => {
  const result = await capture(['runtime', 'integration', '--content-source', 'fixture', '--product-port', '18080', '--data-port', '18081', '--dry-run']);
  assert.equal(result.code, 0);
  assert.match(result.output, /\[product\] 候选端口 18080/);
  assert.match(result.output, /\[data\] 候选端口 18081/);
});

test('value options are mandatory even for dry runs and switches cannot take values', async () => {
  for (const mode of ['dev', 'backend', 'integration']) {
    const result = await capture(['runtime', mode, '--dry-run']);
    assert.equal(result.code, 10);
    assert.match(result.errors, /缺少选项/);
    assert.doesNotMatch(result.output, /\[ops\] dry-run:/);
  }
  for (const flag of ['check', 'json', 'dry-run', 'help']) {
    for (const value of ['true', 'false']) {
      const result = await capture(['quality', 'format', '--' + flag + '=' + value]);
      assert.equal(result.code, 10);
      assert.match(result.errors, /switch 不接受值/);
    }
  }
  assert.equal((await capture(['quality', 'format', '--check', 'false', '--dry-run'])).code, 10);
  assert.equal((await capture(['quality', 'format', '--', '--help'])).code, 10);
});

test('format switch chooses write or check without running the formatter in a dry run', async () => {
  const write = await capture(['quality', 'format', '--dry-run']);
  const check = await capture(['quality', 'format', '--check', '--check', '--dry-run']);
  assert.equal(write.code, 0);
  assert.equal(check.code, 0);
  assert.match(write.output, /run format$/m);
  assert.doesNotMatch(write.output, /run format:check/);
  assert.match(check.output, /run format:check/);
});

test('watch switch adds the watcher and complete explicit runtime arguments survive parsing', async () => {
  const args = ['runtime', 'integration', '--content-source', 'fixture', '--product-port', '18080', '--data-port', '18081', '--dry-run'];
  const once = await capture(args);
  const watch = await capture([...args, '--watch', '--watch']);
  assert.equal(once.code, 0);
  assert.equal(watch.code, 0);
  assert.doesNotMatch(once.output, /构建监视:/);
  assert.match(watch.output, /构建监视:/);
  assert.equal((await capture([...args, '--watch=false'])).code, 10);
  assert.equal((await capture([...args, '--product-port', '18080'])).code, 10);
});

test('leaf help remains accessible without mandatory values in all three spellings', async () => {
  const first = await capture(['help', 'runtime', 'dev']);
  const second = await capture(['runtime', 'dev', '--help', '--help']);
  const third = await capture(['runtime', 'dev', 'help']);
  assert.equal(first.code, 0);
  assert.equal(second.code, 0);
  assert.equal(third.code, 0);
  assert.equal(first.output, second.output);
  assert.equal(first.output, third.output);
});

test('global switches retain routing positions without repairing missing argument values', async () => {
  const bad = await capture(['runtime', 'backend', '--content-source', 'fixture', '--data', '--json', 'mock', '--product-port', '8080', '--data-port', '8081', '--dry-run']);
  assert.equal(bad.code, 10);
  assert.match(bad.errors, /选项缺少值: --data/);
  const good = await capture(['--dry-run', 'runtime', '--json', 'backend', '--content-source', 'fixture', '--data', 'mock', '--product-port', '8080', '--data-port', '8081']);
  assert.equal(good.code, 0);
  assert.equal(JSON.parse(good.output).command, 'runtime backend');
});
