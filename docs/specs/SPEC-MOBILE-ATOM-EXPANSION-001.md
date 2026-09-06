---
kind: spec
id: SPEC-MOBILE-ATOM-EXPANSION-001
status: draft
owner: frontend-mobile
plan_id: PLAN-MOBILE-ATOM-EXPANSION-001
last_reviewed: 2026-09-06
---

# C Mobile 原子扩量与全页迁移（batch 2 + 分子层 + legacy 下线）

## 目标

第二批原子（Tag / Tab / Chip / Text accent / Link cta）与首批分子（TabGroup / ChipGroup / StateMessage）按既有契约模式落地；全部移动端页面分轮迁移为原子/分子消费；迁移完成后公开页面 legacy 样式模块下线、三主题全页生效。视觉不劣化由用户逐轮人工验收。

## 非目标

- 不新增 Spinner、图标库、Radio、Switch（无消费方或现状视觉保留）；
- 不动 `ArticleBody` / `.article-body`（契约钦定的独立系统主题边界）；
- 不改后端、不改既有九原子 Props API、不做 Desktop；
- FormField 分子继续缓建（证据不足），出现 ≥2 页用例再准入；
- 不在本计划内重做页面信息架构（货架快照 / F 型平铺属 `PLAN-MOBILE-BROWSE-IA-001`）。

## 契约

### batch 2 原子（沿用"类型即契约"模式：完整必填 Props + `Partial` options + defaults 锚定 + 负样例类型测试）

| 原子 | 语义与视觉 | 关键约束 |
| --- | --- | --- |
| `Tag` | 展示标签：pill、accent 色、定长截断省略 | 纯展示不可交互；不承载业务数据，内容由调用方传入已格式化文本 |
| `Tab` | 受控单选项：竖 / 横两向、active 指示条与位移动效（沿用 `shelf-index-tab` 现成视觉） | `selected` 受控；方向 variant；不自行管理选中状态 |
| `Chip` | 单选胶囊：横滚条内 pill、选中态填充 | `selected` 受控；"全部"语义属调用方 |
| `Text` 扩 `tone: "accent"` | eyebrow 小字（accent 色、字距、小字号） | 只扩枚举，Props 形状不变 |
| `Link` 扩 `variant: "cta"` | home 主行动链接视觉（`primary-action`） | 实现前核对现状视觉，表达不了则不扩、留业务样式并记录 |

### 分子（证据准入，首批三个）

| 分子 | 构成 | 职责边界 |
| --- | --- | --- |
| `TabGroup` | Tab 容器 + roving 键盘导航 + `aria` | 单选受控、键盘循环；scrollspy / 路由联动留业务 |
| `ChipGroup` | Chip 横滚容器 + 单选逻辑 | 受控单值；筛选重置 / URL 同步留业务 |
| `StateMessage` | 图标槽 + Text + 可选重试 Button，`loading/empty/error` 三 kind | `ui.tsx` 同名业务组件升格，视觉逐项对照现状 |

分子不读取数据、不持有业务状态机；只组合原子与稳定局部结构。

### 迁移与下线

- 接入顺序沿用契约：原子 → 分子 → 业务组件 → 页面；每页一轮、独立验收，不得一次重写验证两件事；
- 迁移轮次覆盖：home（R2）→ detail（R3）→ 货架页 + 平铺页（R4，依赖 `PLAN-MOBILE-BROWSE-IA-001` 的新形态）→ legacy 下线 + 主题全页验收（R5）。设置页已原子化，仅回归；
- 视觉红线：**页面视觉需要组件表达不了的能力时，报备扩原子/分子，禁止降级视觉迁就组件库**；每轮以迁移前后截图对照为验收材料，**由用户人工裁定"等价或更好"**，PM 与 agent 不得自行判定视觉通过；
- legacy 模块（`components.css` / `shelf.css` / `filter.css` / `detail.css` / `pages.css` 及可收敛部分）随最终消费方迁移完成而下线，无残留 import；`tokens.css` / `base.css` / `article-body.css` 保留；`shell.css` 去留由 R5 审定并记录；
- 主题联动：新原子/分子纳入 `themes.css` 主题作用域（dark / sepia 值补齐）；R5 验收时三主题在全部页面生效且无闪变回归。

## 场景

### SPEC-MOBILE-ATOM-EXPANSION-001-001

Given batch 2 原子与三个分子

Then 各自有完整 Props 类型、defaults 锚定、`@ts-expect-error` 负样例与 defaults 合并测试；`mobile-ui` 依赖边界检查不含业务 / 数据 / 路由导入

### SPEC-MOBILE-ATOM-EXPANSION-001-002

Given `TabGroup` / `ChipGroup`

Then 键盘可达（方向键循环、焦点可见）、受控单选正确、`aria` 语义完整；`StateMessage` 三 kind 视觉与 `ui.tsx` 现状逐项对照无劣化

### SPEC-MOBILE-ATOM-EXPANSION-001-003

Given 任一迁移轮次完成

Then 该页迁移前后截图对照提交用户，**用户人工验收通过**后才可关闭该轮；未通过则按缺口报备流程处理

### SPEC-MOBILE-ATOM-EXPANSION-001-004

Given R4 完成（全部公开页面原子化）

Then `375x812` 与 `360px` 下各页与迁移前功能等价：导航、筛选级联、加载更多、详情阅读、scrollspy 行为不回归

### SPEC-MOBILE-ATOM-EXPANSION-001-005

Given R5 完成

Then 下线目标 CSS 模块无残留 import 与死样式；三主题在 home / 货架 / 平铺 / 详情 / 设置全页生效，切换与首绘无闪变，legacy 主题残留为零

### SPEC-MOBILE-ATOM-EXPANSION-001-006

Given 本计划全部改动

Then `pnpm --dir src/frontend typecheck / lint / build / test:core` 全绿，既有原子类型契约测试不回归

## 边界与失败

- 能力缺口（含视觉表达缺口）：停下报备用户裁决——补原子 / 扩 variant / 局部自建三选一，附代价估计；
- 浏览计划未完成前 R4 不得启动；其平铺页 UI 应消费本计划 R1 产出的 `Tab` / `Chip` / `TabGroup` / `ChipGroup`，避免二次迁移；
- 主题计划（`themes.css` 归属）在途时，本计划对 `themes.css` 的新原子取值须与其 PM 串行协调；
- 截图基线在 R0 采集（现状即基线），中途视觉有意变更须用户另行批准，不混入迁移轮。

## 测试/验收证据

- 自动化测试：待补充（新原子类型契约与 defaults 测试、分子键盘 / 受控测试、依赖边界检查）；
- 人工验收：待补充（每轮截图对照与用户裁定记录、R4 全页功能走查、R5 三主题全页走查）。
