---
kind: plan
id: PLAN-OPS-OUTPUT-STANDARD-001
status: completed
owner: project-manager
created: 2026-09-29
last_reviewed: 2026-09-30
---

# ops 输出标准化

## 目标

统一 `ops` 全部命令及其管理的子进程输出协议，让人可以直接阅读，让脚本和 CI 可以稳定解析，让失败能定位原因，同时不泄露 token、密码、证书或完整配置。所有 ops 入口、命令、错误路径、子进程日志及最终结果都必须经过统一输出边界；人类模式和 `--json` 模式都是完整且明确的协议。

本计划按一次性 breaking change 实施：新协议落地时同步迁移仓库内所有消费者，不保留旧格式、旧 `--json` 语义、双写、兼容解析或过渡开关。

## 当前基线

- `SPEC-OPS-RUNTIME-001` 已规定运行栈日志前缀、stdout/stderr 分工、`--json` NDJSON、终止事件和退出码；这是当前契约基线。本计划可以经明确更新 Spec 后整体替换旧契约，不能留下同名参数的双重语义。
- `packages/cli-core/src/reporter.ts` 提供 `section/ok/fail/info` 的人类输出；CLI 生产路径通过 OutputPort 适配终端、NDJSON 与测试捕获，旧 Runtime Spec 和运维指南已指向统一输出协议。
- runtime 子进程日志保留 `[web]`、`[product]`、`[data]`、`[mock]`、`[ops]` 来源；delivery、quality、admin、content、release、e2e、help 和参数错误均通过统一事件边界输出。
- `--json` 已形成所有入口和命令通用的 NDJSON 事件模型，终止结果唯一且最后输出。
- E2E/Release runner、测试和指南已迁移到新事件字段；旧 JSON 形状不再被解析。

## 输出模型

### 人类模式

- stdout：正常进度、阶段、成功结果、地址和下一步提示；stderr：错误、失败摘要和可操作诊断。子进程 stdout/stderr 保留来源标识并经统一路由，不能绕过输出边界直接污染 CLI 协议。
- 所有 ops 自身输出由统一 reporter 负责；子进程输出使用统一的来源标签与行事件，不让业务命令自行决定前缀、颜色、标点和中英文混排。
- 阶段、步骤、成功、警告、失败使用有限语义，不依赖颜色表达唯一含义；非 TTY 环境关闭装饰和 spinner。
- 长日志、子进程原始输出和最近诊断片段有明确截断规则，失败时保留命令、角色、退出码和建议。

### 机器模式

- 每个命令和入口都支持全局 `--json`，输出 NDJSON；stdout 每行一个 JSON 对象，不能混入横幅、空白进度、人类帮助或未封装的子进程输出。包括帮助、参数错误和启动失败在内的早期路径也遵守协议。
- 事件至少包含稳定的 `schemaVersion`、`command`、`event`、`ok`、`code`、`exitCode`、`message` 和必要的 `data`；所有命令有确定的终止事件，长驻 runtime 额外输出生命周期及子进程行事件。最后一条事件代表最终结果。
- 成功、失败、跳过、警告、进度、子进程输出和 dry-run 的语义固定；退出码与终止事件一致。JSON 结构是面向消费者的公开契约，变化需更新 Spec 和所有仓库内消费者。
- 机器输出不得包含 token、密码、私钥、cookie、完整环境变量、数据库路径中的秘密片段或未经脱敏的子进程命令参数。

### 错误与诊断

- CLI 参数错误、配置错误、外部命令失败、服务启动失败、子进程异常退出、网络/Release 失败和取消使用稳定错误码集合。
- 错误事件携带可定位上下文：命令路径、阶段、角色、退出码/信号、相关路径或 URL（脱敏）、最近日志摘要和建议动作。
- 同一失败只产生一个权威终止结果；重复包装保留 `cause` 链但不重复刷屏。

## 范围

