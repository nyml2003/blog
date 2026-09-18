---
kind: plan
id: PLAN-LOOM-DATA-001
status: ready
owner: project-manager
created: 2026-09-11
last_reviewed: 2026-09-11
---

# @fluvient-loom 数据内核四包（common / port / query / command）

## 定位与范围裁定

自 `PLAN-PAGE-RUNTIME-001` 拆出（2026-09-11 用户裁定一拆为二）：本计划交付**平台中立的数据内核三包**；页面运行时（container / page / web / solid、导航脊柱、保活池、blog 接入）留在原计划。

- **D7（沿用）**：只做新 npm 包——pnpm workspace 私有，**不发布**，**不接入业务**；
- **平台中立铁律**：包源码**不依赖 node / web / solid**——`src/` 只含内核逻辑与端口契约，平台适配归 `PLAN-PAGE-RUNTIME-001` 的 web / solid 包；
- **消费验证用 node 冒烟脚本**（仓库设施层，不算包源码）；playground / 可点 demo 随 web 适配包后置（原 W4 导航 demo 提案就此关闭，在 `PLAN-PAGE-RUNTIME-001` web 期回归）。

## 包清单

| 包 | 内容（← `src/frontend/app/kernel/` 胚胎映射，只读参照不搬动） | 依赖 |
| --- | --- | --- |
| `@fluvient-loom/common` | `result.ts`、`cancellation.ts`、`readonly.ts`、`resource.ts`——Result、DeepReadonly、取消原语与实现等通用基建 | 无 |
| `@fluvient-loom/port` | 纯协议：Scheduler / Task / Command / Persistence 四组端口契约（2026-09-11 用户增补"port 单独出一个包，主要放各种协议"） | common |
| `@fluvient-loom/query` | `task.ts`（DataTask）、`resource.ts`（DataResource）——读任意数据 | common、port |
| `@fluvient-loom/command` | `desired-state.ts`（乐观/回滚/重试 mutation）+ 工厂 `createPersistentDesiredState` | common、port（devDep: query，仅测试用真实 DataTask） |

依赖链单向无环：`port → common` 为契约层，query / command 只依赖契约层与基建、彼此零耦合（端口独立后 command→query 的边消失）。Web 味端口（navigation / document / viewport / space-time / network）不进本期，随后置适配包。

## 工作流

| 步 | 内容 | 验证 |
| --- | --- | --- |
| W1 workspace 骨架 | root `package.json` + `pnpm-workspace.yaml`（最小 workspace，成员 `packages/*`）+ 四包目录 + `tsx --test` 设施 + ops 独立命令 `ops package check`（复用 ops ports，不并入 quality check）+ node 冒烟脚本 | workspace 从零可装、`ops package check` 跑通 |
| W2 四包内容 | 胚胎六件套（result / cancellation / readonly / task / resource / desired-state + 端口契约）映射进包，单测零改写移植 | 四包单测全绿 |
| W3 生命周期工厂 | `createPersistentDesiredState`：PersistencePort 同步 restore、DataTask 异步 reconcile、`createDesiredStateMutation`、`project(state)` 唯一投影钩子 | 单测：restore / reconcile / 乐观更新 / 回滚 / 重试五路径全过 `project` |

**写集铁律**：仅新增 `packages/` 三包目录、root workspace 文件、ops 独立命令入口（`ops/src/` 新增 `ops package check`，复用既有 ports）与冒烟脚本；**不碰 `src/frontend/`，不改 `ops quality check` 既有行为**。

## 平台中立护栏

- 包 `src/` 的 import 白名单：包内相对路径 + 同 scope 包；禁 `node:` 前缀模块、禁触碰 window / document、禁 solid-js；
- 护栏检查做进 `ops package check`（复用 ops `architecture.ts` 的 import 扫描模式）；
- 测试文件（`tsx --test`，node runner）与 `src/` 分目录，不在护栏范围；冒烟脚本属仓库设施层，同不算包源码。

## 实施决策（2026-09-11 逐项拍板，自家沿用）

| # | 决策 |
| --- | --- |
| I1 | 最小 workspace：`packages/*` 独立成员，`src/frontend` 保持独立安装不入成员 |
| I2 | 测试设施沿用 `tsx --test`（tsc --noEmit 类型门禁 + tsx --test 单测），胚胎单测零改写迁移 |
| I3 | 源码直出：包 `exports` 指向 TS 源码入口，消费方即时编译；不构建 dist，将来发布再补 |
| I4 | root script + ops 独立入口：root `package.json` script 本地自转；`ops package check` 跑包门禁，复用 ops 既有设施，不并入 `quality check` |
| I5 | 多包结构（替换单包 `@fluvient-loom/runtime` 提案）：common / query / command 三包起步；playground 撤销改 node 冒烟脚本；demo 随 web 适配包后置 |

## 验收

1. workspace 装配可复现：干净环境 `pnpm install` + `ops package check`（含平台中立护栏）从零跑通；
2. 四包单测全绿 + 工厂五路径（restore / reconcile / 乐观 / 回滚 / 重试）全过 `project`；
3. 冒烟脚本跑通（三包可被消费，fake persistence 走一遍工厂）；
4. `src/frontend` 零改动，blog 既有测试全绿。

## 后置（指向 PLAN-PAGE-RUNTIME-001）

container / page / web / solid 包、导航脊柱（栈≡日志折叠、槽/form、导航事务）、保活池、ViewAdapter（R0 审定）、playground 与可点 demo、blog 接入（settings 三 bug 收账、kernel 双源切并、`test:core` 合并）。

## 设计依据（摘自 PLAN-PAGE-RUNTIME-001 共识）

- D1：生命周期四段（restore→reconcile→mutate→project）做成 kernel 通用工厂，不下放 habitat；
- 状态分层：会话状态（theme、auth）跨页面，**永不进导航快照**（第五格）——工厂管的就是这一格；
- kernel 不 import solid；signal 镜像留消费侧（habitat / 适配层）；
- 端口纪律：内核依赖 ports 而非"Web 标准"——本计划只交付端口契约与内核逻辑，第一个适配环境（web）归后续计划。
