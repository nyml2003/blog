---
kind: plan
id: PLAN-FRONTEND-BOUNDARY-NORMALIZATION-001
status: completed
owner: project-manager
created: 2026-10-01
last_reviewed: 2026-10-01
---

# 前端边界归一化专项

## 目标

把"外部输入在边界归一化"从半成品做完整：每个外部入口（API 响应、存储、URL 参数、DOM 读取）有唯一、明确的归一化归属；业务层（pages/logic）不再防御入口关注点，剩余防御逐处有可追溯的正当理由。行为零变化——这是纯结构重构，不是行为优化。

依据：项目 TS 规范（`docs/guides/typescript-style.md`）已明确要求"外部 null 只能在边界归一化""不得向领域层传播两套缺失语义""优先可辨识 union"。本计划不是立新规范，而是收敛现状与既有规范的偏差。

## 当前基线（2026-10-01 初步复核，待盘点固化）

以下是初步复核提出的五类候选问题。它们是盘点的假设，不作为最终计数或改造授权；盘点记录必须逐项以当前源码和测试重新确认：

1. **协议镜像，校验不等于翻译**：`src/frontend/app/habitat/api/mobile/types.ts:35` 等。当前已有部分 `null -> undefined` 归一化；盘点需区分已完成的边界转换、仍然暴露的协议可选性，以及真正具有领域语义的缺失。
2. **不变量未在边界认证**：`src/frontend/app/habitat/mobile/logic/category.ts:16-46` 的 `categorySelection` 带 visited 集合和多个回退出口。盘点需先确认分类树不变量由哪个入口、以什么证据保证，再决定哪些防御属于 C 类。
3. **语义解析归属待确认**：`packages/web/src/persistence.ts` 负责存储传输；JSON.parse、字段校验和默认值目前集中在 `src/frontend/app/habitat/mobile/logic/settings.ts`。需要判断是否应拆出存储适配边界，以及拆分后如何保留现有错误语义。
4. **双重缺失语义**：`PersistencePort.read` 返回 `Result<string | undefined, E>`。这是共享包协议问题，是否调整必须单独决策，不能由本计划默认改动。
5. **入口解析散落重复**：当前已确认 URL 参数和日期解析分布在多个 Mobile/Desktop 页面及 bootstrap 入口；具体重复项、范围和收敛位置以盘点清单为准。

初步复核曾记录防御写法分布为 mobile logic 22 处、pages 15 处、api 8 处、components 1 处；这些数字尚无仓库内统计记录，不作为验收基线。盘点阶段必须基于最新代码重跑，并将命令、口径和逐处清单写入 [INVENTORY.md](./INVENTORY.md)。

## 处理分类框架

盘点结果按四类分拣，处理方式在决策闸门确认后执行：

- **A 应迁移的归一化**：本该在入口做的解析/校验/默认值，移到唯一归属的边界位置；
- **B 应升级为领域语义的 optional**：有真实业务含义的缺失（草稿未发布、根分类、未选中），用可辨识 union 或显式状态表达，不再以裸 optional 字段传播；
- **C 过度防御**：边界认证不变量后即可删除的防御（防不可能状态）；
- **D 保留**：有正当理由的防御，逐处注明理由。

## 决策闸门

盘点完成后与产品共同确认（未通过前不进入实现）：

- 本轮端与页面范围：仅 Mobile 公开页 / 含 Mobile 管理预览 / 含 Desktop 公开与 admin；
- 归一化的归属方案（由盘点方基于证据提出，含取舍）；
- 是否调整 `@fluvient-loom/port`/`web` 的双重缺失设计（共享包协议变更，影响 playground 等 workspace 消费者，须单独决策，不默认纳入）；
- URL/日期等散落解析的收敛位置；
- C 类删除所需的边界认证方式；
- 业务层防御写法的下降目标值（以盘点基线数字为对照）；
- `typescript-style.md` 是否补"边界必须交付什么"的操作性条款。

