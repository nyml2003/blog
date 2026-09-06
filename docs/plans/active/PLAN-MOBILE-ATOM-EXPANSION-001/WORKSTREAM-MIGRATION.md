---
kind: workstream
id: WORKSTREAM-MIGRATION
status: ready
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

删除写集（R5 审定后执行，同为本工作流独占）：

- `src/frontend/mobile/styles/components.css` / `shelf.css` / `filter.css`（及 R5 审定确认可下线的其他模块）

# 工作流：页面迁移与 legacy 下线（R2–R5）

## 目标

按 Spec 场景 003–005 将全部公开页面迁为原子 / 分子消费，逐轮截图对照交用户人工验收，最终下线 legacy 模块并完成三主题全页验收。

## 输入

- R1 产物：batch 2 原子与分子（含主题取值）；
- R0 截图基线（本计划目录归档）；
- 依赖：R4 开始前 `PLAN-MOBILE-BROWSE-IA-001` 的新货架 / 平铺形态已合入；`ui.tsx`（BottomNav）与主题计划写集串行。

## 输出

- R2 home：`ArticleRow` / `MobileNav` / `BottomNav` / `primary-action` 改为原子 / 分子消费（卡片布局语义留业务，内部元素原子化）；
- R3 detail：reading-bar / detail-header / detail-footer 迁移，`.article-body` 与其 CSS 不动；
- R4 货架 + 平铺：`ShelfSection` / `ShelfCard` / `ShelfIndex`（换 `TabGroup`）与平铺页（消费 `ChipGroup` 等）迁移；
- R5：下线模块与死样式清除、`shell.css` 去留审定记录、架构文档与 ATOM-CONTRACT 修订记录、三主题全页验收；
- 每轮：迁移前后截图对照（`375x812` / `360px`）、用户人工验收记录入交付记录。

## 实施任务

每轮固定节拍：迁移 → 四命令 + 既有功能回归 → 截图对照 → **用户人工验收** → 关轮。任何视觉能力缺口走报备流程，禁止降级视觉。

## 测试/验收

- 每轮 `pnpm --dir src/frontend typecheck / lint / build / test:core` 全绿；
- R4 功能回归：导航 / 级联 / 加载更多 / scrollspy / 详情阅读；
- R5：下线模块无残留 import（全库 grep）；三主题全页走查（含首绘无闪变）。

## 阻塞

- R4 前置：浏览计划完成；
- 每轮阻塞于用户人工视觉验收（未裁定不得关轮）。

## 交付记录
