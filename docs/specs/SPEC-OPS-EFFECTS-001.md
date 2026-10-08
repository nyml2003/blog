---
kind: spec
id: SPEC-OPS-EFFECTS-001
status: accepted
owner: infrastructure
last_reviewed: 2026-10-06
---

# Ops 效果协议与执行策略

## 目标

定义 ops 命令副作用的统一协议：命令通过 `EffectPort` 提交可描述、可补偿的 `ReversibleCommand`，由 real / dry-run / test 三种执行策略接管。dry-run 从「每个命令自己判断的开关」变成「派发器的一种策略」；命令的 dry-run 分支不再承担安全职责，只保留文案。

协议复用 `@fluvient-loom/port` 的 `ReversibleCommand`/`PreparedCommand`/`OperationIdPort`，不另造效果词表。`prepared` 的 `describe()` 是可选加法字段，dry-run 计划由它渲染。

## 非目标

- 不引入 Cordis、插件热加载或可卸载生命周期；本协议只覆盖 ops 的执行策略。
- 不改变命令名、参数模型、退出码；dry-run 仍须通过完整参数与组合校验（`SPEC-OPS-PARAMETERS-001`）。
- 不改变 `SPEC-OPS-OUTPUT-001` 的 NDJSON 字段；dry-run 计划的可读文案允许调整。
- 不把 runtime 长驻服务改造成请求/响应派发；runtime 保留 plan-first。

## 词汇与契约

| 概念 | 定义 |
| --- | --- |
| 观察（observe） | 只读副作用。命令通过现有端口（如 `ProcessPort.run` 读取 git 状态）直接执行；real 与 dry-run 都真实运行，不进入计划 |
| 变更（mutate） | 会改变外部状态的副作用。必须实现为 `ReversibleCommand` 并通过 `EffectPort.run` 提交 |
| 失败（`EffectFailure`） | 效果唯一的失败通道 `{ message: string }`；命令与中间件都产生它，运行内部不出现 `unknown` 或类型断言 |
| 作用域（`EffectScope`） | 独立的 plan、补偿栈与序号；`EffectPort` 是默认作用域，`createScope()` 产生隔离作用域 |
| 命令上下文 | `@fluvient-loom/port` 的 `CommandContext`，含 `operationId` 与 `sequence` |
| 描述 | `CommandDescription { summary: string; details?: string[] }`，来自 `PreparedCommand.describe?()`；summary 是计划文案 |
| 补偿 | `PreparedCommand.compensate()`；不可逆变更用无操作补偿表达 |

`EffectScope` / `EffectPort` 契约：

| 成员 | 契约 |
| --- | --- |
| `plan: readonly CommandDescription[]` | 本作用域内被短路中间件记录、尚未执行的变更描述；全部执行时为空 |
| `run(command, input)` | 调用 `prepare`；失败直接返回 `Result<void, EffectFailure>`。效果进入中间件 waterfall：全链调用 `next()` 才执行；执行失败先补偿自身；成功时压入本作用域补偿栈。`run` 不自动回滚先前成功的同作用域效果 |
| `rollback()` | 逆序补偿本作用域全部已执行命令；单个补偿失败不中断，最终返回 `RollbackReport { compensated, failures }` |
| `createScope()`（仅 `EffectPort`） | 返回带独立 plan/补偿栈/序号的隔离作用域，供并发或成组操作使用 |

`EffectPort` 不暴露执行模式；命令不做"是否 dry-run"判断，计划渲染由 `reportPlan` 无条件渲染空 `plan` 自然无输出。

## 效果派发管线

`createEffectDispatcher({ operationIds, middlewares })` 把一次效果交给中间件组成的 waterfall（洋葱模型）：

- 中间件 `handle(execution, next)` 必须调用 `next()` 才会继续到后续中间件与最终执行；不调用即短路（dry-run、审批拒绝、测试替身）。
- `next()` 每次效果至多调用一次；重复调用是编程错误，转成 `EffectFailure` 而不重复执行。
- 顺序 = 插件声明顺序，外层在前。`CliPlugin.effectMiddlewares` 声明中间件工厂，`createCliApp` 按全局开关求值并组装；`dryRunPlugin` 只提供 `--dry-run` 开关和 dry-run 中间件。
- `execution.record()` 把描述写入本作用域计划日志；`reportPlan(scope, reporter)` 负责 `DRY-RUN:` 渲染。
- 命令级确认门用效果表达（如 release 的确认效果）：dry-run 下被中间件短路故不需要 `--yes`，真实执行时先于任何变更检查并失败。
- `prepare`/`execute`/`compensate`/中间件抛出的异常在边界统一转成 `EffectFailure`，内部只处理类型化结果。
- 中间件可观察、短路、包装结果；本版不能改写效果内部参数（argv/文件操作），参数重写需要效果数据化，属于后续议题。
- `processStepEffect` 的失败携带步骤标签与退出码（`"<label>(exit N)"`），调用方无需解析 `ProcessStep`。
- `createEffectPort({ dryRun, operationIds, middlewares? })` 保留为兼容糖：dispatcher + 可选额外中间件 + 内置 dry-run 中间件。

## 场景

