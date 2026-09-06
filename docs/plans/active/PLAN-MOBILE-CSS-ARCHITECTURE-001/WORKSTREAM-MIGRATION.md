---
kind: workstream
id: WORKSTREAM-MOBILE-CSS-MIGRATION
status: ready
plan_id: PLAN-MOBILE-CSS-ARCHITECTURE-001
role: frontend-mobile
owner: frontend-mobile
depends_on: [WORKSTREAM-MOBILE-CSS-AUDIT]
write_set: [web/mobile/styles.css, web/mobile/**/*.css, web/mobile/src/**/*.tsx]
last_reviewed: 2026-09-05
---

# CSS 与 Class 迁移

## 目标

按审计确认的职责边界迁移 CSS 和必要 class，不改变页面功能或未确认的视觉设计。

本工作流的可执行步骤、模块 write set、R0-R6 回滚门与禁止项已冻结在
[`MIGRATION-RUNBOOK.md`](MIGRATION-RUNBOOK.md)。本文件只定义工作流授权边界；Runbook
不是实施授权，状态为 `ready` 时不得开始改动消费者。

## 约束

- 每次迁移保持构建和视觉可验证；
- class 只在职责变得更清晰时改名或新增；
- 不通过 `!important` 或页面父选择器解决迁移冲突；
- 不引入 CSS-in-JS、inline style 或运行时 CSS 字符串；
- 不使用 DOM `data-*` 属性传递业务数据、状态或样式参数；
- 组件逻辑只切换 class/语义属性，动态值优先回到预定义 token 或 class 组合；
- 保留受控文章 HTML 的语义选择器，不要求文章作者添加 class。

## 验收

- 模块 import 顺序和依赖方向明确；
- class 不再承担多个无关场景；
- 详情页和文章 body CSS 独立可定位；
- 不出现样式丢失、可访问性或交互回归。

开始前必须通过 [`REGRESSION-BASELINE.md`](REGRESSION-BASELINE.md) 的 CSS 迁移开工 gate。
完成后才能把本工作流标记为 `completed`；原子消费仍属于 Runbook R6 的独立后续工作，不得
在本工作流内提前实施。
