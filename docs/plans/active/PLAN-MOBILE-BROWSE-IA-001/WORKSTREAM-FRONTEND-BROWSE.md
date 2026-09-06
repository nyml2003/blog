---
kind: workstream
id: WORKSTREAM-FRONTEND-BROWSE
status: ready
plan_id: PLAN-MOBILE-BROWSE-IA-001
role: frontend-mobile
owner: frontend-mobile
depends_on:
  - WORKSTREAM-BACKEND-SHELF
write_set:
  - src/frontend/mobile/pages/article-list/index.html
  - src/frontend/mobile/src/pages/article-list.tsx
  - src/frontend/mobile/src/pages/articles.tsx
  - src/frontend/mobile/src/components/ui.tsx
  - src/frontend/mobile/src/components/browse.tsx
  - src/frontend/mobile/src/logic/browse-filter.ts
  - src/frontend/mobile/src/logic/browse-filter.test.ts
  - src/frontend/mobile/styles/filter.css
  - src/frontend/mobile/styles/pages.css
  - src/frontend/mobile/styles/browse.css
  - src/frontend/mobile-ui/atoms/
  - src/frontend/common/client/client.ts
  - src/frontend/common/client/domain.ts
  - src/frontend/common/client/client.test.ts
  - src/frontend/vite.config.ts
  - docs/specs/SPEC-MOBILE-BROWSE-IA-001.md
  - docs/plans/active/PLAN-MOBILE-BROWSE-IA-001/
last_reviewed: 2026-09-06
---

# 工作流：前端浏览重构（货架快照 + F 型平铺页）

## 目标

实现 [SPEC-MOBILE-BROWSE-IA-001](../../../../specs/SPEC-MOBILE-BROWSE-IA-001.md) 的前端部分：货架页快照化与新平铺页，原子优先、缺口报备。

## 输入

- Spec：`SPEC-MOBILE-BROWSE-IA-001`；
- 既有资产：九原子（`mobile-ui/atoms/`，含类型契约测试）、`useDataResource`、`common/client`（`listPublishedArticles`、`taxonomy.listTypes/listTerms`；列表项类型 `ArticleListItem`）、货架页现状（`articles.tsx` + `ui.tsx` 的 FilterPanel / ShelfSection / scrollspy）；
- 后端依赖：分区 total wire（`WORKSTREAM-BACKEND-SHELF`）完成后才可做货架页"查看全部"判定；平铺页不依赖后端改动，可先行。

## 输出

- **平铺页**（新入口 `/m/articles/list.html`，vite alias + rollup input）：
  - `browse-filter.ts`：三级单选筛选模型（type/topic/tag）+ URL 解析与同步 + 旧日期参数清理 + 级联重置第 1 页，纯函数可单测；
  - `article-list.tsx` + `browse.tsx`：F 型布局（L1 左 tab、L2/L3 横向条）、平铺卡片流、"加载更多"（进度 / 重试 / 到底）；
  - `client.ts`：`listPublishedArticles` 透出 `page` / `pageSize`（默认不传 = 后端 20）；`domain.ts` 列表 schema 解码 `page/pageSize/total`；测试锚定；
- **货架页快照化**（依赖后端 wire）：移除 FilterPanel 及筛选状态，各区渲染前 6 + `total > 6` 时"查看全部"（Link 到平铺页带 `?type=`），scrollspy 保留；`filter.css` 中面板样式随之下线；
- **组件纪律**：优先消费九原子；`Link/Text/Heading/Button/Label/Select` 可覆盖处一律用原子；tab / 横向 chips 为已预见缺口——**实现前先向用户报备**（补原子 or 局部自建），裁决前不得开工对应 UI；
- 原子如需新增（经用户裁决），按 ATOM-CONTRACT 现行模式（完整必填 Props + `Partial` options + defaults 锚定 + 负样例类型测试）实现并更新契约修订记录。

## 实施任务

1. `browse-filter.ts` + 单测（URL / 级联 / 重置 / 日期参数清理）；
2. `client.ts` / `domain.ts` 分页参数透出与测试（可与 1 并行）;
3. 报备 tab / chips 缺口，等用户裁决；
4. 平铺页 UI + 加载更多 + 样式（`browse.css`）；
5. 货架页快照化（后端 wire 就绪后）；
6. Spec 前端场景证据回填。

## 测试/验收

- `browse-filter.test.ts`、client 测试、`pnpm --dir src/frontend typecheck / lint / build / test:core` 全绿；
- 人工：`375x812` 与 `360px` 下 Spec 场景 001–006 走查；首页 / 详情 / 设置回归。

## 阻塞

- tab / 横向 chips 原子缺口待用户裁决（任务 3 前置任务 4 的 UI 部分）；
- 货架页"查看全部"依赖 `WORKSTREAM-BACKEND-SHELF` 的分区 total。

## 交付记录