### SPEC-OPS-EFFECTS-001-01 dry-run 只记录不执行

Given `EffectPort` 为 dry-run 策略，命令定义了带 `describe()` 的变更

When 命令调用 `run(command, input)`

Then `prepare()` 被调用、`execute()` 与 `compensate()` 不被调用，`plan` 追加一条描述，`run` 返回成功

### SPEC-OPS-EFFECTS-001-02 real 成功执行并维护补偿栈

Given real 策略，`prepare()` 与 `execute()` 都成功

When 命令调用 `run`

Then `execute()` 返回值透传，`plan` 保持为空，该命令进入补偿栈；`rollback()` 逆序调用其 `compensate()`

### SPEC-OPS-EFFECTS-001-03 real 执行失败先补偿自身

Given real 策略，`execute()` 返回错误

When 命令调用 `run`

Then `compensate()` 被调用一次（尽力而为），`run` 原样返回 `execute()` 的错误，该命令不进入补偿栈

### SPEC-OPS-EFFECTS-001-04 计划可读性与参数校验

Given 任意命令带 `--dry-run`

When 执行

Then 参数与组合校验完整执行（失败仍以 10 退出、零副作用）；成功时计划由 `plan` 中的描述渲染，命令无需为安全检查编写 dry-run 分支

### SPEC-OPS-EFFECTS-001-05 观察允许在 dry-run 中真实运行

Given 命令需要读取真实状态（如 git 分支、远程仓库、网络预检）

When dry-run 执行

Then 观察照常执行，变更被记录不执行；命令不得让计划的正确性依赖某个变更的真实产物（先观察、后变更）

### SPEC-OPS-EFFECTS-001-06 中间件可插拔

Given `CliPlugin.effectMiddlewares` 声明了多个中间件工厂

When 命令通过 `effects.run` 提交变更

Then 中间件按插件顺序组成洋葱；任一中间件不调 `next()` 即短路并成为计划；全部调用 `next()` 才执行并维护补偿栈；dry-run 只是其中一个中间件

### SPEC-OPS-EFFECTS-001-07 确认门是效果

Given 命令需要在执行前取得显式确认（如 `release --yes`）

When 命令把确认实现为第一个效果

Then dry-run 下确认效果被短路、不要求 `--yes`；真实执行时确认效果先于任何变更运行，缺失确认以用法错误（10）退出且零变更

## 边界与失败

- `prepare()` 返回失败或抛异常：不记录计划、不执行、不补偿，统一转成 `EffectFailure` 返回。
- `execute()` 返回失败或抛异常：尽力补偿自身；原始失败优先返回，补偿异常不覆盖它。
- `run` 不自动回滚同作用域中先前成功的效果；需要整体原子性的命令在返回失败前显式调用 `rollback()`。
- `rollback()` 逆序补偿全部已执行命令；单个补偿失败不中断后续补偿，最终以 `RollbackReport` 聚合。
- 缺少 `describe()` 的变更：dry-run 使用兜底文案记录，协议要求 ops 效果统一实现 `describe()`。
- 测试策略：测试注入 fake `EffectPort` 或真实 dispatcher + fake `ProcessPort`，不依赖进程环境。
- 迁移顺序：先 release 纵切片，再按 delivery、local、content/admin、quality、runtime 分批，runtime 仅统一计划描述来源。

## 测试/验收证据

- 策略语义（dry-run、real、失败补偿、rollback 聚合、异常转换、next 单次调用、作用域隔离、兜底文案）：`packages/cli/cli-kit/test/effects.test.ts`。
- 中间件收集顺序与插件组合：`packages/cli/cli-kit/test/plugin.test.ts`。
- release 纵切片（dry-run 零写、补偿路径、确认效果）：`apps/blog/test/commands/release.test.ts`。
- 类型与共享包兼容：`packages/ts/port` typecheck、`apps/blog/test/packages/package-smoke.ts`。
- 尚未纳入门禁：全命令 dry-run 一致性测试、命令域架构扫描。

## 决策

2026-10-06 用户确认：接受破坏性改动；协议复用 `@fluvient-loom/port` 的 `ReversibleCommand` 与 `@fluvient-loom/node` 的适配器；dry-run 成为派发策略；release 纵切片先行。`PreparedCommand.describe?()` 作为加法字段落在共享包，不改变前端消费者语义。

2026-10-06 用户确认：派发控制流采用 waterfall(next)（洋葱模型），中间件按插件顺序组装；dry-run 退化为内置中间件，`--dry-run` 开关与行为分离注册；本版中间件不改写效果参数，效果数据化留待后续议题。

2026-10-06 用户确认：删除 `EffectPort.dryRun` 元数据；计划渲染改为无条件 `reportPlan`（空计划自然无输出）；release 的发布确认门改为首个效果，dry-run 短路、真实执行时先于任何变更校验。

2026-10-06 用户确认（代码审查整改）：错误通道统一为 `EffectFailure`，内部实现不使用 `unknown`/类型断言，仅边界做一次异常转换；作用域持有 plan/补偿栈/序号，`createScope()` 支持隔离；`rollback()` 不中断并返回聚合报告；`next()` 至多调用一次；`run` 不自动回滚，原子序列由命令显式 `rollback()`。