### 本轮执行决策（2026-10-01）

- 范围：纳入 Mobile 和 Desktop 的公开页、管理预览、编辑器、taxonomy 页面及对应 bootstrap/API 边界。
- 归一化归属：存储解析归各端 storage adapter；URL 参数和日期解析归 `src/frontend/app/habitat/route-input.ts`；taxonomy 文本归 `desktop/taxonomy-input.ts`；API 响应继续归 API schema/transform。
- 共享包：本轮不修改 `@fluvient-loom/port`、`@fluvient-loom/web`，保留现有双重缺失协议。
- C 类防御：分类树回退保留并归为 D 类，理由是当前 API 只认证字段形状，尚未认证 rooted forest 不变量。
- 目标：行为零变化；外部解析不再位于 pages/logic，剩余防御逐处有注释或测试锚定理由。
- 规范：本轮不修改 `typescript-style.md`，先用代码和盘点记录验证归属模式。

## 成功标准

1. 闸门确认范围内的每个外部入口归一化位置唯一且可指出；防御写法降到闸门确认的目标值以下。
2. 剩余防御全部为 D 类：逐处有注释或测试锚定的正当理由。
3. 行为零变化：现有单元测试、`ops e2e --mode integration` 通过；必要时补构建产物或截图对照。Mobile 二期刚交付的性能数字（切换传输、缓存命中、冷加载）不回归。
4. 盘点清单与分类处理结果留档本目录。
5. 门禁：typecheck、lint、相关测试、build；涉共享包改动加 `ops package check` 与全量 `ops quality check`。

## 非目标

- 不改后端 wire 协议、API 契约、文章可见性或路由语义。
- 不改 Desktop/Mobile 隔离边界与 `app/` 分层。
- 不顺手重构无关代码、不加功能、不做视觉变化。
- 不要求一次清零：按分类与收益分期，C 类之外的遗留明确记录。

## 约束与依据

- 规范：`docs/guides/typescript-style.md`（空值归一化、union、错误边界条款）。
- `packages/*` 是多消费者共享协议（blog 前端、playground、ops cli 包）；协议改动必须走闸门并核对全部消费者。
- 试点先行：先选 1-2 个域（如 settings + category）完整闭环验收，模式成立后再推开；禁止一次性全量铺开。
- 页面仍不得直接访问 transport、storage、wire DTO 或具体 URL；本计划不得放松既有架构门禁。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 防御式代码盘点与分类 | frontend+qa | - | `INVENTORY.md`（Mobile/Desktop 全量入口） | completed |
| 决策闸门 | project-manager | 盘点 | 本 PLAN.md 范围、目标值与方案确认 | completed |
| 试点域改造与验收 | frontend | 闸门 | settings/category 试点与测试 | completed |
| 范围内推开与规范补严 | frontend+pm | 试点验收 | 所有确认范围的代码与 `typescript-style.md` | completed for current scope |
| 收尾与留档 | pm | 推开完成 | RESULT.md、必要的架构文档更新 | completed |

## 集成验收

1. 试点域前后对照：防御写法数量、入口归一化位置清单、测试与浏览器证据。
2. 全范围推开后：`rg` 复扫防御模式计数对照目标值；D 类清单逐条可读。
3. `ops e2e --mode integration` 全旅程回归；`ops perf mobile --mode integration --runs 3` 对照二期数字不回归。
4. 涉共享包时：`ops package check`、全部消费者 typecheck。

## 未决项

- 分类树不变量的边界认证方式，决定未来是否将现有 D 类回退升级为 C 类删除；本计划保留现状。
- `@fluvient-loom/port` 双重缺失设计是否调整（本轮明确不改）。
- 是否把本轮已验证的边界归属模式补充到 `typescript-style.md`；本计划未修改规范。

全量盘点与分类结果见 [INVENTORY.md](./INVENTORY.md)，收尾证据见 [RESULT.md](./RESULT.md)。
