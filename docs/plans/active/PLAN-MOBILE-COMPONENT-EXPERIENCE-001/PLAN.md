---
kind: plan
id: PLAN-MOBILE-COMPONENT-EXPERIENCE-001
status: ready
owner: project-manager
created: 2026-10-01
last_reviewed: 2026-10-01
---

# Mobile 组件与交互体验专项

## 目标

处理移动端组件级的交互体验问题。产品已点名入口：`mobile-nav` 不吸顶。两类输入：

1. **吸顶问题（先行）**：`.mobile-header` 其实已声明 `position: sticky; top: 0`（`styles/shell.css:16-19`），整套吸顶偏移体系（`--shell-header-sticky-top: 84px`）也存在——这是"声明与感知不符"的疑似缺陷，不是缺功能。先在真实浏览器复现归因，再修复验收；产品已点名，归因明确后可不排队等闸门。
2. **组件交互体验盘点**：对现有移动端组件（header、bottom-nav、article-card、article-body、page-header、state-message、tab-group、field）做一轮交互体验盘点，吸收一期/二期两次移出的审计清单中组件相关项，闸门确认本轮修复项后实施。

视觉与交互变化在本计划是目标本身（区别于其他重构计划），但每项变化必须有浏览器/真机证据，不以"构建通过"或"看起来正常"代替验收。

## 当前基线（2026-10-01 现场核实）

- **吸顶疑点**：sticky 声明齐全（含 z-index、safe-area padding）；两个已知"吸顶杀手"嫌疑在场——`.mobile-shell` 的 `overflow-x: clip`（`shell.css:45`，Chromium/WebKit 存在 clip 破坏后代 sticky 的已知兼容问题）、`.mobile-preview-page` 的 `overflow-x: hidden`（`shell.css:54`，管理预览场景下内部 sticky 必然失效）。根因待复现确认，不预设结论。
- **既有 UI 基线要求**（一期记录，仍有效）：触控目标至少 44px、不依赖 hover、safe-area、支持 reduced motion、详情页不显示底栏、正文不造成页面级横向滚动。
- **历史输入**：一期 9 项审计清单与二期移交的"其他体验审计"中组件相关项（触控目标、读屏状态、长分类名、横向滚动、状态反馈一致性等）。
- **组件清单**：`components/`（mobile-nav、article-card、article-body）+ `ui/molecules/`（bottom-nav、field、page-header、state-message、tab-group）。
- **验收能力现状**：E2E 覆盖旅程断言，无视觉/交互基线；无真机截图留档惯例。
- **不可回归**：二期性能数字（切换传输 ≈15.6KB→目标、缓存命中、冷加载）；样式改动不应引入额外资源请求。

## 决策闸门

盘点完成后与产品共同确认（吸顶修复除外，见上）：

- 本轮组件修复项（建议不超过 3 个）及各自的验收证据；
- 验收设备与浏览器范围（至少 iOS Safari 或 Android Chrome 之一真机，加 375/390/430 模拟）；
- 历史产品题不默认纳入：详情页底栏规则、横屏支持、F 型分类结构调整——如需变更单独决策；
- 是否为关键组件建立截图/交互基线（沿用或扩展 `ops e2e`）。

## 成功标准

1. 吸顶问题根因明确（哪个场景、哪条 CSS、哪个浏览器）并修复，有复现步骤与修复后真机/浏览器证据。
2. 组件盘点完成并四类分拣（事实缺陷 / 体验风险 / 需产品决策 / 暂不处理），留档本目录。
3. 闸门确认项全部有修复前后对照证据（截图或交互记录）；触控、safe-area、reduced motion 基线不破。
4. `ops e2e --mode integration` 通过；`ops perf mobile` 关键数字不回归。
5. 改动范围内 typecheck、lint、相关测试、build 通过。

## 非目标

- 不新增搜索、分享、收藏等产品能力。
- 不做信息架构调整（底栏项数、F 型分类结构），除非闸门单独决策。
- 不做全站视觉改版；单个组件的视觉修正须前后对照记录。
- 不动 Desktop 端任何 UI。

## 约束与依据

- **写集协调**：与 `PLAN-FRONTEND-BOUNDARY-NORMALIZATION-001`（active）在 mobile `pages/` 文件可能重叠——本计划写 `components/`、`ui/`、`styles/`，对方写 `api/`、`logic/`，页面文件两边都可能触碰；两计划实施前相互核对最新状态，页面文件串行修改。
- Desktop 与 Mobile UI 隔离不变；组件不访问 API、存储或路由实现。
- 历史稳定约束沿用：正文 HTML 由系统主题包裹，不引入文章自定义 CSS。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 吸顶问题复现归因 | frontend | - | 本目录归因记录（复现步骤、浏览器矩阵） | ready |
| 吸顶修复 | frontend | 归因明确 | `styles/shell.css` 等涉事样式、必要时的组件结构 | blocked by 归因 |
| 组件交互体验盘点 | qa+frontend | -（与吸顶归因并行） | 本目录盘点记录 | ready |
| 决策闸门 | 产品+pm | 盘点 | 本 PLAN.md 范围确认 | blocked |
| 组件修复实现 | frontend | 闸门 | 闸门确认的组件、样式与测试 | blocked by 闸门 |
| 真机验收与收尾 | qa+pm | 实现完成 | 验收证据、RESULT.md | pending |

## 集成验收

1. 吸顶：滚动旅程（首页/文章库/详情）在目标浏览器矩阵中录制或截图证明头部行为，含 safe-area 场景。
2. 组件修复项：每项有前后对照截图与交互记录；375/390/430 宽度无横向溢出。
3. `ops e2e --mode integration` 全旅程回归；`ops perf mobile --mode integration --runs 3` 对照二期数字不回归。
4. 自动化证据与人工视觉/交互证据分开记录。

## 未决项

- 吸顶根因（`overflow-x: clip` 兼容性、预览场景 `overflow-x: hidden`，或其他）——待复现。
- 本轮组件修复项清单——待盘点与闸门。
- 真机验收的设备与浏览器范围——闸门定。
- 是否建立组件截图基线及其归属（`ops e2e` 扩展或独立）——闸门定。
