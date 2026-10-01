import { defineCommand, defineGroup, type CommandContext, type CommandDefinition } from '@fluvient-cli/cli-kit/commands.ts';
import { runWebQuality } from './quality/commands.ts';
import { runCheck } from './quality/quality-check.ts';
import { runAdminCredentialCommand } from './admin/admin-auth.ts';
import { initializeContentRepository } from './content/content-repository.ts';
import { runDeliveryBuild, runRuntimeMode, type RuntimePorts } from './runtime/runtime.ts';
import { runDeployPackage, type DeployPorts } from './delivery/deploy-package.ts';
import { runDeployInstaller } from './delivery/deploy-installer.ts';
import { runPackageCheck } from './quality/package-check.ts';
import { planMode, MOCK_SCENARIOS, DATA_MODES, CONTENT_SOURCES } from './runtime/runtime-plan.ts';
import { DEPLOY_TARGETS } from './delivery/deploy-plan.ts';
import { RELEASE_KINDS, runRelease } from './release/release.ts';
import { PORT_MIN, PORT_MAX } from '@fluvient-cli/cli-kit/port-allocation.ts';
import { E2E_MODES, E2E_SCENARIOS, runE2e } from './e2e/e2e.ts';
import { E2E_PERF_PROFILES, runE2ePerf } from './e2e/perf.ts';
import { err, ok, type Result } from '@fluvient-cli/cli-kit/result.ts';
import { EXIT_FAILURE, EXIT_OK, EXIT_SIGINT, EXIT_SIGTERM, EXIT_USAGE, type OpsFailure, type OpsErrorCode } from '@fluvient-cli/cli-kit/errors.ts';

const FAILURE = { code: EXIT_FAILURE, meaning: '执行失败（构建失败、端口耗尽、服务启动失败或运行中的服务退出）' };
const SIGINT = { code: EXIT_SIGINT, meaning: 'SIGINT（Ctrl-C）触发的清理退出' };
function commandResult(success: boolean, code: OpsErrorCode = 'EXTERNAL_COMMAND_FAILED'): Result<{ readonly exitCode?: number }, OpsFailure> {
  return success ? ok({ exitCode: EXIT_OK }) : err({ code, message: code, details: [], exitCode: code === 'USAGE' ? EXIT_USAGE : EXIT_FAILURE });
}

function commandExitResult(exitCode: number): Result<{ readonly exitCode?: number }, OpsFailure> {
  if (exitCode === EXIT_OK) return ok({ exitCode: EXIT_OK });
  const code: OpsErrorCode = exitCode === EXIT_USAGE ? 'USAGE' : exitCode === EXIT_SIGINT || exitCode === EXIT_SIGTERM ? 'CANCELLED' : 'EXTERNAL_COMMAND_FAILED';
  return err({ code, message: code, details: [], exitCode });
}
const SIGTERM = { code: EXIT_SIGTERM, meaning: 'SIGTERM 触发的清理退出' };

function runtimePorts(context: CommandContext): RuntimePorts {
  return {
    process: context.process,
    supervisor: context.supervisor,
    probe: context.probe,
    readiness: context.readiness,
    binaries: context.binaries,
    log: context.log,
    output: context.output,
    fs: context.fs,
    signals: context.signals,
    root: context.workspace.root,
    environment: context.environment,
  };
}

function deployPorts(context: CommandContext): DeployPorts {
  return {
    process: context.process,
    fs: context.fs,
    reporter: context.reporter,
    root: context.workspace.root,
  };
}

function portOption<const N extends string>(name: N, description: string) {
  return { name, description, model: { kind: 'int32' as const, min: PORT_MIN, max: PORT_MAX } };
}

