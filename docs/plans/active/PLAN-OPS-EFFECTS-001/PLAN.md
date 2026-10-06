---
kind: plan
id: PLAN-OPS-EFFECTS-001
status: in_progress
owner: project-manager
created: 2026-10-06
last_reviewed: 2026-10-06
---

# ops 效果协议与插件化执行策略

## 目标

把 ops 命令的副作用收口成「结构化效果 + 可替换执行策略」，让 dry-run、测试替身以及未来的审批/沙箱都通过同一个派发器接入，而不是每个命令自己写 `if (context.dryRun)` 分支；同时最大化复用 `packages/ts` 已有的平台中立端口，不重复造效果协议。

本计划参照 DeepSeek Harness 的 everything-is-a-plugin 与守卫执行管道（`tools/pre-execute`、能力接缝、providers 是唯一执行世界），但只取 ops 需要的子集：**效果接缝 + 策略插件 + 强制派发**，不引入 Cordis、HMR 或插件热加载。

终态协议：

1. 命令只能通过 `CommandContext` 暴露的效果接缝执行副作用，拿不到裸 `process`/`fs`/`supervisor`/`fetch`。
2. 每次副作用是可描述、可组合、可补偿的 `ReversibleCommand`/`IrreversibleCommand`（复用 `@fluvient-loom/port`），带人类可读描述；分类缺失时保守按 mutate 处理。
3. 执行策略由组合决定：real / dry-run / test 三种实现。dry-run 放行 observe、记录 mutate 并渲染计划；test 注入假实现。
4. 一致性由三道门禁保证：类型（接口不再暴露原语）、架构扫描（命令代码禁止直连 `node:fs`/`node:child_process`/`node:net`/`fetch`）、全命令 dry-run 一致性测试（新命令自动纳入）。

复用映射与自建边界：

| 能力 | 归属 | 说明 |
| --- | --- | --- |
| 效果协议（prepare/execute/compensate、OperationIdPort） | 复用 `@fluvient-loom/port` | `ReversibleCommand`、`IrreversibleCommand` 就是 plan/apply/rollback 协议 |
| Node 适配器（操作 ID、调度、内存持久化） | 复用 `@fluvient-loom/node` | `createNodeOperationId`、`createNodeScheduler`，避免再造 |
| 网络、超时、重试、测试替身 | 复用 `@fluvient-loom/net`、`@fluvient/core/http`、`@fluvient-loom/mock` | `createFetchNetwork` 自带分档超时、流式 body、`withHttpRetry` |
| Result、取消、资源释放 | 复用 `@fluvient/core` | cli-kit 已在使用 `Result` |
| 架构扫描框架 | 扩展现有 `package-guard.ts` | 新增 ops 命令域规则，不新造工具 |
| process exec、fs 写、supervisor/服务生命周期 | ops 自建（cli-kit/cli-core） | `packages/ts` 是前端内核，无进程能力；这是合理边界 |
| 计划的人类/NDJSON 渲染 | ops 自建（cli-kit 输出层） | 消费 `PreparedCommand` 的描述 |

## 成功标准

1. 新增 `SPEC-OPS-EFFECTS-001` 并生效：定义效果词汇与 intent 规则、策略接缝、计划渲染、合成结果与 read-after-write 契约、与 `SPEC-OPS-PARAMETERS-001`/`SPEC-OPS-OUTPUT-001` 的关系；公共命令行为、退出码与现有 JSON 事件契约不因本计划变化（如需新增事件，先修订 Spec）。
2. 框架落地：`cli-kit` 提供效果派发器与 real / dry-run / test 策略，`dryRunPlugin` 从「只注册全局开关」变成真正承担策略切换；命令不再依赖 `if (context.dryRun)` 实现安全。
3. release 纵切片先跑通：release 以 `ReversibleCommand` 改写，`prepare` 产出计划、dry-run 只渲染、真实执行失败按逆序 `compensate`；现有 release 测试基线保持通过。
4. 全量迁移：apps/blog 的 20 个命令与 blog-deploy installer 按同一协议接入；`CommandContext` 删除裸端口；安装器至少复用 `@fluvient/core/http` 的预检与重试能力（大文件下载进度走 HTTP 内核流式接口，不走 `NetworkPort.readText`）。
5. 三道门禁落地且有变红证据：类型层（删端口后命令无法编译直连原语）；架构层（在命令代码注入 `node:fs` 变红）；一致性层（遍历注册表命令用 fake 效果跑 dry-run，断言零真实 mutate、计划快照、退出码）。
6. 复用证据：apps 内不再保留自建 fetch/重试实现；任何无法复用的自建项在 Spec 或 RESULT 中记录理由。
7. 收尾通过：`ops quality check`、`ops package check`、相关命令测试；`docs/CODEMAP.md`、`docs/guides/operations.md` 与 Specs 更新；`git diff --check` 通过；`RESULT.md` 区分已执行、未执行与残余风险。

