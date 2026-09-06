---
kind: plan
id: PLAN-MOBILE-ATOM-EXPANSION-001
status: ready
owner: project-manager
created: 2026-09-06
last_reviewed: 2026-09-06
---

# C Mobile 原子扩量与全页迁移

## 目标

按 [SPEC-MOBILE-ATOM-EXPANSION-001](../../../specs/SPEC-MOBILE-ATOM-EXPANSION-001.md) 完成：batch 2 原子（`Tag` / `Tab` / `Chip` / `Text tone accent` / `Link variant cta`）与首批分子（`TabGroup` / `ChipGroup` / `StateMessage`）落地；全部移动端页面分轮迁移为组件库消费；legacy 样式模块下线；三主题全页生效。视觉不劣化由用户逐轮人工验收。

## 决策记录（用户已定）

1. 深度 = 全量目标（所有页面 + legacy 下线）+ 分轮执行，每轮独立验收可中断；
2. 分子层从"不建设"改为**证据准入**，首批 TabGroup / ChipGroup / StateMessage；FormField 证据不足继续缓建；
3. batch 2 清单经用户过目通过（Tag / Tab / Chip / Text accent / Link cta 待核；不新增 Spinner / 图标库 / Radio / Switch；ArticleBody 边界不动）；
4. **视觉红线**：组件表达不了视觉时报备扩组件，禁止降级视觉；每轮截图对照、用户人工裁定验收；
5. 终态验收：legacy 模块下线 + 三主题全页生效。

## 成功标准

1. 新原子 / 分子符合"类型即契约"全套模式（Props / defaults / 负样例 / 依赖边界）；
2. home、detail、货架页、平铺页全部迁移为原子 / 分子消费，设置页零回归；
3. 每轮迁移有截图对照与**用户人工验收记录**；
4. 下线目标 CSS 模块无残留；三主题全页生效、无闪变；
5. `pnpm --dir src/frontend typecheck / lint / build / test:core` 全绿，九原子契约测试不回归。

## 非目标

- 见 Spec 非目标节（不做 Spinner / 图标库 / Radio / Switch、不动 ArticleBody 与后端、不做 Desktop、FormField 缓建、不重做信息架构）。

## 约束与依据

- Spec：`SPEC-MOBILE-ATOM-EXPANSION-001`（本计划交付并验收）；
- 归档契约：`PLAN-MOBILE-CSS-ARCHITECTURE-001/ATOM-CONTRACT.md` 与 `COMPONENT-LIBRARY.md`——接入门槛、类型即契约、CSS 所有权规则；本计划按其"原子 → 分子 → 业务组件 → 页面"顺序与"不得一次重写验证两件事"纪律执行，交付时补修订记录；
- inventory 证据（2026-09-06 本计划立项时逐页核得）：`Tag` 三处（`ArticleRow` / `ShelfCard` / detail 头）、`Tab` 现存 `shelf-index` + 浏览计划 F 型 L1、`Chip` 为 F 型 L2/L3 已决策形态、`Text accent` 三处 `.eyebrow`、`Link cta` 一处 `primary-action` 待核、`StateMessage` 四处在用；
- 依赖计划：`PLAN-MOBILE-THEME-SETTINGS-001`（`themes.css` 写集串行）、`PLAN-MOBILE-BROWSE-IA-001`（R4 前置；其平铺页 UI 消费本计划 R1 产物）。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 原子与分子实现（R0–R1） | frontend-mobile | - | 见 [WORKSTREAM-ATOMS-BATCH2.md](./WORKSTREAM-ATOMS-BATCH2.md) | ready |
| 页面迁移与下线（R2–R5） | frontend-mobile | R1 完成；R4 另需浏览计划完成 | 见 [WORKSTREAM-MIGRATION.md](./WORKSTREAM-MIGRATION.md) | ready |

项目经理启动提示见同目录的 [PM-PROMPT.md](./PM-PROMPT.md)。

## 轮次与验收

| 轮 | 内容 | 验收 |
| --- | --- | --- |
| R0 | 契约冻结（batch 2 原子契约修订）、`COMPONENT-LIBRARY` 更新、**全页截图基线采集**（`375x812` / `360px`） | 契约经用户审定；基线归档 |
| R1 | 原子 + 分子实现 + 类型契约测试 + `themes.css` 补 dark / sepia 取值（与主题计划串行） | 自动化全绿；分子键盘走查 |
| R2 | home 迁移（ArticleRow / MobileNav / BottomNav / primary-action） | 截图对照 + **用户人工验收** |
| R3 | detail 迁移（reading-bar / detail-header / footer；`.article-body` 不动） | 同上 |
| R4 | 货架页 + 平铺页迁移（依赖浏览计划新形态落地） | 同上 + 级联 / 加载更多回归 |
| R5 | legacy 模块下线、`shell.css` 去留审定、三主题全页验收、文档（架构 / 契约修订记录） | 无残留 import；**三主题全页走查 + 用户验收** |

## 集成验收

- 自动化：类型契约 / defaults / 分子键盘与受控测试、依赖边界检查、四命令全绿；
- 人工：每轮截图对照的用户裁定记录（R2–R5 逐轮）、R4 全页功能走查、R5 三主题全页走查；
- Spec 状态推进 `accepted`，证据回填。

## 未决项

- `Link variant: "cta"` 是否成立：R0 核对 `primary-action` 现状视觉后定，不成立则留业务样式并记录；
- `SectionHeader` 分子：2 处近似结构，先留业务观察，出现第 3 处再准入；
- `shell.css` 终态去留：R5 审定。
