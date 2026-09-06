---
kind: workstream
id: WORKSTREAM-FRONTEND-BROWSE
status: completed
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

实现 [SPEC-MOBILE-BROWSE-IA-001](../../../../specs/SPEC-MOBILE-BROWSE-IA-001.md) 的前端部分：货架页快照化与新平铺页，原子优先。

## 输入

- Spec：`SPEC-MOBILE-BROWSE-IA-001`（分页契约已按决策 #7 更新为新接口）；
- 既有资产：原子 + 分子（`mobile-ui/atoms/`、`mobile-ui/molecules/`，含类型契约测试）——**tab / chips 缺口已由 `PLAN-MOBILE-ATOM-EXPANSION-001` 关闭**：`Tab`（`orientation: vertical` 即 L1 左侧形态）、`Chip`（单选）、`TabGroup` / `ChipGroup` 直接可用；`useDataResource`、`common/client`（`taxonomy.listTypes/listTerms`；列表项类型 `ArticleListItem`）；货架页现状（`articles.tsx` + `ui.tsx` 的 FilterPanel / ShelfSection / scrollspy）；
- 后端依赖：分区 total wire（`WORKSTREAM-BACKEND-SHELF`）完成后才可做货架页"查看全部"判定；新浏览接口 `public.article_browse` 由后端工作流交付，前端 client 方法与解码可先行按契约实现（联调在后端合流后）。

## 输出

- **平铺页**（新入口 `/m/articles/list.html`，vite alias + rollup input）：
  - `browse-filter.ts`：三级单选筛选模型（type/topic/tag）+ URL 解析与同步 + 旧日期参数清理 + 级联重置第 1 页，纯函数可单测；
  - `article-list.tsx` + `browse.tsx`：F 型布局（L1 左 `TabGroup` vertical tab、L2/L3 横向 `ChipGroup`）、平铺卡片流、"加载更多"（进度 / 重试 / 到底）；
  - `client.ts`：新增浏览方法（如 `browseArticles`：`{typeId?, topicId?, tagId?, page?}` → 新 sceneCode `public.article_browse`）；`listPublishedArticles` **不动**（决策 #7）；`domain.ts` 复用 / 扩展列表 schema 解码 `page/pageSize/total`；测试锚定；
- **货架页快照化**（依赖后端 wire）：移除 FilterPanel 及筛选状态，各区渲染前 6 + `total > 6` 时"查看全部"（Link 到平铺页带 `?type=`），scrollspy 保留；`filter.css` 中面板样式随之下线；
- **组件纪律**：L1/L2/L3 一律消费既有 `Tab` / `TabGroup` / `Chip` / `ChipGroup`；`Link/Text/Heading/Button/Label` 可覆盖处一律用原子。如再遇缺口，停下报 PM 转用户，不得擅自扩原子面。

## 实施任务

1. `browse-filter.ts` + 单测（URL / 级联 / 重置 / 日期参数清理）；
2. `client.ts` / `domain.ts` 新浏览方法与测试（可与 1 并行）；
3. 平铺页 UI + 加载更多 + 样式（`browse.css`）；
4. 货架页快照化（后端 wire 就绪后）；
5. Spec 前端场景证据回填。

## 测试/验收

- `browse-filter.test.ts`、client 测试、`pnpm --dir src/frontend typecheck / lint / build / test:core` 全绿；
- 人工：`375x812` 与 `360px` 下 Spec 场景 001–006 走查；首页 / 详情 / 设置回归。

## 阻塞

- 平铺页联调依赖 `WORKSTREAM-BACKEND-SHELF` 的 `public.article_browse`（client 方法可先按契约实现）；
- 货架页"查看全部"依赖分区 total wire。

## 交付记录

