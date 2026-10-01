---
kind: plan
id: PLAN-FRONTEND-CODEC-PERSISTENCE-001
status: ready
owner: project-manager
created: 2026-10-01
last_reviewed: 2026-10-01
---

# Codec/Persistence 原语包抽取

## 目标

把产品已定稿的持久化分层方案（业务 / Codec / 编排 / Port / 存储实现，2026-10-01 对话留档）先以 workspace 包形式落地：**先抽包、独立验收，前端接入后置**。本轮交付：

1. `@fluvient-loom/common` 原语增补：`LoomError`（带 `cause` 透传）与 `createError`；
2. `@fluvient-loom/codec` 新包：`Codec<T>` / `createJsonCodec` / `CodecError`，完整实现 + 单测，作为后续包的模板；
3. persistence 原语（`PersistPlan` 及对应 port 签名演进）——归属经闸门确认后落地；
4. ADR：把方案第八节的刻意取舍（序列化不进 port、PersistPlan、codec 只认 string、错误联合、读缺省返回默认值）留档评审。

前端接入（settings 迁移到该栈）不在本计划——归 `PLAN-FRONTEND-BOUNDARY-NORMALIZATION-001` 的试点域，消费本计划产出的包。

## 设计输入（产品已决策，本计划不重开）

以下为已定架构，实现不得偏离；细节以对话留档全文为准：

- **分层边界**：业务只认领域类型；Codec 层对象⇄字符串纯函数；编排层业务意图→`PersistPlan`；Port 只认 key+string；存储实现只写字节。
- **Codec 铁律**：只认 `string` 不认二进制（二进制另包 transport codec）；`encode`/`decode` 绝不抛异常，全走 `Result`；`validate`/`normalize` 是可选钩子，不绑 schema 库；`normalize` 负责裁掉未知字段防旧数据写回污染。
- **PersistPlan**：`write(plan: PersistPlan)` 而非 `(key, string)`，为版本/时间戳/批处理预留；序列化不在 port 里做。
- **错误模型**：`LoomError` 带 `cause` 全链路透传；领域错误是联合（`settings | codec | persistence`）靠 `kind` 区分，不做 class 继承。
- **编排层是纯函数**不是类；`prepare` 中算 plan 走 `Result`、不 reject；`execute`/`compensate` 共用 `applyPlan`。
- **读路径缺数据返回默认值**是产品决策；换产品语义时改那一处即可。
- 方案中的 settings 字段（light/dark/system、locale、notifications）仅为示例，不构成契约；接入时以真实领域模型（paper/dark/sepia + font）与真实 key（含 legacy 迁移）为准。

## 当前基线（2026-10-01 现场核实）

- `packages/common`：现有 `Result`/`ok`/`err`/`DeepReadonly`/`ResourceHandle`，**无** `LoomError`/`createError`——确属增补，且不得破坏既有消费者（`port`/`query`/`command`/`web`/`node` 等）。
- `packages/port`：已有 `PersistencePort`/`AsyncPersistencePort`/`combinators`/`PersistenceFailure`（含 `operation` 字段）；`packages/web` 已有 localStorage 适配器。**无 codec 包**。
- 包门禁：`ops package check`（平台中立护栏 + typecheck/test/smoke）；npm 发布决策沿用 `PLAN-FRONTEND-INFRASTRUCTURE-PACKAGES-001` 收尾记录，默认不发布。
- 前端 settings 现状（接入背景，本计划不动）：`logic/settings.ts` 四种职责混居，`parseSnapshot` 的 try/catch、legacy key 迁移、默认值归一化都在业务文件里。

## 决策闸门（实现前确认，均为方案留白或与现状的接缝）

- **persistence 原语归属**：新建 `@fluvient-loom/persistence` 包，还是演进展 `@fluvient-loom/port`（既有 `PersistencePort` 消费者：web 适配器、前端 habitat、combinators）——影响签名迁移面，实现方给方案后定。
- **port `read` 的 `string | null`**：与 TS 规范"领域缺失用 `undefined`、外部 null 边界归一化"的接缝——port 是边界，`null` 可表示原生缺失，但消费侧归一化到 `undefined` 的位置要在接入时钉死。
- `codec` 是否本轮就带 zod 适配示例（`validate` 钩子接 `safeParse`）或留到接入再加。
- ADR 编号与归档位置（`docs/architecture/` 决策记录惯例是否已有，无则本 ADR 定格式）。

## 成功标准

1. `common` 增补落地：`createError`/`LoomError` 带 `cause` 透传，全部既有包 typecheck/test 不破。
2. `@fluvient-loom/codec` 落地：`encode`/`decode` 全路径返回 `Result` 不抛异常（用异常注入测试证明）；`validate` 拒绝、`normalize` 裁剪、`JSON.stringify` 返回 `undefined` 兜底均有边界单测。
3. persistence 原语（闸门定归属后）落地且现有 `PersistencePort` 消费者迁移路径明确（本轮不强制迁移，但路径成文）。
4. `ops package check` 对新包通过；单测以 `codec` 包为后续包的模板（覆盖度与写法可复制）。
5. ADR 留档并通过产品评审。
6. 前端行为零变化：不 import 新包，构建产物不变。

## 非目标

- 不接入前端、不迁移 `logic/settings.ts`（归 `PLAN-FRONTEND-BOUNDARY-NORMALIZATION-001` 试点）。
- 不改现有 `PersistencePort` 签名与 `packages/web` 适配器行为（除非闸门明确迁移路径并单独实施）。
- 不发布 npm；不做二进制 codec；不引入 schema 库依赖进 codec 包本体。
- 不定义新错误码体系或改动 `SPEC-OPS-OUTPUT-001`。

## 约束与依据

- 平台中立：`codec`/`common` 不得依赖 DOM、Node API 或 Solid（`ops package check` 护栏会拦）。
- 写集协调：与 `PLAN-FRONTEND-BOUNDARY-NORMALIZATION-001`（active）在接入阶段衔接——本计划产包、彼计划消费；`common`/`port` 是共享协议，签名演进走闸门并核对全部消费者（blog 前端、playground、ops cli 包）。
- 方案全文（对话留档）为设计事实源；ADR 落地后以 ADR 为准。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| common 原语增补 | frontend | - | `packages/common/src/`、其测试 | ready |
| codec 包实现与单测 | frontend | common 增补 | `packages/codec/`（新建） | blocked by common |
| ADR 起草 | frontend+pm | -（可并行） | `docs/architecture/` 或闸门定位置 | ready |
| 闸门：persistence 归属等 | 产品+pm | codec 包成型 | 本 PLAN.md 决策记录 | blocked |
| persistence 原语落地 | frontend | 闸门 | 闸门定归属的包 | blocked by 闸门 |
| 收尾：包模板总结与移交 | pm | 全部落地 | RESULT.md、boundary plan 移交记录 | pending |

## 集成验收

1. 异常注入证明：对 `encode`/`decode` 传入会抛的实现（如循环引用、非法 JSON）断言返回 `err` 且 `cause` 保留。
2. 既有消费者回归：全部 `@fluvient-loom/*` 包与前端 typecheck、`ops package check` 通过。
3. 前端 `vite build` 产物清单与改前一致（零接入证明）。
4. ADR 覆盖方案第八节全部取舍点，产品评审通过。

## 未决项

- persistence 原语归属（新包 vs 演进 port 包）——闸门第一题。
- port `read` null 语义与规范 `undefined` 条款的归一化位置——接入时钉死。
- zod 适配示例是否本轮纳入。
- ADR 格式与归档位置。
- npm 发布时机（沿用既有未决记录）。
