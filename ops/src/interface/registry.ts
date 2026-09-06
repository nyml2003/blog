import { defineCommand, defineGroup, type CommandContext, type CommandDefinition } from '../domain/commands.ts';
import { runWebQuality } from '../application/commands.ts';
import { runCheck } from '../application/check.ts';
import { runDeliveryBuild, runRuntimeMode, type RuntimePorts } from '../application/runtime.ts';
import { dataModeError, planMode, scenarioError, type DataMode, type MockScenario, type RuntimeMode } from '../domain/runtime.ts';
import { portOptionError } from '../domain/port-allocation.ts';

const FAILURE = { code: 20, meaning: '执行失败（构建失败、端口耗尽、服务启动失败或运行中的服务退出）' };
const SIGINT = { code: 130, meaning: 'SIGINT（Ctrl-C）触发的清理退出' };
const SIGTERM = { code: 143, meaning: 'SIGTERM 触发的清理退出' };
const SCENARIOS = 'default, empty, slow, server-error, malformed-response';

function runtimePorts(context: CommandContext): RuntimePorts {
  return {
    process: context.process,
    supervisor: context.supervisor,
    probe: context.probe,
    readiness: context.readiness,
    binaries: context.binaries,
    log: context.log,
    fs: context.fs,
    signals: context.signals,
    root: context.workspace.root,
  };
}

function runtimeHandler(mode: RuntimeMode): CommandDefinition['handler'] {
  return (context, args) => runRuntimeMode(planMode(mode, {
    scenario: typeof args.scenario === 'string' ? args.scenario as MockScenario : undefined,
    dataMode: typeof args.data === 'string' ? args.data as DataMode : undefined,
    webPort: typeof args['web-port'] === 'number' ? args['web-port'] : undefined,
    productPort: typeof args['product-port'] === 'number' ? args['product-port'] : undefined,
    dataPort: typeof args['data-port'] === 'number' ? args['data-port'] : undefined,
    mockPort: typeof args['mock-port'] === 'number' ? args['mock-port'] : undefined,
    watch: args.watch === true,
  }), runtimePorts(context), { dryRun: context.dryRun, json: context.json });
}

function portOption(name: string, description: string, fallback: number) {
  return { name, type: 'number' as const, valueName: 'PORT' as const, description, validate: portOptionError, default: fallback };
}

