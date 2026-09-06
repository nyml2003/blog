# 计划结果

## 计划

- Plan ID：`PLAN-OPS-PARAMETERS-001`
- 最终状态：`completed`，实现与验证完成，用户已授权关闭并归档。
- Owner：main-agent。
- 验证日期：2026-09-06。
- 归档日期：2026-09-06。

## 结果

- 将 argv 结构解析与字段值解析拆开；声明只支持 int32 / enum / switch，帮助和处理器输入类型均来自声明。
- int32 / enum 显式必填，不从默认值、环境变量或配置回填；运行计划与执行层不再兜底端口、scenario 或 data mode。
- switch 只按是否出现确定布尔值，重复出现仍为 true，不接受赋值、独立值或自动反向别名。
- 迁移 runtime 端口、scenario、data mode、watch，quality format 的 check 及全局 help / dry-run / json；原有路由、组、帮助别名和项目绑定保持。
- 使用现有 ops quality check 承载新增测试，未创建 quality test、suite 或新的测试编排。

## 验证证据

命令均从 `/home/nyml/projects/blog` 执行，通过 `direnv exec /home/nyml/projects/blog` 绑定项目环境。

| 验收项 | 命令或测试 | 结果 |
| --- | --- | --- |
| 改造前质量基线 | `direnv exec /home/nyml/projects/blog ops quality check` | 通过 |
| 改造后完整门禁 | 同上 | 通过；Rust fmt / clippy / test、Ops 语法与契约测试、前端 typecheck / lint / format:check / build、依赖边界 |
| 真实进程和构建 | `OPS_RUNTIME_E2E=full direnv exec /home/nyml/projects/blog ops quality check` | 通过；沿用现有进程/构建测试，不是仅执行 dry-run |
| 模型、整数边界、枚举和非法声明 | `value-parser.test.ts` | 通过；包含 int32 上下界、端口范围、非法整数格式、枚举完整选项、拒绝旧元数据和自定义模型 |
| 参数和路由契约 | `parser.test.ts` / `cli.test.ts` / `help.test.ts` / `commands.test.ts` | 通过；必填、无环境回填、switch 语义、重复值、全局开关相邻关系、帮助、类型推导和声明冻结 |
| 运行输入与副作用边界 | `runtime.test.ts` / `port-allocation.test.ts` / CLI dry-run 测试 | 通过；缺参不能生成运行计划，端口重试和进程收尾保持原契约 |
| 差异检查 | `git diff --check` | 通过 |

## 人工 Review

- 发现并修复：全局开关预先剥离会把 `--data --json mock` 错配为 `--data mock`。路由使用过滤后的 token，参数解析保留原始位置和相邻关系，并增加回归测试。
- 检查了缺值、非法值、重复值、`--` 终止符、switch 不消费后续值以及无副作用 dry-run 的错误路径。
- 删除旧端口自定义校验函数，字段范围统一由 int32 模型表达；固定 loopback、端口尝试次数与进程超时等运行策略不属于参数回填，保持不变。
- 测试中仅为构造非法声明保留明确说明的类型断言；生产处理器通过运行时模型守卫收窄输入，不依靠类型断言转换未知参数。

## 类型检查边界

当前质量入口只对 Ops 做语法检查和运行契约测试；其中 `pnpm typecheck` 针对前端，不能据此声明 Ops 完整严格类型检查通过。

额外运行了以下独立检查（该命令用于诊断，不是新增测试入口）：

```sh
direnv exec /home/nyml/projects/blog pnpm -C src/frontend exec tsc \
  --ignoreConfig --noEmit --strict --skipLibCheck --target es2022 \
  --module preserve --moduleResolution bundler --allowImportingTsExtensions \
  --types node /home/nyml/projects/blog/ops/src/interface/cli.ts
```

用 `git archive HEAD ops` 导出的改造前源码执行同一检查，并通过 `--typeRoots` 指定当前项目 Node 类型，确认基线有 10 处错误，改造后剩余 6 处，无新增错误：

- application/runtime.ts 的 PortProbe 导入来源、signal unsubscribe 返回类型、ReadinessOptions.isCancelled 与 ProcessGroupPort.firstExit 共享接口问题，共 4 处；
- infrastructure/net.ts 的 ReadinessOptions.isCancelled 问题，1 处；
- domain/commands.ts 的既有 defineGroup 非空路径 tuple 推导问题，1 处。

将命令末尾的入口改为 `ops/src/interface/value-parser.test.ts` 后，独立模型和解析测试的严格类型检查通过。这 6 处既有共享接口错误留待独立治理，本次不扩大修改范围。

## 文档与范围

- 新增 SPEC-OPS-PARAMETERS-001，更新 Runtime / Usability Spec、运维和测试指南、基础设施说明、README、AGENTS 与计划索引。
- FACTS 无变更；未改变产品目标、Rust / 前端业务实现、数据库布局、Nix 或依赖。
- string / path、自定义解析、quality test 和测试编排仍推迟；真实进程用例使用已有 OPS_RUNTIME_E2E 开关，并非允许命令参数从环境回填。
- 真实进程回归不等于浏览器交互或生产环境验收；本次未执行浏览器视觉验收，也未提交或推送。

## 归档记录

2026-09-06，用户在确认归档条件与已知限制后明确要求执行归档流程。计划和单一工作流均标记为 completed，PLAN.md 与本结果记录整体移入 `docs/plans/archive/PLAN-OPS-PARAMETERS-001/`，计划索引改为最近归档。

本次归档仅调整计划文档及索引，保留上述实现阶段测试证据，不重跑代码门禁或改变其验证时间。归档检查覆盖文件完整性、完成状态、相对链接、旧 active 路径引用及文档差异；6 处既有类型错误和明确延期项仍按上述边界记录，不因归档视为已解决。
