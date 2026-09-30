---
kind: plan
id: PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-002
status: ready
owner: project-manager
created: 2026-09-30
last_reviewed: 2026-09-30
---

# Mobile 体验优化二期：端到端体验与性能

## 目标

以一期（`PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001`）移交的问题清单为输入，分两条主线改善 Mobile 真实体验：

1. **性能**：对冷加载与页面切换链路上剩余的主要成本建立量化归因，经决策闸门确认本轮解决的问题、目标值与技术方案后实施，并在本地 integration 栈与线上真实链路（nginx + TLS + 真实 RTT）都有前后对比数字。
2. **端到端体验**：完成一期整体移出的 9 项全旅程审计，把发现分成事实缺陷、体验风险、架构问题、暂不处理四类，与产品确认本轮最多 3 个修复项后实现并验收。

本计划只立项问题域、决策流程和验收要求，不预先选定技术方案；方案由探查方在归因和审计后提出，由产品在决策闸门确认。吸取一期复盘教训：不以"构建通过"代替浏览器与线上验收，不把候选问题当预授权范围。

## 当前基线（2026-09-30 现场核实）

一期已交付并随 build-v0.1.6 发布：`ops perf mobile` 度量命令、静态资源缓存与 gzip、site-routes 构建期内嵌。slow3g 下底栏切换 content 5879ms→1697ms（-71%）、传输 183.6KB→15.6KB、缓存命中 6/8。

剩余问题（一期 RESULT.md 明确移交 + 本日 dist 现场复核）：

- **冷加载传输体积大**：slow3g 冷加载 content 约 5.1s；`dist/assets/network-*.js` 114KB（zod schemas chunk）被 mobile environment chunk 直接 import，所有 Mobile 页面冷加载都必须下载，是 JS 传输的大头。mobile 源码中 zod 使用仅约 12KB，说明体积主要来自依赖本身而非业务 schema。
- **切换链路仍有重复传输**：nav-switch 剩余传输 15.6KB，其中 category-shelf API 约 11KB 每次切换都重新请求，HTML（no-cache）约 1.7KB。
- **白屏窗口**：弱网下底栏可见前仍有明显白屏窗口（slow3g 约 918ms）；一期 P1 底栏静态骨架暂缓，"视真机效果再定"。
- **线上数字缺口**：一期线上验收只有用户确认部署完成，`ops perf mobile --origin` 采样数字未留存；gzip 只在 nginx 生效，本地 integration 栈不体现。
- **E2E 覆盖缺口**：现有浏览器 E2E 覆盖 Mobile 文章分类 URL/back、详情、错误态；缺首页、设置、横屏、375/390/430 viewport 矩阵、主题/字体组合。
- 小额问题：favicon 404；`ops delivery installer` esbuild 未锁版本（交付链债务，默认归交付侧处理，不在本计划范围）。

## 问题清单（候选，不预授权）

以下是有一期数据或代码证据支撑的候选问题，是否纳入、目标值和方案在决策闸门确认：

1. **冷加载传输与耗时**：目标方向是显著降低 Mobile 公开页冷加载的 JS 传输与弱网耗时；技术路径由探查方提出并论证。
2. **切换链路重复传输**：目标方向是让底栏切换趋近只传输必要请求；若方案触及公共 API 契约边缘（如缓存相关响应头），必须作为闸门决策项单独确认。
3. **白屏窗口**：是否纳入本轮及对应方案，视真机效果与写集协调决定（一期暂缓项）。
4. **线上数字缺口**：本轮任何优化上线后，`--origin` 采样数字必须留档（补齐一期缺口）。
5. **favicon 404**：小改动，可搭车。

## 体验审计范围（一期整体移入）

1. 首次打开、刷新、直达带参数 URL、弱网和 API 失败；
2. 首页发现内容、进入文章库、一级/二级分类切换、前进/后退和分享链接；
3. 文章详情首屏、返回、长正文、代码块、表格、图片和阅读连续性；
4. 设置读取、切换、保存失败、恢复默认和跨页面首绘；
5. 空数据、错误、重试、取消和快速重复操作；
6. 375px、390px、430px 等窄屏，以及较大 Mobile viewport；
7. 触控目标、读屏名称、焦点、对比度、减少动画和横向溢出；
8. 真实网络请求数量、首屏阻塞、重复请求、取消和过期响应；
9. 新运行时页面与 Mobile 管理预览之间的体验差异。

审计结果必须分为：事实缺陷（可由代码、测试或浏览器复现）、体验风险（需用户或设计判断）、架构问题（职责不清）、暂不处理（收益不足、依赖未满足或属其他 Plan）。

## 决策闸门

归因与审计完成后，与产品共同确认（未通过前不进入实现类工作流）：

- 本轮纳入的问题及量化目标（冷加载/切换的传输字节与中位耗时预算）；
- 每个纳入问题的技术方案（由探查方提出，含取舍与影响范围；触及公共 API 契约边缘的方案单独确认）；
- 白屏窗口问题是否纳入本轮（视真机效果 + 写集协调结果）；
- 体验审计后本轮最多 3 个主要用户问题、目标旅程和验收证据；
- 产品决策题（不默认增加）：详情页返回策略（浏览器 history 还是固定文章库回退）、是否支持横屏、是否调整 F 型分类结构、三项底栏与详情无底栏规则、是否纳入 Mobile 管理预览；
- 浏览器、真机或截图验收的最低证据。

