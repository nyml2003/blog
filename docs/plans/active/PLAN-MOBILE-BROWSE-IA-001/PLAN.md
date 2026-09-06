---
kind: plan
id: PLAN-MOBILE-BROWSE-IA-001
status: ready
owner: project-manager
created: 2026-09-06
last_reviewed: 2026-09-06
---

# C Mobile 文章浏览信息架构：货架快照 + F 型平铺页

## 目标

按 [SPEC-MOBILE-BROWSE-IA-001](../../../specs/SPEC-MOBILE-BROWSE-IA-001.md) 重构 Mobile 文章浏览：货架页回归纯发现快照（推荐 3 + 各类型前 6 + 查看全部，服务端分区截断、响应有界），新增 F 型三级级联平铺页（类型 tab / 主题 / 标签，单选 AND + 加载更多），公开端移除日期筛选与旧 FilterPanel。复用既有列表端点，不改 term 数据模型。

## 决策记录（用户已定）

1. 分页先做移动端，Desktop T 型另立后续计划；
2. 货架分页形态 = 楼层快照 + 新平铺页（业界标准）；
3. 平铺页 = F 型三级：L1 左侧 tab = 类型，L2 横向 = 主题 topic，L3 横向 = 标签 tag（选了主题后出现），独立维度 AND 级联，全部单选；
4. 日期筛选（创建/更新起止）从公开端移除，归属管理页（管理页改造不在本计划）；
5. 组件体系 = 原子优先，能力缺口（tab / 横向 chips 等）报备用户裁决，不擅自扩原子面；
6. 细节默认：每区 N = 6、推荐 3、pageSize = 20、加载更多为显式按钮、页码不进 URL。

## 成功标准

1. 货架页纯快照：无筛选入口，推荐 3 + 各类型前 6，`total > 6` 的分区有"查看全部"，scrollspy 保留；BFF 响应条数有界；
2. 平铺页 F 型三级级联可用：单选 AND 过滤、选择重置第 1 页、URL 同步（`?type=&topic=&tag=`）、L3 仅在 L2 选具体主题后出现；
3. 加载更多按钮追加分页（pageSize 20）、展示进度、失败可重试、到底消失；
4. 公开端无日期筛选；旧 FilterPanel 与其样式下线；旧日期 URL 参数被忽略并清理；
5. 首页 / 详情 / 设置页零回归；
6. 后端 shelf 截断与分区 total 有 product / mock 测试；`pnpm --dir src/frontend typecheck / lint / build / test:core` 与 Rust 测试全绿。

## 非目标

- Desktop T 型与 Desktop 分页（后续计划）；term 层级模型；主题/标签多选；
- 管理页筛选（日期归属声明，不在本计划实现）；
- 无限滚动 / 自动加载；首页推荐、详情、设置页改动。

## 约束与依据

- Spec：`SPEC-MOBILE-BROWSE-IA-001`（本计划交付并验收）；
- 事实：`FACT-PRODUCT-001`（单机 2C2G，响应体积必须有界——现状货架全量下发是本计划的直接动因）；
- 架构事实：货架 BFF 现状无分页参数、数据层全量捞取、`to_shelf` 分区不截断；列表端点 `public.article_list` 已支持 `page/pageSize`（默认 20 / 上限 100）与 type/terms 筛选；`listPublishedArticles` 客户端方法尚不透出 page/pageSize；
- 前置计划：`PLAN-CLIENT-ARTICLE-LIST-001`（列表 wire 契约拆分，本计划在其类型基础上消费）；
- 组件纪律：沿用 `PLAN-MOBILE-THEME-SETTINGS-001` 确立的"九原子 + 缺口报备"规矩。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 后端货架快照 | backend | - | 见 [WORKSTREAM-BACKEND-SHELF.md](./WORKSTREAM-BACKEND-SHELF.md) | ready |
| 前端浏览重构 | frontend-mobile | 后端货架快照（货架页改造部分）；平铺页可先行 | 见 [WORKSTREAM-FRONTEND-BROWSE.md](./WORKSTREAM-FRONTEND-BROWSE.md) | ready |

项目经理启动提示见同目录的 [PM-PROMPT.md](./PM-PROMPT.md)。

## 集成验收

- 自动化：后端 shelf 截断 / 分区 total 测试；前端级联与 URL、加载更多测试；
- 人工：`375x812` 与 `360px` 下 Spec 全场景走查；首页 / 详情 / 设置回归；货架响应条数抽查（有界断言）；
- 质量基线：前端四命令 + Rust 测试全绿；
- Spec 状态推进 `accepted`，证据回填。

## 未决项

- 多 term（topic AND tag）的现有 SQL 组合语义待实现前核实（AND 还是 OR）；若为 OR 需最小改动对齐 AND——若该改动超出"最小"，回用户确认。
