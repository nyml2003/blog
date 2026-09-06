---
kind: plan-result
id: RESULT-MOBILE-BROWSE-IA-001
plan_id: PLAN-MOBILE-BROWSE-IA-001
status: completed
completed: 2026-09-07
---

# 结果：C Mobile 文章浏览信息架构（货架快照 + F 型平铺页）

## 交付摘要

- **货架快照**（`/m/articles/index.html`）：推荐 3 + 各类型前 6（`SHELF_SECTION_LIMIT` / `SHELF_RECOMMENDATION_LIMIT` 命名常量），`ShelfSection.total` = 截断前全量计数，`total > 6` 的类型分区渲染"查看全部"；FilterPanel 与 `filter.css` 下线；scrollspy 保留；响应条数有界（FACT-PRODUCT-001 落实，实测 6 分区 20 卡 / 51 篇全量）。
- **新浏览接口** `public.article_browse`（用户决策 #7）：`type_id` / `topic_id` / `tag_id` 单选、维度间 AND（每维独立 `EXISTS` + `Term.kind` 校验）、分页默认 20 / 上限 100；`public.article_list` / `admin.article_list` 的 `term_ids` OR 语义零改动（测试锚定），Desktop 与管理端无感。
- **F 型平铺页**（`/m/articles/list.html`，新 MPA 入口）：L1 vertical `TabGroup` / L2 L3 `ChipGroup`（全部消费既有原子分子，未扩原子面）；URL 同步 `?type=&topic=&tag=` 可分享可后退；加载更多（进度 / 重试 / 到底）；旧日期参数忽略并清理。
- **卡片统一**：`ui.tsx ArticleCard` 单一形态，样式唯一来源 `pages.css`；`shelf.css` 死样式块清理。
- **验收支持**：Full 夹具扩至 48 篇（published 45：Engineering 28 / Field Notes 12 / Announcements 5），terms 6；mock 与 Data `test` 两侧编译期对齐（指纹断言防漂移）。

## 执行记录（时间线）

- 2026-09-06：立项派发。基线全绿；tab/chips 缺口经核实已由前置计划 `PLAN-MOBILE-ATOM-EXPANSION-001` 关闭（免报备）；多 term 未决项核实为 OR 且被 Desktop/管理端共用 → 用户裁决新增浏览接口（决策 #7）。
- 2026-09-06：后端（货架 wire + 浏览接口 + static PAGES + 测试）与前端 R1（browse-filter + client + 平铺页）并行交付。
- 2026-09-07：前端 R2（货架快照化 + 卡片统一）+ 联调（API 13/13、浏览器 17/17），走查修复 2 个真实缺陷（加载更多页码计算、`Text` 原子挂载期取值）。
- 2026-09-07：夹具扩量（验收支持），用户 dev 模式全场景走查通过，Spec → `accepted`。

## 验收证据

- Rust workspace `cargo test` 133 passed / 0 failed（PM 独立复跑 ×2 阶段：110 → 133）；fmt / clippy 零告警。
- 前端 `typecheck / lint / build / test:core` 四命令全绿（test:core 48/48，含 `browse-filter` 10 条、client browse/货架锚定）。
- 集成联调：ops runtime integration（独立端口 + 临时库）API 断言 13/13、浏览器断言 17/17（playwright 375×812，截图留档）；场景 007 有界断言自动化 + 实测。
- 用户人工验收：2026-09-07 通过（375/360 走查，含空态与到底；长类型名截断观察项接受）。

## PM 裁决与处置备忘

- 推荐区 `ShelfSection.total` 保持"截断前条数"统一语义，前端不消费（推荐区永不渲染"查看全部"）。
- kind 不匹配沿用既有 400 `INVALID_JSON` 路径，未新增错误码。
- 夹具扩充不新增 mock scenario（不动 ops 契约面）；dev 模式二进制解析序 `debug → release`（release 侧需 `ops delivery build` 重建后才含新数据）。
- 写集外纯增量文件（`protocol/lib.rs`、`scene.rs`、`data/store/mod.rs`、mock `domain/http`、`fixture.rs`、`static_files.rs`）均 PM 追认记档于 workstream。

## 后续（不属于本计划）

- Desktop T 型与 Desktop 分页（原计划即声明另立）；
- 管理页日期筛选（归属声明，未实现）；
- 平铺页 L1 长类型名完整展示（如需，另立视觉裁决）；
- `Text` 原子挂载期取值问题已用 keyed `<Show>` 规避于两处消费点——原子本身行为未改，如再遇同类症状可考虑原子层修复。
