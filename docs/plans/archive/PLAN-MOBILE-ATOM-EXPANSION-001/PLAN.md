---
kind: plan
id: PLAN-MOBILE-ATOM-EXPANSION-001
status: completed
owner: project-manager
created: 2026-09-06
last_reviewed: 2026-09-06
completed: 2026-09-06
---

# C Mobile 原子扩量与当前页面迁移

## 目标

按 [SPEC-MOBILE-ATOM-EXPANSION-001](../../../specs/SPEC-MOBILE-ATOM-EXPANSION-001.md) 完成当前范围：batch 2 原子（`Tag` / `Tab` / `Chip` / `Text tone accent` / `Link variant cta`）与首批分子（`TabGroup` / `ChipGroup` / `StateMessage`）落地；Mobile home、detail、现有货架和设置页接入组件库；统一顶部/底部导航与跨页主题首绘。视觉不劣化由用户人工验收。

## 决策记录（用户已定）

1. 深度 = 当前页面接入与组件契约落地；新浏览信息架构和 legacy 清理另立后续计划；
2. 分子层从"不建设"改为**证据准入**，首批 TabGroup / ChipGroup / StateMessage；FormField 证据不足继续缓建；
3. batch 2 清单经用户过目通过（Tag / Tab / Chip / Text accent / Link cta 待核；不新增 Spinner / 图标库 / Radio / Switch；ArticleBody 边界不动）；
4. **视觉红线**：组件表达不了视觉时报备扩组件，禁止降级视觉；每轮截图对照、用户人工裁定验收；
5. 终态验收：当前范围页面的三主题和跨页首绘生效；legacy 模块保留给后续计划审定。

## 成功标准

1. 新原子 / 分子符合"类型即契约"全套模式（Props / defaults / 负样例 / 依赖边界）；
2. home、detail、现有货架和设置页迁移为原子 / 分子消费，F 型货架 scrollspy 不回归；
3. 当前范围有自动化证据与**用户人工验收记录**；
4. 当前范围三主题生效、设置首绘跨页面无闪变；
5. 直接 TypeScript、Oxlint、Vite build、核心 TypeScript tests 和九原子契约测试通过；包装命令的既有 WASM 版本阻塞有记录。

## 非目标

- 见 Spec 非目标节（不做 Spinner / 图标库 / Radio / Switch、不动 ArticleBody 与后端、不做 Desktop、FormField 缓建、不重做信息架构）。

## 约束与依据

- Spec：`SPEC-MOBILE-ATOM-EXPANSION-001`（本计划交付并验收）；
- 归档契约：`PLAN-MOBILE-CSS-ARCHITECTURE-001/ATOM-CONTRACT.md` 与 `COMPONENT-LIBRARY.md`——接入门槛、类型即契约、CSS 所有权规则；本计划按其"原子 → 分子 → 业务组件 → 页面"顺序与"不得一次重写验证两件事"纪律执行，交付时补修订记录；
- inventory 证据（2026-09-06 本计划立项时逐页核得）：`Tag` 三处（`ArticleRow` / `ShelfCard` / detail 头）、`Tab` 现存 `shelf-index` + 浏览计划 F 型 L1、`Chip` 为 F 型 L2/L3 已决策形态、`Text accent` 三处 `.eyebrow`、`Link cta` 一处 `primary-action` 待核、`StateMessage` 四处在用；
- 依赖计划：`PLAN-MOBILE-THEME-SETTINGS-001` 的设置契约已归档；新浏览信息架构不属于本次范围，后续另立计划。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 原子与分子实现（R0–R1） | frontend-mobile | - | 见 [WORKSTREAM-ATOMS-BATCH2.md](./WORKSTREAM-ATOMS-BATCH2.md) | completed |
| 页面迁移与当前范围收口（R2–R3） | frontend-mobile | R1 完成 | 见 [WORKSTREAM-MIGRATION.md](./WORKSTREAM-MIGRATION.md) | completed |

项目经理启动提示见同目录的 [PM-PROMPT.md](./PM-PROMPT.md)。

## 轮次与验收

| 轮 | 内容 | 验收 |
| --- | --- | --- |
| R0 | 契约冻结（batch 2 原子契约修订）、`COMPONENT-LIBRARY` 更新 | 契约经用户审定；视觉基线缺口由人工回归记录 |
| R1 | 原子 + 分子实现 + 类型契约测试 + `themes.css` 补 dark / sepia 取值（与主题计划串行） | 自动化全绿；分子键盘走查 |
| R2 | home 迁移（ArticleRow / MobileNav / BottomNav / primary-action） | 截图对照 + **用户人工验收** |
| R3 | detail 迁移（reading-bar / detail-header / footer；`.article-body` 不动） | 同上 |
| 当前范围收口 | 现有货架 scrollspy、统一 MobileNav/BottomNav、设置跨页主题与字体 | 用户人工回归确认 |

## 集成验收

- 自动化：类型契约 / defaults / 分子键盘与受控测试、依赖边界检查、四命令全绿；
- 人工：当前范围页面、F 型货架 scrollspy、统一导航和三主题跨页回归由用户确认；
- Spec 状态推进 `accepted`，证据回填。

## 未决项

- 新 F 型三级平铺、加载更多和 legacy CSS 下线：另立后续 plan。

## 当前交付记录

- 2026-09-06：完成 batch 2 原子、三个首批分子、roving 索引测试、独立组件样式和 dark/sepia 变量继承；公开 home/detail/Shelf 业务组件已接入。
- 2026-09-06：F 型 Shelf 的 `IntersectionObserver`、`programmaticSectionId` 锁定和 `scrollIntoView` 保留；active 竖线已迁移到 vertical `Tab` 原子，`.article-body` 未改动。
- 2026-09-06：用户反馈设置页与其他 Mobile 页面 BottomNav 不一致且设置不跨页生效；已统一 home / 货架 / 设置使用 `mobile-ui` BottomNav，共享导航项和标记，并将设置首绘 bootstrap 注入全部 Mobile HTML 入口。
- 2026-09-06：继续按用户反馈统一顶部壳层；设置页改用与 home / 货架相同的 `MobileNav + mobile-shell + mobile-main`，保留 `Field + Select` 设置控件；dark / sepia 补齐底部导航背景变量。
- 2026-09-06：用户确认当前实现完成；按用户决定移除 R4/R5，后续新需求另立计划。本计划范围收口并准备归档。
- 自动化：直接 `tsc --noEmit`、完整 Oxlint、Vite build、核心 TypeScript tests（34 passed）和 roving navigation test 通过；计划入口的 WASM 生成受 wasm-bindgen 0.2.121/0.2.126 不匹配阻断，format check 仍有在途设置文件差异。
- 证据限制：当前环境无 Chromium/Playwright，未生成自动截图；用户已完成人工页面验收。完整 `pnpm typecheck/test:core` 入口仍受既有 wasm-bindgen 版本不匹配影响，直接 TypeScript、Oxlint、Vite build 和相关测试通过。
