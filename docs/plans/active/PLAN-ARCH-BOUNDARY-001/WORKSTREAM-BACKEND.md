---
kind: workstream
id: WORKSTREAM-BACKEND
status: completed
plan_id: PLAN-ARCH-BOUNDARY-001
role: backend
owner: backend
depends_on:
  - WORKSTREAM-GUARDRAIL
  - PLAN-CONTENT-GITHUB-TRUTH-001:backend-write-sets-handoff
write_set:
  - src/backend/product/src/http.rs
  - src/backend/product/src/bff/
  - src/backend/product/src/
  - src/core/protocol/src/wire.rs
  - src/core/protocol/src/
  - src/backend/product/tests/
  - src/backend/mock/
  - src/backend/data/src/store/mock.rs
  - src/backend/data/src/store/sqlite.rs
  - src/backend/data/src/store/validation.rs
  - docs/architecture/backend.md
  - docs/architecture/data-and-api.md
  - docs/specs/SPEC-ARCH-BOUNDARY-001.md
last_reviewed: 2026-09-07
---

# 工作流：后端治理（R3）

## 目标

`http.rs` 拆为纯协议适配（路由 / 参数解析 → 类型化 Query / envelope / 日志），BFF 编排（货架分组、截断、推荐规则、"未分类"兜底）迁入 Product 的 BFF 模块，`core/protocol` 只剩形状映射。豁免清单后端项清零。零行为变化。

## 输入

- AUDIT-REPORT 后端清单（http.rs 决策点逐处摘出 + wire.rs 编排行为清单）；
- 前置：CONTENT-TRUTH 后端工作流（REPO-CONTRACT / BACKEND-READ / BACKEND-WRITE）写集交接——其 `content_*` 模块本身是编排层落位的一部分，治理在其交付面上收敛，不与之并行改 `http.rs` / 协议；
- `SPEC-CONTENT-GITHUB-TRUTH-001` 层间接口节（Data 边界表述吸收）。

## 输出

- `product/bff/`（或等价模块）：货架 BFF（分组 / 截断 / 推荐开关 / 分区排序 / 兜底）自 `http.rs` 与 `wire.rs` 迁入；
- `http.rs`：仅剩路由、参数→Query、调用 BFF/Data、envelope、日志；`parse_*` 家族保留但语义转换移出；
- `wire.rs` / protocol：`to_shelf` 等函数降为纯形状映射（或迁 BFF 后由 protocol 提供 DTO 定义）；protocol 无业务决策；
- Data store/domain 边界核验（禁 HTML / HTTP / GitHub 感知；Data Server HTTP adapter 保留协议职责）与既有表述对齐；
- 架构文档（backend.md / data-and-api.md）分层图更新；
- 豁免清零 + Spec 证据回填。

## 实施任务

1. BFF 模块骨架 + 货架链路样板（`to_shelf` 迁移 → 测试绿 → 门禁绿）；
2. `http.rs` 逐 scene 适配化（决策点迁移）；
3. protocol 纯化核验 + 门禁后端规则全量生效；
4. 文档更新 + Spec 证据回填。

## 测试/验收

- 每步迁移后：`cargo test --workspace` 全绿；product/mock 契约测试对响应零 diff（含货架分组 / 截断 / 推荐场景）；
- `http.rs` 与 `wire.rs` 按 Spec 场景 003 审查通过；
- 门禁豁免后端项清零。

## 阻塞

- CONTENT-TRUTH 后端写集交接（`http.rs` / 协议重度冲突，必须串行）。

## 交付记录

- 2026-09-07：CONTENT-TRUTH 已归档并完成写集交接；执行以归档 RESULT 所述的部分交付代码为当前基线。Product `static_files.rs` 暂归 PAGE-TEMPLATE 独占，本工作流不修改。
- 2026-09-07：Product 与 Mock 的 Mobile F 型货架和新增 T 型货架编排归位到各自 `bff/`；HTTP 只保留路由、参数适配、调用、envelope 与日志，protocol 删除 `to_shelf` 等业务编排。
- 2026-09-07：文章术语类型校验归入 Data/Mock 事务域，Product 不接触 SQL；架构文档同步完成，后端分层门禁无豁免。
- 2026-09-07：`cargo fmt --all --check`、workspace clippy（`-D warnings`）和 workspace tests 全部通过；Product→Data 真实链路、Product/Mock T 型契约、既有 Mobile F 型契约及错误语义均有回归覆盖。