export const commandDefinitions: readonly CommandDefinition[] = [
  defineCommand({
    path: ['e2e'],
    summary: '运行浏览器端到端测试',
    description: '启动隔离的 runtime 栈，执行公开端 Playwright 旅程，保存截图并在结束时清理所有子进程。必须显式选择模式；不并入 quality check。',
    examples: ['ops e2e --mode integration --playwright-module playwright-core/index.mjs --chromium-path /nix/store/.../chromium', 'ops e2e --mode dev --scenario empty --playwright-module playwright-core/index.mjs --chromium-path /nix/store/.../chromium'],
    options: [
      { name: 'mode', description: 'E2E 运行栈（必须显式选择）', model: { kind: 'enum', values: E2E_MODES } },
      { name: 'scenario', description: 'dev Mock 场景（仅 --mode dev 可用）', model: { kind: 'enum', values: E2E_SCENARIOS }, optional: true },
      { name: 'playwright-module', description: 'Playwright 模块路径或模块名（必须显式提供）', model: { kind: 'path' } },
      { name: 'chromium-path', description: 'Chromium 可执行文件路径（必须显式提供）', model: { kind: 'path' } },
    ],
    exitCodes: [{ code: 0, meaning: '浏览器场景通过或 --dry-run 成功' }, { code: 10, meaning: '参数或命令用法错误' }, FAILURE],
  }, (context, args) => runE2e(context, args).then(commandExitResult)),
  defineCommand({
    path: ['perf', 'mobile'],
    summary: '度量移动端页面加载性能',
    description: '对 Mobile 公开页执行加载性能采样：冷加载与底栏切换两条旅程，按网络档位（unthrottled/slow4g/slow3g）重复采样，输出切换到壳/内容可见耗时、FCP/LCP、静态资源传输、缓存命中及 JS/CSS 解码体积复用率到 target/e2e/<run-id>/perf-report.json。--mode integration 自建隔离 integration 栈；--origin 直接度量既有入口（如线上站点）。二者必须显式提供其一。',
    examples: [
      'ops perf mobile --mode integration --playwright-module playwright-core/index.mjs --chromium-path /nix/store/.../chromium',
      'ops perf mobile --origin https://blog.example.com --playwright-module playwright-core/index.mjs --chromium-path /nix/store/.../chromium --runs 5 --profile slow4g',
    ],
    options: [
      { name: 'mode', description: '自建隔离 integration 栈进行度量（当前仅支持 integration）', model: { kind: 'enum', values: ['integration'] }, optional: true },
      { name: 'origin', description: '直接度量既有页面入口 URL（http:// 或 https:// 开头），与 --mode 互斥', model: { kind: 'path' }, optional: true },
      { name: 'runs', description: '每档位重复采样次数（默认 3）', model: { kind: 'int32', min: 1, max: 20 }, optional: true },
      { name: 'profile', description: '只跑单个网络档位（默认三个档位都跑）', model: { kind: 'enum', values: E2E_PERF_PROFILES }, optional: true },
      { name: 'playwright-module', description: 'Playwright 模块路径或模块名（必须显式提供）', model: { kind: 'path' } },
      { name: 'chromium-path', description: 'Chromium 可执行文件路径（必须显式提供）', model: { kind: 'path' } },
    ],
    exitCodes: [{ code: 0, meaning: '采样完成或 --dry-run 成功' }, { code: 10, meaning: '参数或命令用法错误' }, FAILURE],
  }, (context, args) => runE2ePerf(context, args).then(commandExitResult)),
  defineCommand({ path: ['workspace', 'doctor'], summary: '检查本地开发依赖', description: '验证 Node、pnpm、Rust 和 Cargo 是否可用。', examples: ['ops workspace doctor'], exitCodes: [{ code: 0, meaning: '依赖齐全' }, { code: 20, meaning: '缺少依赖' }] }, async ({ process: p, workspace, reporter, dryRun }) => { let passed = true; reporter.section(dryRun ? 'workspace doctor dry-run' : 'workspace doctor'); for (const name of ['node', 'pnpm', 'rustc', 'cargo']) { if (dryRun) { reporter.info(`检查命令: ${name}`); continue; } const r = await p.run('sh', ['-c', `command -v ${name}`], workspace.root); if (r.code) { passed = false; reporter.fail(`${name} missing`); } else reporter.ok(`${name} available`); } return commandResult(passed); }),
  defineCommand({ path: ['quality', 'check'], summary: '执行项目质量检查', description: '运行 Rust 三件套（cargo fmt --all --check、cargo clippy -D warnings、cargo test --workspace）、ops 契约测试、前端 typecheck/lint/format/test/build 和前后端架构边界检查。', examples: ['ops quality check'], exitCodes: [{ code: 0, meaning: '检查通过' }, { code: 20, meaning: '检查失败' }] }, ({ workspace, process, fs, reporter, dryRun }) => { if (dryRun) { reporter.section('quality check dry-run'); reporter.info('将执行 cargo fmt --all --check、cargo clippy --workspace --all-targets -- -D warnings、cargo test --workspace、ops 契约测试、pnpm typecheck/lint/format:check/test:core/build 和前后端架构边界检查'); return commandResult(true); } return runCheck(workspace, process, fs, reporter).then((passed) => commandResult(passed)); }),
  defineCommand({ path: ['quality', 'lint'], summary: '运行前端 Oxlint', description: '使用 pnpm 执行 blog-web 的 lint 脚本，并将 warning 视为失败。', examples: ['ops quality lint'], exitCodes: [{ code: 0, meaning: 'lint 通过' }, { code: 20, meaning: 'lint 失败' }] }, ({ workspace, process, reporter, dryRun }) => { if (dryRun) { reporter.section('quality lint dry-run'); reporter.info('pnpm -C src/frontend run lint'); return commandResult(true); } return runWebQuality(workspace, process, reporter, 'lint').then((passed) => commandResult(passed)); }),
  defineCommand({ path: ['quality', 'format'], summary: '格式化前端源文件', description: '不带 --check 时写入 Biome 格式化结果；带 --check 时只检查、不修改文件。', examples: ['ops quality format --check'], options: [{ name: 'check', model: { kind: 'switch' }, description: '只检查格式，不写入文件' }], exitCodes: [{ code: 0, meaning: '格式化通过' }, { code: 20, meaning: '格式化失败或存在未格式化文件' }] }, ({ workspace, process, reporter, dryRun }, args) => { const check = args.check === true; if (dryRun) { reporter.section('quality format dry-run'); reporter.info(`pnpm -C src/frontend run ${check ? 'format:check' : 'format'}`); return commandResult(true); } return runWebQuality(workspace, process, reporter, check ? 'format:check' : 'format').then((passed) => commandResult(passed)); }),
  defineCommand({ path: ['package', 'check'], summary: '执行 @fluvient-loom 包门禁', description: '平台中立护栏（packages/*/src 零 node/web/solid 依赖）+ package smoke + workspace typecheck/test；独立于 ops quality check。', examples: ['ops package check'], exitCodes: [{ code: 0, meaning: '检查通过' }, FAILURE] }, ({ workspace, process, fs, reporter, dryRun }) => { if (dryRun) { reporter.section('package check dry-run'); reporter.info('将执行平台中立护栏扫描、package smoke（tsx apps/blog/test/packages/package-smoke.ts）与 pnpm run check（typecheck + test）'); return commandResult(true); } return runPackageCheck(workspace, process, fs, reporter).then((passed) => commandResult(passed)); }),
  defineCommand({
    path: ['admin', 'credentials', 'init'],
    summary: '初始化管理端密码、TOTP 与恢复码',
    description: '通过 TTY 隐藏输入密码，生成 Argon2id 哈希、TOTP secret 与一次性恢复码；敏感值不进入 argv 或 ops 日志。',
    examples: ['ops admin credentials init'],
    exitCodes: [{ code: 0, meaning: '凭证初始化成功' }, FAILURE],
  }, (context) => runAdminCredentialCommand(context, 'init').then(commandExitResult)),
  defineCommand({
    path: ['admin', 'recovery', 'regenerate'],
    summary: '重新生成管理端恢复码',
    description: '通过 TTY 验证当前密码并原子替换恢复码；新恢复码只在当前终端显示一次。',
    examples: ['ops admin recovery regenerate'],
    exitCodes: [{ code: 0, meaning: '恢复码重新生成成功' }, FAILURE],
  }, (context) => runAdminCredentialCommand(context, 'recovery-regenerate').then(commandExitResult)),
  defineCommand({
    path: ['content', 'repository', 'init'],
    summary: '初始化空 GitHub 内容仓库',
    description: '使用显式 BLOG_CONTENT_REPO 与 BLOG_CONTENT_TOKEN 创建合法空 taxonomy 和 main；不写示例文章或凭证，重复执行会校验并幂等成功。',
    examples: ['BLOG_CONTENT_REPO=owner/repository BLOG_CONTENT_TOKEN=... ops content repository init'],
    exitCodes: [{ code: 0, meaning: '初始化成功或仓库已经是合法空状态' }, FAILURE],
  }, (context) => initializeContentRepository(context).then(commandExitResult)),
  defineCommand({
    path: ['delivery', 'build'],
    summary: '构建前端与 Rust 交付物',
    description: '构建 web/dist 与 Rust Product/Data/Mock 交付 binary；不编译任何 Go 目标，不启动任何服务进程。',
    examples: ['ops delivery build', 'ops delivery build --dry-run', 'ops delivery build --json'],
    exitCodes: [{ code: 0, meaning: '构建成功' }, FAILURE],
  }, (context) => runDeliveryBuild(runtimePorts(context), { dryRun: context.dryRun, json: context.json }).then(commandExitResult)),
  defineCommand({
    path: ['delivery', 'package'],
    summary: '构建环境无关的发布包(无秘密)',
    description: '构建前端与 musl 交叉产物,连同 systemd/nginx 模板与 install.sh 打包为 deploy/dist/blog-release-<target>-*.tar.gz;域名/仓库名在服务器端由 install.sh 注入。',
    examples: ['ops delivery package --target x86_64-unknown-linux-musl', 'ops delivery package --target aarch64-unknown-linux-musl --dry-run'],
    options: [{ name: 'target', description: '目标架构(必须显式选择)', model: { kind: 'enum', values: DEPLOY_TARGETS } }],
    exitCodes: [{ code: 0, meaning: '发布包生成成功' }, FAILURE],
  }, (context, args) => runDeployPackage(args.target, deployPorts(context), { dryRun: context.dryRun }).then(commandExitResult)),
  defineCommand({
    path: ['delivery', 'installer'],
    summary: '打包服务器安装器(单文件 mjs)',
    description: '用 esbuild（nix 提供）把 ops 安装器入口打成 deploy/dist/blog-deploy.mjs：init 生成 /etc/blog 骨架，deploy/redeploy 从公开 Release 下载对应架构发布包并幂等安装；构建后自动做 --help 冒烟。',
    examples: ['ops delivery installer', 'ops delivery installer --dry-run'],
    exitCodes: [{ code: 0, meaning: '安装器生成且 --help 冒烟通过' }, FAILURE],
  }, (context) => runDeployInstaller(deployPorts(context), { dryRun: context.dryRun }).then(commandExitResult)),
  defineCommand({
    path: ['release'],
    summary: '预检并发布 Script 或 Build tag',
    description: '检查 main 分支和干净工作树，按发布类型自动递增 patch 版本，预览 tag 后在 --yes 下创建并推送；不会修改服务器。',
    positionals: [{ name: 'kind', description: '发布类型', model: { kind: 'enum', values: RELEASE_KINDS } }],
    options: [{ name: 'yes', model: { kind: 'switch' }, description: '确认创建并推送 tag' }],
    examples: ['ops release script --dry-run', 'ops release build --yes', 'ops release both --yes'],
    exitCodes: [{ code: 0, meaning: '预检成功或 tag 已推送' }, { code: 10, meaning: '参数或命令用法错误' }, FAILURE],
  }, (context, args) => runRelease(args.kind, { process: context.process, reporter: context.reporter, root: context.workspace.root }, { dryRun: context.dryRun, confirmed: args.yes }).then(commandExitResult)),
  defineCommand({
    path: ['runtime', 'dev'],
    summary: '前端开发栈: Vite + Mock Product API',
    description: '启动 Mock（--scenario 选择命名场景）与 Vite dev server，并把 Mock 实际地址注入 BLOG_API_ORIGIN；不启动 Product/Data，页面数据只来自 Mock。最终访问地址是 Vite 地址。',
    examples: ['ops runtime dev --scenario default --web-port 5173 --mock-port 9090', 'ops runtime dev --scenario empty --web-port 5173 --mock-port 9090 --dry-run', 'ops runtime dev --scenario slow --web-port 5173 --mock-port 9090 --json'],
    options: [
      { name: 'scenario', description: 'Mock 命名场景（必须显式选择）', model: { kind: 'enum', values: MOCK_SCENARIOS } },
      portOption('web-port', 'Vite 候选端口'),
      portOption('mock-port', 'Mock 候选端口'),
    ],
    exitCodes: [{ code: 0, meaning: '--dry-run 打印计划（运行中的模式没有 0 退出路径，正常停止只能是 130/143）' }, FAILURE, SIGINT, SIGTERM],
  }, (context, args) => runRuntimeMode(planMode({ mode: 'dev', scenario: args.scenario, webPort: args['web-port'], mockPort: args['mock-port'] }), runtimePorts(context), { dryRun: context.dryRun, json: context.json }).then(commandExitResult)),
  defineCommand({
    path: ['runtime', 'backend'],
    summary: '后端 API 栈: Product + Data（无页面）',
    description: '启动 Rust Product API-only 与 Rust Data Server（显式选择 mock、test 或 prod；mock 不创建 SQLite 文件；prod 必须显式提供 --database-path，Data 自动迁移、不加载 seed、退出不删库）；不挂载前端、不启动 Vite，因此没有页面入口，只有 API 基址。',
    examples: ['ops runtime backend --data test --content-source fixture --product-port 8080 --data-port 8081', 'ops runtime backend --data prod --database-path ~/.local/state/blog/prod.db --content-source github --product-port 18080 --data-port 18081'],
    options: [
      { name: 'data', description: '数据语义（必须显式选择）', model: { kind: 'enum', values: DATA_MODES } },
      { name: 'database-path', description: 'prod 数据模式必填,仅 --data prod 时允许（显式路径,无默认值）', model: { kind: 'path' }, optional: true },
      { name: 'content-source', description: '内容来源（必须显式选择；fixture 不读取 GitHub 凭证）', model: { kind: 'enum', values: CONTENT_SOURCES } },
      portOption('product-port', 'Product 候选端口'),
      portOption('data-port', 'Data 候选端口'),
    ],
    exitCodes: [{ code: 0, meaning: '--dry-run 打印计划（运行中的模式没有 0 退出路径，正常停止只能是 130/143）' }, FAILURE, SIGINT, SIGTERM],
  }, (context, args) => runRuntimeMode(planMode({ mode: 'backend', dataMode: args.data, databasePath: args['database-path'], contentSource: args['content-source'], productPort: args['product-port'], dataPort: args['data-port'] }), runtimePorts(context), { dryRun: context.dryRun, json: context.json }).then(commandExitResult)),
  defineCommand({
    path: ['runtime', 'integration'],
    summary: '集成栈: 先构建前端，Product 挂载 web/dist',
    description: '先构建 web/dist（--watch 时持续重建），再启动 Rust Product（挂载 web/dist，页面与 /api 同源）与 Rust Data(test)；不启动 Vite。最终访问地址是 Product 地址。这是原 ops runtime serve 的迁移目标。',
    examples: ['ops runtime integration --content-source fixture --product-port 8080 --data-port 8081', 'ops runtime integration --watch --content-source github --product-port 8080 --data-port 8081'],
    options: [
      { name: 'watch', model: { kind: 'switch' }, description: '持续重建 web/dist；构建失败会停止服务栈' },
      { name: 'content-source', description: '内容来源（必须显式选择；fixture 不读取 GitHub 凭证）', model: { kind: 'enum', values: CONTENT_SOURCES } },
      portOption('product-port', 'Product 候选端口'),
      portOption('data-port', 'Data 候选端口'),
    ],
    exitCodes: [{ code: 0, meaning: '--dry-run 打印计划（运行中的模式没有 0 退出路径，正常停止只能是 130/143）' }, FAILURE, SIGINT, SIGTERM],
  }, (context, args) => runRuntimeMode(planMode({ mode: 'integration', watch: args.watch, contentSource: args['content-source'], productPort: args['product-port'], dataPort: args['data-port'] }), runtimePorts(context), { dryRun: context.dryRun, json: context.json }).then(commandExitResult)),
];

