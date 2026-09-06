---
kind: workstream
id: WORKSTREAM-MIGRATION
status: completed
plan_id: PLAN-MOBILE-ATOM-EXPANSION-001
role: frontend-mobile
owner: frontend-mobile
depends_on:
  - WORKSTREAM-ATOMS-BATCH2
write_set:
  - src/frontend/mobile/src/pages/home.tsx
  - src/frontend/mobile/src/pages/detail.tsx
  - src/frontend/mobile/src/pages/articles.tsx
  - src/frontend/mobile/src/pages/article-list.tsx
  - src/frontend/mobile/src/pages/settings.tsx
  - src/frontend/mobile/src/components/ui.tsx
  - src/frontend/mobile/src/components/browse.tsx
  - src/frontend/mobile/styles/components.css
  - src/frontend/mobile/styles/shelf.css
  - src/frontend/mobile/styles/filter.css
  - src/frontend/mobile/styles/detail.css
  - src/frontend/mobile/styles/pages.css
  - src/frontend/mobile/styles/shell.css
  - src/frontend/mobile/styles/layout.css
  - src/frontend/mobile/styles/tokens.css
  - src/frontend/mobile/styles/base.css
  - docs/plans/archive/PLAN-MOBILE-CSS-ARCHITECTURE-001/ATOM-CONTRACT.md
  - docs/architecture/
  - docs/plans/active/PLAN-MOBILE-ATOM-EXPANSION-001/
  - docs/specs/SPEC-MOBILE-ATOM-EXPANSION-001.md
last_reviewed: 2026-09-06
---

# 工作流：页面迁移与当前范围收口（R2–R3）

## 目标

按 Spec 当前范围将 home、detail、现有货架和设置页接入原子 / 分子消费，统一 MobileNav/BottomNav 与跨页主题首绘，并交用户人工验收。新平铺页和 legacy 模块下线不属于本工作流。

## 输入

- R1 产物：batch 2 原子与分子（含主题取值）；
- R0 契约与组件文档；
- 依赖：R1 完成；`ui.tsx`、主题和设置写集已串行复核。

## 输出

- R2 home：`ArticleRow` / `MobileNav` / `BottomNav` / `primary-action` 改为原子 / 分子消费（卡片布局语义留业务，内部元素原子化）；
- R3 detail：reading-bar / detail-header / detail-footer 迁移，`.article-body` 与其 CSS 不动；
- 当前收口：现有 F 型 Shelf 的 `TabGroup` / scrollspy、统一 `MobileNav` / `BottomNav`、设置页跨页主题与字体首绘；用户人工回归确认。

## 实施任务

当前范围固定节拍：迁移 → 直接质量命令 + 既有功能回归 → **用户人工验收** → 关轮。任何视觉能力缺口走报备流程，禁止降级视觉。

## 测试/验收

- 每轮直接 TypeScript、Oxlint、Vite build 和相关测试通过；包装命令的 WASM 版本阻塞记录在计划结果中；
- 当前范围功能回归：导航 / scrollspy / 详情阅读 / 设置跨页主题与字体首绘。

## 阻塞

- 用户已确认当前范围完成；新平铺页、加载更多和 legacy 下线另立后续 plan。

## 交付记录
