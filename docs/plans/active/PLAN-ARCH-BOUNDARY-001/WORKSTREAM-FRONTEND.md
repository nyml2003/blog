---
kind: workstream
id: WORKSTREAM-FRONTEND
status: ready
plan_id: PLAN-ARCH-BOUNDARY-001
role: frontend
owner: frontend
depends_on:
  - WORKSTREAM-GUARDRAIL
  - PLAN-MOBILE-BROWSE-IA-001:archived
  - PLAN-MOBILE-ATOM-EXPANSION-001:archived
write_set:
  - src/frontend/common/data/
  - src/frontend/solid/data/
  - src/frontend/common/client/
  - src/frontend/mobile/src/pages/
  - src/frontend/mobile/src/logic/
  - src/frontend/desktop/src/pages/
  - src/frontend/desktop/src/app.tsx
  - docs/architecture/frontend.md
  - docs/specs/SPEC-ARCH-BOUNDARY-001.md
last_reviewed: 2026-09-06
---

# 工作流：前端治理（R2）

## 目标

按审定落位建立查询层，把数据装配从两端全部页面剥净（参数映射、fallback、错误语义、数据整形归查询层），豁免清单前端项清零。零行为变化。

## 输入

- R0 审定的查询层落位与 AUDIT-REPORT 前端清单；
- 既有资产：`useDataResource`、`createDataTask`、client 全部端点方法、`filterFromSearch/filterSearch`；
- 前置：BROWSE / ATOM-EXPANSION 归档（页面与 client 写集交接）。

## 输出

- **查询层**（位置按 R0 审定）：页面语义 hooks 全集——两端列表 / 详情 / 推荐 / taxonomy / 后台（保存 / 发布流随 CONTENT-TRUTH 交付形态对齐）、filter→query 映射、无效 ID 兜底任务、错误语义归一；
- **页面去数据化**：逐页替换为 hooks 消费，删除内联 client 调用 / createDataTask / 参数映射；组合根仅保留 transport 装配；
- 每迁一页：对应豁免项清零，门禁对全量生效；
- `docs/architecture/frontend.md` 分层图更新。

## 实施任务

1. 查询层骨架 + 首页样板（home）走通"迁移→门禁绿"节拍；
2. Mobile 各页 → Desktop 公开页 → Desktop 后台页逐页迁移；
3. 豁免清零 + 文档更新 + Spec 证据回填。

## 测试/验收

- 每页迁移后：门禁绿（该页无越权 import）、`pnpm --dir src/frontend typecheck / lint / build / test:core` 绿；
- 行为回归：页面走查与迁移前一致（数据、错误态、筛选、加载态）；
- 查询层单测：参数映射与 fallback 语义。

## 阻塞

- BROWSE / ATOM-EXPANSION 归档（写集交接）；
- 后台页保存流若逢 CONTENT-TRUTH EDITOR 工作流在途，对应页面顺延。

## 交付记录