export const groupDefinitions = [
  defineGroup({ path: ['workspace'], summary: '检查', description: '确认本地开发依赖是否齐全。', order: 10, workflow: '首次进入仓库' }),
  defineGroup({ path: ['quality'], summary: '质量', description: '运行格式、静态检查、测试和前端质量任务。', order: 20, workflow: '提交前验证' }),
  defineGroup({ path: ['package'], summary: '内核包', description: '@fluvient-loom workspace 包门禁：平台中立护栏 + typecheck/test/smoke，独立于 quality 全量检查。', order: 25, workflow: '内核包开发期验证' }),
  defineGroup({ path: ['e2e'], summary: '浏览器验收', description: '通过隔离运行栈执行显式的 Playwright 浏览器回归测试，不并入快速质量门禁。', order: 28, workflow: '浏览器回归验收' }),
  defineGroup({ path: ['perf'], summary: '性能度量', description: '对页面加载做可重复的 Playwright 性能采样（冷加载/底栏切换 × 网络档位），输出耗时、传输与缓存命中指标，支撑体验优化的基线对比。', order: 29, workflow: '体验优化度量' }),
  defineGroup({
    path: ['runtime'],
    summary: '运行模式',
    description: '三种运行模式：dev 只有 Vite + Mock（无真实后端，页面入口是 Vite 地址）；backend 只有 Product + Data（真实后端，无页面入口，API 基址是 Product 地址）；integration 先构建前端再由 Product 挂载 web/dist（真实后端，页面入口是 Product 地址）。端口以实际绑定结果为准，Ctrl-C 以 130 退出。',
    order: 30,
    workflow: '本地运行与联调',
  }),
  defineGroup({ path: ['admin'], summary: '管理鉴权', description: '初始化单管理员凭证并维护一次性恢复码。', order: 35, workflow: '管理端凭证运维' }),
  defineGroup({ path: ['content'], summary: '内容仓库', description: '初始化和维护 GitHub 内容真源。', order: 40, workflow: '内容仓库运维' }),
  defineGroup({ path: ['delivery'], summary: '交付', description: '构建前端与 Rust 交付物。', order: 50, workflow: '交付前构建' }),
  defineGroup({ path: ['release'], summary: '发布', description: '预检、创建并推送 Script/Build 发布 tag。', order: 60, workflow: '发布交付物' }),
] as const;
