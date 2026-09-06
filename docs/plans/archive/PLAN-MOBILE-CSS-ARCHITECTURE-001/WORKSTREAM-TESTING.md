---
kind: workstream
id: WORKSTREAM-MOBILE-CSS-TESTING
status: completed
plan_id: PLAN-MOBILE-CSS-ARCHITECTURE-001
role: frontend-mobile
owner: frontend-mobile
depends_on: [WORKSTREAM-MOBILE-CSS-MIGRATION]
write_set: [Mobile visual test and acceptance records]
last_reviewed: 2026-09-05
---

# 移动端 CSS 回归验收

## 覆盖范围

- 推荐页、文章库、Shelf、Filter Panel、详情页和文章 HTML；
- 窄屏、常见手机视口、安全区和无横向滚动；
- 焦点、滚动锁定、sticky、active 和加载/空/错状态；
- 长标题、无摘要、代码块、表格、图片和引用。

固定场景、五组视口、P0/P1/P2 判定、结构化证据字段和截图有效条件以
[`REGRESSION-BASELINE.md`](REGRESSION-BASELINE.md) 为唯一准则；CSS 模块顺序和回滚点以
[`MIGRATION-RUNBOOK.md`](MIGRATION-RUNBOOK.md) 为准。

## 验收

- 结构拆分不改变功能和关键几何；
- 能提供模块迁移前后的对比证据；
- `PLAN-MOBILE-DENSITY-002` 的详情页工作可以在迁移后独立开始。

本工作流在 CSS 迁移前不得把未采集的页面场景写成通过，也不得把原子独立单测替代真实页面
回归。原子页面接入需要在 CSS 迁移通过后另立 R6 验收记录。