## 成功标准

1. **问题事实与方案留档**：归因结论、候选方案与取舍依据记录在本目录，闸门确认项回写本 PLAN.md。
2. **性能数字**：闸门确认的目标值达成，并有优化前后同命令同参数（`ops perf mobile --mode integration --runs 3`）的对比留档。
3. **线上验收**：`ops perf mobile --origin <部署域名>` 的采样数字留存在案，与本地 integration 数字分开记录。
4. **端到端体验**：9 项审计完成并四类分级；闸门确认的最多 3 个问题在窄屏/弱网/异常路径下有可复现的修复证据（截图、交互记录或新增 E2E）。
5. **回归不破**：一期成果（缓存命中、site-routes 内嵌、切换 -71%）不回归；`ops e2e --mode integration` 通过。
6. **质量门禁**：改动范围内 typecheck、lint、相关测试、build 通过；跨模块或公共契约改动跑 `ops quality check`。

## 非目标

- 不新增搜索、分享、收藏等产品能力（P3，单独讨论）。
- 不改变公开 API 语义、文章可见性、发布状态或路由契约；触及契约边缘的方案只在闸门明确决策后实施。
- 不合并 Desktop 与 Mobile UI，不做视觉改版；视觉变化必须单独记录并验收。
- 不顺手处理交付链债务（esbuild 锁版本等，归交付侧）。
- 不在本计划内重构与目标无关的模块。

## 约束与依据

- 事实：`FACT-RUNTIME-001`（目标服务器 2 核 2GB，方案须适配低资源单机）。
- Spec：`SPEC-ARCH-BOUNDARY-001`（端隔离与 app 分层）、`SPEC-MOBILE-THEME-SETTINGS-001`、`SPEC-SITE-ROUTES-001`。
- 一期输入：`docs/plans/archive/PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001/` 的 RESULT.md 与 BASELINE-PERF.md。
- Desktop 与 Mobile 不共享 JSX、CSS、DOM 或组件内部状态；页面不直接访问 transport、storage、wire DTO 或具体 URL。
- 不默认引入新 UI 框架、状态管理器、图标库或性能监控平台。
- **写集协调（实施前必须核对）**：
  - `PLAN-FRONTEND-INFRASTRUCTURE-PACKAGES-001`：正在将 `app/infrastructure` 收敛到 `@fluvient-loom/web`/`node`，与本计划可能改动的 mobile API client、网络层重叠；当前工作树已有其未提交改动，动同一批文件前先确认最新状态。
  - `PLAN-FRONTEND-ARCHITECTURE-CONSOLIDATION-001`：与页面生命周期、导航意图写集可能重叠；该计划主体迁移已完成但未收尾，实施前协调串行。
  - `PLAN-SCRIPTS-REMOVAL-001`：wasm 构建脚本归属迁移中（`scripts/` → `src/frontend/build/`）；涉及 wasm chunk 的改动等其落定。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 性能归因与基线复核 | frontend | - | 本目录归因记录（perf 产物在 `target/` 不入库） | ready |
| 体验审计（9 项清单） | qa+frontend | - | 审计记录、复现步骤、截图/运行证据 | ready |
| 决策闸门 | 产品+pm | 归因+审计 | 本 PLAN.md 范围、目标与方案确认 | blocked |
| 性能优化实现 | frontend（+backend 若方案涉及） | 闸门 | 闸门确认方案覆盖的写集（预计涉及 mobile api/bootstrap/resource、构建配置，以后端参与的方案为准） | blocked by 闸门 |
| 体验修复实现（≤3 项） | frontend | 闸门 | 闸门明确列出的 mobile 页面、UI、logic、resource、样式 | blocked by 闸门 |
| 线上验收与收尾 | qa+pm | 实现完成 | `--origin` 采样留档、RESULT.md | pending |

归因与审计可并行；两个实现工作流共享 mobile 前端写集，不得并行修改；实现的具体文件范围以闸门确认的方案为准。

## 集成验收

1. `ops perf mobile --mode integration --runs 3` 前后对比：冷加载与 nav-switch 的传输、缓存命中与中位耗时，对照闸门确认的目标值。
2. `ops perf mobile --origin <部署域名>` 线上采样留档（含 nginx gzip 生效后的真实传输）。
3. `ops e2e --mode integration` 全旅程回归；审计后按闸门确认的问题补 E2E 场景（首页、设置、viewport 矩阵等缺口按需纳入）。
4. 375px、390px、430px 宽度下检查布局、触控命中、横向溢出；弱网、断网、接口 4xx/5xx 下检查状态与恢复。
5. 优化前后截图对照，视觉差异非目标行为时必须修复或记录。
6. 自动化证据与人工视觉/交互证据分开记录。

## 未决项

- 冷加载传输与切换链路重复传输的技术方案：待归因后由探查方提出，闸门确认。
- 白屏窗口问题是否纳入本轮（依赖真机效果判断与写集协调）。
- 产品决策题：详情页返回策略、横屏、F 型分类结构、底栏规则、管理预览范围。
- 最低设备/浏览器基线与性能预算是否需要固化为 Spec。