## 非目标

- 不引入 Cordis、插件热加载、HMR 或可卸载生命周期；不把 ops 重写成 DeepSeek Harness。
- 不改变命令名、参数模型、退出码和现有 NDJSON 字段；dry-run 的计划文案允许调整，但语义与参数校验要求不变。
- 不重构前端业务，不改变 `packages/ts` 现有消费者语义（共享包改动优先加法）；不升级依赖或刷新 lockfile。
- 不把 runtime 长驻服务的执行模型硬塞进请求/响应派发；runtime 保留 plan-first，只统一计划描述的来源。
- 不顺手迁移与本协议无关的命令行为；blog-deploy 的部署语义不变，只换底层网络能力。

## 约束与依据

- 用户决策（2026-10-06）：接受破坏性改动；目标是降低新命令接入成本；设计参照 DeepSeek Harness（https://github.com/deepseek-ai/deepseek-harness 的 architecture 文档）。
- 现有框架入口：`packages/cli/cli-kit/src/commands.ts`（CommandContext）、`packages/cli/cli-kit/src/ports.ts`（process/fs/supervisor）、`packages/cli/cli-kit/src/plugin.ts`、`packages/cli/cli-core/src/plugin.ts`、`packages/cli/cli-plugins/src/index.ts`（`dryRunPlugin`）。
- 共享包：`packages/ts/port/src/ports/command.ts`、`packages/ts/net/src/network.ts`、`packages/cli/node/src/`、`packages/ts/mock/src/network.ts`、`packages/ts/core/src/http/`。
- 架构扫描：`apps/blog/src/quality/package-guard.ts`、`apps/blog/test/commands/package-guard.test.ts`；注意其按设计跳过 `packages/cli` 与 `apps` 域，新规则需显式加域。
- 现有 Spec：`SPEC-OPS-PARAMETERS-001`、`SPEC-OPS-OUTPUT-001`、`SPEC-OPS-RUNTIME-001`、`SPEC-ARCH-BOUNDARY-001`。
- 已知边界案例：`apps/blog/src/delivery/deploy-package.ts` 先写 staging 再读文件算 SHA256（read-after-write）；`apps/blog/src/release/release.ts` 的发布计划目前靠多步 git 读取；安装器 dry-run 会做真实网络预检（observe 允许执行）。
- 写集交叉：`apps/blog/src/quality/package-guard.ts` 与 `PLAN-QUALITY-GOVERNANCE-001` 有潜在重叠，实施前对齐；`packages/ts/port` 被前端消费者使用，改动需加法优先并跑前端测试。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| Spec 与协议定型 | architecture | 用户已确认方向 | `docs/specs/SPEC-OPS-EFFECTS-001.md`、相关 Spec 修订 | done |
| 共享包扩展 | frontend + cli | Spec 定型（`describe()` 决策） | `packages/ts/port/src/ports/command.ts`、`packages/cli/node`（如需）、对应测试 | done |
| 框架与策略 | cli | 共享包扩展 | `packages/cli/cli-kit/src/`、`packages/cli/cli-core/src/`、`packages/cli/cli-plugins/src/` | done |
| release 纵切片 | cli | 框架与策略 | `apps/blog/src/release/`、registry 局部 | done |
| 其余命令迁移 | cli | 纵切片验收 | `apps/blog/src/**` 各命令、`apps/blog-deploy/src/` | in_progress |
| 门禁与文档 | quality + cli | 迁移完成 | `package-guard.ts`、一致性测试、`docs/CODEMAP.md`、`docs/guides/operations.md` | pending |
| 集成复核与收尾 | project-manager | 全部工作流 | 本计划 `RESULT.md` | pending |