export const commandDefinitions: readonly CommandDefinition[] = [
  defineCommand({ path: ['workspace', 'doctor'], summary: '检查本地开发依赖', description: '验证 Node、pnpm、Rust 和 Cargo 是否可用。', examples: ['ops workspace doctor'], exitCodes: [{ code: 0, meaning: '依赖齐全' }, { code: 20, meaning: '缺少依赖' }] }, async ({ process: p, workspace, reporter, dryRun }) => { let ok = true; reporter.section(dryRun ? 'workspace doctor dry-run' : 'workspace doctor'); for (const name of ['node', 'pnpm', 'rustc', 'cargo']) { if (dryRun) { reporter.info(`检查命令: ${name}`); continue; } const r = await p.run('sh', ['-c', `command -v ${name}`], workspace.root); if (r.code) { ok = false; reporter.fail(`${name} missing`); } else reporter.ok(`${name} available`); } return ok ? 0 : 20 }),
  defineCommand({ path: ['quality', 'check'], summary: '执行项目质量检查', description: '运行 Rust 三件套（cargo fmt --all --check、cargo clippy -D warnings、cargo test --workspace）、ops 契约测试、前端 typecheck/lint/format/build 和跨端依赖边界检查。', examples: ['ops quality check'], exitCodes: [{ code: 0, meaning: '检查通过' }, { code: 20, meaning: '检查失败' }] }, ({ workspace, process, fs, reporter, dryRun }) => { if (dryRun) { reporter.section('quality check dry-run'); reporter.info('将执行 cargo fmt --all --check、cargo clippy --workspace --all-targets -- -D warnings、cargo test --workspace、ops 契约测试、pnpm typecheck/lint/format:check/build 和前端依赖边界检查'); return 0; } return runCheck(workspace, process, fs, reporter).then((ok) => ok ? 0 : 20); }),
  defineCommand({ path: ['quality', 'lint'], summary: '运行前端 Oxlint', description: '使用 pnpm 执行 blog-web 的 lint 脚本，并将 warning 视为失败。', examples: ['ops quality lint'], exitCodes: [{ code: 0, meaning: 'lint 通过' }, { code: 20, meaning: 'lint 失败' }] }, ({ workspace, process, reporter, dryRun }) => { if (dryRun) { reporter.section('quality lint dry-run'); reporter.info('pnpm -C src/frontend run lint'); return 0; } return runWebQuality(workspace, process, reporter, 'lint').then((ok) => ok ? 0 : 20); }),
  defineCommand({ path: ['quality', 'format'], summary: '格式化前端源文件', description: '默认写入 Biome 格式化结果；使用 --check 时只检查、不修改文件。', examples: ['ops quality format --check'], options: [{ name: 'check', type: 'boolean', description: '只检查格式，不写入文件' }], exitCodes: [{ code: 0, meaning: '格式化通过' }, { code: 20, meaning: '格式化失败或存在未格式化文件' }] }, ({ workspace, process, reporter, dryRun }, args) => { const check = args.check === true; if (dryRun) { reporter.section('quality format dry-run'); reporter.info(`pnpm -C src/frontend run ${check ? 'format:check' : 'format'}`); return 0; } return runWebQuality(workspace, process, reporter, 'format', check).then((ok) => ok ? 0 : 20); }),
  defineCommand({
    path: ['delivery', 'build'],
    summary: '构建前端与 Rust 交付物',
    description: '构建 web/dist 与 Rust Product/Data/Mock 交付 binary；不编译任何 Go 目标，不启动任何服务进程。',
    examples: ['ops delivery build', 'ops delivery build --dry-run', 'ops delivery build --json'],
    exitCodes: [{ code: 0, meaning: '构建成功' }, FAILURE],
  }, (context) => runDeliveryBuild(runtimePorts(context), { dryRun: context.dryRun, json: context.json })),
  defineCommand({
    path: ['runtime', 'dev'],
    summary: '前端开发栈: Vite + Mock Product API',
    description: '启动 Mock（--scenario 选择命名场景）与 Vite dev server，并把 Mock 实际地址注入 BLOG_API_ORIGIN；不启动 Product/Data，页面数据只来自 Mock。最终访问地址是 Vite 地址。',
    examples: ['ops runtime dev', 'ops runtime dev --scenario empty', 'ops runtime dev --web-port 5173 --mock-port 9090', 'ops runtime dev --dry-run', 'ops runtime dev --json'],
    options: [
      { name: 'scenario', type: 'string', default: 'default', valueName: 'NAME', description: `Mock 命名场景: ${SCENARIOS}`, validate: scenarioError },
      portOption('web-port', 'Vite 候选端口', 5173),
      portOption('mock-port', 'Mock 候选端口', 9090),
    ],
    exitCodes: [{ code: 0, meaning: '--dry-run 打印计划（运行中的模式没有 0 退出路径，正常停止只能是 130/143）' }, FAILURE, SIGINT, SIGTERM],
  }, runtimeHandler('dev')),
  defineCommand({
    path: ['runtime', 'backend'],
    summary: '后端 API 栈: Product + Data（无页面）',
    description: '启动 Rust Product API-only 与 Rust Data Server（默认 mock 语义，不创建 SQLite 文件）；不挂载前端、不启动 Vite，因此没有页面入口，只有 API 基址。',
    examples: ['ops runtime backend', 'ops runtime backend --data test', 'ops runtime backend --data mock --product-port 18080 --data-port 18081'],
    options: [
      { name: 'data', type: 'string', default: 'mock', valueName: 'MODE', description: '数据语义: mock 或 test', validate: dataModeError },
      portOption('product-port', 'Product 候选端口', 8080),
      portOption('data-port', 'Data 候选端口', 8081),
    ],
    exitCodes: [{ code: 0, meaning: '--dry-run 打印计划（运行中的模式没有 0 退出路径，正常停止只能是 130/143）' }, FAILURE, SIGINT, SIGTERM],
  }, runtimeHandler('backend')),
  defineCommand({
    path: ['runtime', 'integration'],
    summary: '集成栈: 先构建前端，Product 挂载 web/dist',
    description: '先构建 web/dist（--watch 时持续重建），再启动 Rust Product（挂载 web/dist，页面与 /api 同源）与 Rust Data(test)；不启动 Vite。最终访问地址是 Product 地址。这是原 ops runtime serve 的迁移目标。',
    examples: ['ops runtime integration', 'ops runtime integration --watch', 'ops runtime integration --product-port 8080 --data-port 8081'],
    options: [
      { name: 'watch', type: 'boolean', description: '持续重建 web/dist；构建失败会停止服务栈' },
      portOption('product-port', 'Product 候选端口', 8080),
      portOption('data-port', 'Data 候选端口', 8081),
    ],
    exitCodes: [{ code: 0, meaning: '--dry-run 打印计划（运行中的模式没有 0 退出路径，正常停止只能是 130/143）' }, FAILURE, SIGINT, SIGTERM],
  }, runtimeHandler('integration')),
];

export const groupDefinitions = [
  defineGroup({ path: ['workspace'], summary: '检查', description: '确认本地开发依赖是否齐全。', order: 10, workflow: '首次进入仓库' }),
  defineGroup({ path: ['quality'], summary: '质量', description: '运行格式、静态检查、测试和前端质量任务。', order: 20, workflow: '提交前验证' }),
  defineGroup({
    path: ['runtime'],
    summary: '运行模式',
    description: '三种运行模式：dev 只有 Vite + Mock（无真实后端，页面入口是 Vite 地址）；backend 只有 Product + Data（真实后端，无页面入口，API 基址是 Product 地址）；integration 先构建前端再由 Product 挂载 web/dist（真实后端，页面入口是 Product 地址）。端口以实际绑定结果为准，Ctrl-C 以 130 退出。',
    order: 30,
    workflow: '本地运行与联调',
  }),
  defineGroup({ path: ['delivery'], summary: '交付', description: '构建前端与 Rust 交付物。', order: 40, workflow: '交付前构建' }),
] as const;