覆盖 `ops` 的全部输出面：全局帮助和参数解析、所有命令组及叶子命令（包括 `workspace`、`quality`、`package`、`delivery`、`release`、`e2e`、`admin`、`content`、`playground`、`runtime`）、统一错误处理、子进程输出、运行时日志、E2E/Release runner、CI 和仓库内脚本消费者。服务器上的 `blog-deploy` 是独立程序，本计划不改造其内部输出；`ops` 调用或解析它时必须通过本计划定义的边界。

## 成功标准

1. 一份输出 Spec 定义所有命令的 human/JSON 协议、stdout/stderr 责任、子进程行事件、字段、错误码、退出码、脱敏和版本规则；旧 Runtime/Parameters Spec 同步更新或明确替代，不能互相冲突。
2. 所有入口与叶子命令统一通过 reporter/事件 emitter；不存在绕过协议的 `console.*`、裸子进程透传、命令私有输出格式或只在部分命令生效的 `--json`。
3. 每个命令的人类模式遵守统一输出规则，JSON 模式只向 stdout 写合法 NDJSON；成功、dry-run、帮助、参数错误、配置错误、执行失败及中断均有确定事件序列和退出码。
4. runtime 的服务地址、子进程日志、启动失败、运行期崩溃和信号退出全部使用同一事件模型，保留足够的来源和诊断信息。
5. 仓库内所有 JSON、文本和退出码消费者（包括 E2E/Release runner、CI、测试、指南和脚本）在同一变更中迁移；不提供旧协议兼容层、双写或旧格式解析。
6. 测试覆盖成功、失败、帮助、参数错误、子进程 stdout/stderr、无换行尾行、SIGTERM/SIGINT、非 TTY、JSON stdout 纯净性、敏感信息脱敏和长日志截断；所有旧格式断言清理完成。
7. 相关 CLI、runtime、package、release 和前端 E2E 门禁通过；输出格式可以 breaking，但业务副作用与业务语义没有意外变化。

## 非目标

- 不改变与输出无关的命令参数、服务启动矩阵、API/wire、部署业务语义或服务器 `blog-deploy` 内部实现；为统一 `--json` 和退出码而发生的 CLI 协议 breaking change 属于本计划范围；
- 不要求各服务本身原生输出 JSON；ops 负责把子进程 stdout/stderr 行封装成有来源标识的事件，保留原始行作为脱敏后的诊断载荷；
- 不强制引入第三方日志库、集中式日志平台或常驻监控系统；
- 不用颜色、图标、emoji 或 spinner 作为机器协议的一部分；
- 不为了格式统一继续扩张根目录 `scripts/`，长期新增能力应归入 app/CLI/CI 明确模块。

## 约束与依据

- `docs/specs/SPEC-OPS-OUTPUT-001.md`：Result、OutputPort、事件联合、NDJSON 和 breaking change 边界。
- `docs/specs/SPEC-OPS-RUNTIME-001.md`：运行时服务日志、生命周期和退出码语义。
- `docs/specs/SPEC-OPS-PARAMETERS-001.md`：参数错误退出 10、帮助输出和无副作用快速失败。
- `docs/guides/operations.md`：当前 CLI 使用方式、`--json` 约定和发布/E2E 命令消费说明。
- `packages/cli-kit/src/ports.ts`、`packages/cli-core/src/reporter.ts`、`apps/blog/src/**`：现有 reporter、process 和命令输出实现。
- `AGENTS.md`：保持改动最小、先核对契约、敏感信息不得进入日志、验证按风险分级执行。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 输出契约与事件模型 | qa+pm | - | 本计划、必要的 ops Spec 与指南 | completed |
| Reporter/错误模型基础设施 | infra | 契约与事件模型 | `packages/cli-kit/**`、`packages/cli-core/**`、公共测试 | completed |
| 全量命令与入口迁移 | infra | 基础设施 | `apps/blog/src/**`、命令测试、入口测试 | completed |
| 消费者同步切换 | qa+release | 新协议冻结、全量命令迁移 | E2E/Release runner、CI、脚本、指南、协议测试 | completed |
| 集成验收 | qa+pm | 上述工作流 | 质量报告、输出样例、计划结果 | completed |