命令迁移按风险从高到低分批：release → delivery package/installer → local → content/admin → quality/workspace/page → runtime。每批独立可回退；`apps/blog/src/registry.ts` 由同一 workstream 串行修改，避免并行写集冲突。runtime 只做计划描述来源统一，不迁移执行模型。

## 执行记录

- 2026-10-06：`SPEC-OPS-EFFECTS-001` 落地；`@fluvient-loom/port` 的 `PreparedCommand` 增加可选 `describe()` 与 `CommandDescription`；`cli-kit` 新增 `EffectPort`/`createEffectPort`/`reversibleEffect`，`dryRunPlugin` 绑定 `effectsPolicy`，`corePlugin` 注入 `operationIds`；release 迁移为效果协议（tag 可补偿、push 不可逆、失败回滚）。
  - 通过：`packages/cli/cli-kit/test/effects.test.ts`（5）、`apps/blog` 121 项（108 通过、13 跳过、0 失败）、`apps/blog-deploy` 21 项、`@fluvient-loom/node` 10 项、`@fluvient-loom/port` 5 项、前端 `test:foundation` 7 项。
  - 真实运行：`node --experimental-strip-types apps/blog/src/main.ts release script --allow-dirty --dry-run` 输出观察结果与 `DRY-RUN: 创建/推送 tag` 计划，退出 0，仓库无新 tag。
  - 兼容修复：`packages/cli/node/src/index.ts` 改为显式 `.ts` 相对导入，保证 `node --experimental-strip-types` 测试链路可解析。
  - 未完成：架构扫描加域、全命令 dry-run 一致性测试、其余 19 个命令与 installer 迁移、CODEMAP/guides 更新。
- 2026-10-06（第二批）：delivery package/installer、quality check/lint/format、package check、page check 迁移到效果协议；`cli-kit` 增加 `processStepEffect`/`reportPlan`；删除 6 处命令级 `if (dryRun)` 安全分支（只保留计划渲染）。
  - 通过：apps/blog 121 项（108 通过、13 跳过、0 失败）、类型检查无新增错误；真实 dry-run 冒烟 `quality format`、`delivery package`、`delivery installer` 均只打印 `DRY-RUN:` 计划且零副作用。
  - 剩余命令：workspace doctor（只读，暂缓）、local install/uninstall、content repository init、admin credentials、e2e、perf、runtime、blog-deploy installer。
- 2026-10-06（框架演进）：派发器改为 waterfall(next) 洋葱管线。新增 `EffectMiddleware`/`EffectExecution`/`createEffectDispatcher`；dry-run 退化为内置中间件；`CliPlugin.effectMiddlewares` 由 `createCliApp` 按插件顺序收集组装；`createEffectPort` 保留为 dispatcher + dry-run 中间件的兼容糖，命令代码零改动。用户决策：本版中间件不改写效果参数。
  - 通过：cli-kit 29 项（新增洋葱顺序、短路、拒绝、元数据对照、插件顺序用例）、apps/blog 121 项（108 通过、13 跳过、0 失败）、blog-deploy 21 项；真实 dry-run 冒烟 `quality format`、`release script`、`delivery package` 输出不变；类型检查无新增错误；`git diff --check` 通过。
