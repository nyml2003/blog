---
kind: workstream
id: WORKSTREAM-MIGRATION
status: ready
plan_id: PLAN-FRONTEND-PAGE-TEMPLATE-001
role: frontend
owner: frontend
depends_on:
  - WORKSTREAM-REGISTRY
  - PLAN-MOBILE-BROWSE-IA-001:mobile-write-set-handoff
  - PLAN-DESKTOP-EDITOR-001:archived
write_set:
  - src/frontend/mobile/pages/
  - src/frontend/mobile/src/pages/
  - src/frontend/desktop/pages/
  - src/frontend/desktop/src/pages/
  - src/frontend/desktop/src/app.tsx
  - docs/specs/SPEC-FRONTEND-PAGE-TEMPLATE-001.md
  - docs/plans/active/PLAN-FRONTEND-PAGE-TEMPLATE-001/
last_reviewed: 2026-09-07
---

删除写集（各批迁移完成后执行）：

- 全部手写 `pages/*/index.html`（由注册表生成替代；生成物落原路径或构建期虚拟化，由机制工作流的产物布局决定并记录）

# 工作流：页面迁移（R2–R3）

## 目标

全部页面切到注册表生成 + `definePage` + CSS 单入口，title 规范落地，手写 HTML 清零。

## 输入

- R1 机制与 settings 样板；
- 写集交接时点：mobile 页面待 BROWSE（及原子 R4-R5 如其在途）交接；desktop admin 页面待 EDITOR 归档与 CONTENT-TRUTH EDITOR 工作流协调。

## 输出

- R2 mobile 批：逐页 `definePage` 化 + CSS 单入口 + HTML 生成替换 + title 规范（含 articles / article-list / article-detail / home / admin-article-preview-content 等）；
- R3 desktop 批：公开端先行（home / articles / detail），admin 批（home / new / edit / editor-guide / article-types / terms 等）按交接时点；
- 每页迁移即删手写 HTML；批次完成后静态检查样板零残留；
- title 全库走查：无英文占位符，公开 / 管理两套命名落地。

## 实施任务

每页固定节拍：迁移 → 产物 alias / head 对照 → 功能冒烟 → 删手写 HTML。任何页面行为异常即停批报 PM。

## 测试/验收

- 每批：四命令全绿、产物路由对照、抽样 head / title 走查、首绘防闪屏回归（mobile）；
- 终检：`getElementById("app")` 与手写入口 HTML 零残留的静态检查通过；
- Spec 场景 002 / 003 / 005 证据回填。

## 阻塞

- 各端写集交接时点（见依赖）；
- desktop admin 批与 CONTENT-TRUTH EDITOR 工作流的 admin-home 改造时序协调（其将重做 admin-home，title / 模板以本计划机制为准，页面内容归其计划）。

## 交付记录