Reporter、错误类型、CLI runner 和 Spec 属于共享写集，必须串行修改。迁移可按命令组实施，但只有全量命令和仓库内消费者同时切换后才算完成；中间状态不得作为可发布兼容版本。

## 集成验收

1. 对每个命令运行成功、dry-run、帮助、参数错误、配置错误和执行失败，分别检查 stdout、stderr、退出码和 JSON 事件序列。
2. 运行真实 runtime，验证服务地址、子进程 stdout/stderr、启动失败、运行期崩溃和信号退出都经过统一事件模型；最后一条 JSON 事件必须能代表最终结果。
3. 用脚本消费 JSON 输出，确认没有人类横幅或日志混入 stdout；用非 TTY 管道运行，确认输出仍可解析且不会阻塞。
4. 注入含 token/密码/路径秘密的错误和子进程输出，确认人类与 JSON 两种模式均脱敏；验证长日志截断后仍保留定位信息。
5. 搜索仓库内旧 reporter、旧 JSON 字段、旧退出码断言和裸输出路径，确认全部改为新协议；运行相关 CLI/包测试、`ops quality check` 和现有 E2E/Release 测试。
6. 在同一发布切换中更新 Spec、帮助、指南、CI 和所有仓库内消费者；发布说明明确列出新的字段/事件/退出码契约和迁移映射。

## 业界实践与本项目取舍

- CLI 的通行做法是把 stdout 作为可重定向的数据通道、stderr 作为诊断通道；机器输出要可预测、无装饰，并把退出码与结构化结果一起定义。这个做法适用于本项目所有命令，而不只 runtime。
- 结构化输出通常由显式格式选项触发，并以稳定字段/API 契约供自动化消费；本项目统一采用全局 `--json` 和 NDJSON 事件流，避免命令组各自发明 JSON 形状。
- breaking change 的稳妥落地方式是在一个有界切换点同时更新生产者、消费者、测试和文档，而不是长期维护双格式；本计划遵循一次性整体切换，不安排兼容窗口。
- 输出协议仍需 `schemaVersion`，它用于识别当前协议和未来明确升级，不代表要兼容旧版本。
- 实现时采用分层边界：`packages/cli-kit` 承载协议类型与 reporter，`apps/blog` runner 负责命令/运行时语义；子进程行作为标准事件类型，而不是直接透传。

## 实施结果（2026-09-30）

- `packages/cli-kit` 新增结构化 `Result`、错误码集合、`OpsFailure` 和 `OutputEvent/OutputPort`；`cli-core` 提供终端输出适配器与测试捕获适配器。
- runner 已归一化命令结果，并输出命令完成结果及 `command.started/finished` 埋点；现有 Reporter 调用通过 OutputPort 输出。
- `workspace doctor`、`quality check/lint/format` 和 `package check` 已迁移为显式 `Result` 返回，runner 兼容层不再参与这些命令的成败判断。
- runtime JSON 已追加统一 `schemaVersion`、`event`、`code`、`exitCode`、`message` 字段；日志保留来源和 stdout/stderr 流；runtime 接受 breaking change。
- 已验证 `pnpm typecheck`、`git diff --check`、`ops quality check`、CLI 入口测试 21/21、OutputPort 测试 2/2；博客命令测试 105 passed、13 个默认跳过；blog-deploy 测试 8/8；`OPS_RUNTIME_E2E=1` 真实进程验收 12/12；`OPS_RUNTIME_E2E=full` 全量 runtime 验收 14/14。

## 收尾说明

- 外部进程端口保留操作系统数字退出码，进入命令 handler 边界后统一映射为 `Result<CommandValue, OpsFailure>`；注册到 runner 的命令处理器不再暴露裸退出码。
- OutputPort 适配器统一执行敏感字段、内嵌凭证模式和长文本截断；真实子进程 stdout/stderr、无换行尾行、信号、端口和构建路径均已验收。
- 埋点通过可注入 `OutputPort` 提供 `command.started/finished` 和阶段事件，当前不落盘联网，后续可增加消费者而不改变命令接口。