- 2026-09-06 PM：派发。tab/chips 缺口已关闭（前置计划交付），无需用户裁决；client 侧改为新浏览方法，`listPublishedArticles` 不再改动（决策 #7），写集移除 `mobile-ui/atoms/`（纯消费，不修改）。
- 2026-09-06 前端 R1（任务 1–3）交付：
  - 新增 `browse-filter.ts`（+9 测试）、`browse.tsx`（BrowseTypeRail / BrowseCascade / BrowseCard / BrowseList / BrowseMore）、`article-list.tsx`、`pages/article-list/index.html`、`browse.css`；修改 client.ts / domain.ts / client.test.ts（+2）/ vite.config.ts（`/m/articles/list.html` 路由 + `mobileArticleList` 入口，dist 产物与主题 bootstrap 已核）；
  - client：`browseArticles({typeId?, topicId?, tagId?, page?})` → `sceneCode=public.article_browse`；响应解码 items/page/pageSize/total（`hasMore` 已解码未消费，按"已载 ≥ total"判定到底 + 空页守卫）；
  - 四命令全绿（typecheck / lint / build / test:core 35/35）；
  - PM 处置：① `browse-filter.test.ts` 已由 PM 补进 `package.json` test:core 清单（该文件不在原写集，属测试组织事项）；② `static_files.rs` PAGES 缺行 → 已转后端工作流并入交付（写集冲突已核：DESKTOP 的 BACKEND-STATIC 已 completed）；③ 卡片用裸 `<a>` 与 `shortDate` 复制自 ui.tsx（本轮不可改所致）——任务 4 改造货架页时一并评估回收；④ 人工走查（375/360）与联调留待任务 4 合流后统一做。
- 2026-09-07 前端 R2（任务 4 + 联调收口）交付，工作流完成：
  - 货架快照化：FilterPanel / 筛选状态 / `.filter-trigger` 全删，shelf 调用无参（测试锚定 URL 无筛选参数）；类型分区头 `共 {total} 篇` + `total > 6` 时「查看全部→」（`type-<id>` 解析、推荐区恒不渲染）；scrollspy 保留；首帧旧日期参数清理（replaceState 仅在有 query 时）；`filter.css` 删除，home/detail/settings 三页同步去 import；
  - 卡片统一：`ui.tsx ArticleCard` 单一形态，样式唯一来源 `pages.css`（`.article-card*`），BrowseCard/`.browse-card*` 移除；眉标数据驱动（平铺页显示、货架外观不变）；
  - 联调证据（ops runtime integration，独立端口 + 临时库，造数 43 篇 Engineering 跨 6/20 双阈值 + 6 篇 Field Notes）：API 断言 13/13（分区 ≤6/推荐 3/total 口径/两页集成路由可达/分页 hasMore 边界/AND 逐级收窄 43→39→38/kind 错配 400）；浏览器断言 17/17（playwright 375x812：无筛选入口、scrollspy、URL 清理、查看全部跳转定位、加载更多到底 43、三级级联 + 后退恢复、L3 随主题出现/消失）；截图 `/tmp/blog-browse-evidence/{shelf,flat-page}-375.png`（PM 已目验，形态符合场景 001–004）；
  - 走查修复 2 个真实缺陷：① 加载更多页码计算错误（首次追加重复 page=1）→ `nextBrowsePage` 纯函数 + 单测；② `Text` 原子内容挂载期取值导致计数/进度不刷新 → keyed `<Show>` 重建（货架头部"共 51 篇"与"已载 n/total"均有浏览器证据）；
  - 四命令全绿（test:core 48/48）；
  - PM 处置（R2 遗留四项）：① `shelf.css` 孤儿块 `.shelf-card*` + `.shelf-summary`（PM 复核确认零引用）已由 PM 清理（~70 行，模块头注释同步改为"卡片在 pages.css"）；② 推荐区 `total` 语义 PM 裁定：保持全分区统一不变式"total = 截断前条数"，后端不改，前端已规避消费；③ 375px 下 L1 长类型名截断为既有原子行为、与货架现状一致——不阻塞，列入用户人工验收观察项；④ `target/test-dbs/` 临时库按 ops 语义保留。