- 2026-10-06（去 dryRun 元数据）：删除 `EffectPort.dryRun`；`reportPlan` 改为无条件渲染（real 模式 plan 为空）；release 的发布确认门改为首个效果（dry-run 被短路故不需要 `--yes`，真实执行先于任何变更校验并以 10 退出）；deploy-package 去掉 dry-run 专属提示行。`createEffectDispatcher` 不再接收 dryRun，仅 `createEffectPort` 兼容糖保留构造参数。
- 2026-10-06（审查整改）：错误通道统一为 `EffectFailure`，删除 `run` 的类型断言，内部不再出现 `unknown`/`as`（仅边界 `toEffectFailure` 转换一次）；状态收敛到 `EffectScope` 并提供 `createScope()` 隔离；`rollback()` 不中断并返回 `{ compensated, failures }`；`next()` 单次调用防护；`prepare`/`execute`/中间件异常统一转换，`execute` 抛异常先补偿自身；`processStepEffect` 错误带步骤与退出码；`createEffectPort` 支持额外中间件。
  - 通过：cli-kit 33 项（新增 rollback 聚合、异常转换、next 防护、作用域隔离）、apps/blog 121 项（108 通过、13 跳过、0 失败）、blog-deploy 21 项；类型检查无新增错误；release/quality 真实 dry-run 冒烟不变；`git diff --check` 通过。
- 2026-10-06（裸 await 门禁）：新增 `tools/oxlint/no-bare-await.mjs`（本地 oxlint JS 插件）与根 `.oxlintrc.json`，要求读取 `await` 返回值；显式声明 `Promise<void>` 的本地函数豁免，宿主适配层 `packages/cli/cli-core` 整层豁免。作用域内 26 处裸 await 全部整改：`effects` 失败补偿读取 `Result.ok` 并合并补偿失败信息、release 补偿读取 `git` 退出码、delivery 以显式 `Promise<void>` 的 `applyAll`/`ensureDirectory` 包装文件操作。`ops quality check` 增加 `ops lint (no bare await)` 步骤。
  - 通过：作用域 lint exit 0，注入探针裸 await 变红（exit 1）；cli-kit 33、apps/blog 121、blog-deploy 21、类型检查无新增错误、`git diff --check`。

## 集成验收

1. 审阅 `SPEC-OPS-EFFECTS-001` 与相关 Spec 修订，确认协议、intent 规则、read-after-write 契约、门禁定义完整且与现有输出/参数契约一致。
2. release 纵切片：`ops release script --dry-run` 计划可读且无副作用；在临时仓库执行真实发布/失败补偿演练，证明 `compensate` 路径生效；现有 `apps/blog/test/commands/release.test.ts` 基线通过。
3. 全命令一致性测试：fake 效果下遍历注册表 20 个命令，断言零真实 mutate、计划快照稳定、退出码符合 Spec；新增命令自动纳入。
4. 变红证据：命令代码注入 `node:fs` 触发架构扫描失败；删除端口暴露后直连原语无法编译；一致性测试在注入真实写时失败。
5. 复用验收：apps 中无自建 fetch/重试实现；`@fluvient/core/http` 或 `@fluvient-loom/net` 至少被 content 与 installer 路径实际使用并有测试证据。
6. 运行 `ops quality check`、`ops package check`、相关测试；检查文档链接、示例命令和 `git diff --check`；在 `RESULT.md` 记录未执行项、环境限制与残余风险。

## 未决项

- `describe()` 归属：给 `@fluvient-loom/port` 的 `PreparedCommand` 加可选描述，还是 ops 侧包装类型；倾向加法可选字段，避免影响前端消费者。
- 架构扫描加域方式：在现有 guard 中新增 ops 命令域规则，还是独立的命令边界检查；需与 `PLAN-QUALITY-GOVERNANCE-001` 对齐，避免两边同时改 `package-guard.ts`。
- read-after-write 的合成契约：fs 用内存 overlay，exec 类规定「先 observe 后 mutate」还是提供 overlay；deploy-package 的 SHA256 步骤按结论调整。
- runtime 长驻服务的 plan-first 边界：`service.start` 效果在 dry-run 下不起进程，等待/就绪逻辑如何短路。
- 安装器（blog-deploy 单文件 bundle）的迁移时机：本轮一次性接入，还是先只复用 HTTP 内核，效果协议留到后续。
- 旧 `dryRun` 上下文开关的保留范围：迁移完成后是否仅用于文案，还是完全移除。
