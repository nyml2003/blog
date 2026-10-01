---
kind: plan
id: PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-002
status: completed
owner: project-manager
created: 2026-09-30
last_reviewed: 2026-10-01
---

# Mobile 体验优化二期：端到端体验与性能

## 目标

以一期（`PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001`）移交的问题清单为输入，分两条主线改善 Mobile 真实体验：

1. **性能**：重点改善已有访问后的页面切换与资源复用；先完善并采集复用指标，再基于数据提出方案，经决策闸门确认目标与技术方案后实施。首次冷加载只作为不劣化护栏，并在本地 integration 栈与线上真实链路（nginx + TLS + 真实 RTT）留存前后对比数字。
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

## 非首次访问复用基线与初步归因（2026-09-30）

- 命令：`ops perf mobile --mode integration --runs 3`，390×844，分别采样 `unthrottled`、`slow4g`、`slow3g`；浏览器为本机 Chrome。报告：`target/e2e/1790780534352-66426/perf-report.json`。
- `nav-switch` 在同一个浏览器上下文先完整打开 Mobile 首页，再点击底栏进入文章页；它衡量的是已有访问后的跨页切换，不是干净缓存冷启动。
- 新增 JS/CSS 复用指标：导航后请求的 JS/CSS 中，`transferSize=0` 且 `decodedBodySize>0` 的解码字节 ÷ JS/CSS 总解码字节。该值表示资源传输复用，不等同于 npm 包在构建产物中的重复率。

| 网络档位 | 冷加载 content / 传输 | nav-switch content / 传输 | nav-switch JS/CSS 复用 | nav-switch HTML / API |
| --- | --- | --- | --- | --- |
| unthrottled | 58ms / 185.0KB | 69ms / 15.9KB | 167.4/167.6KB（99.9%） | 4.5KB / 10.9KB |
| slow4g | 1469ms / 185.0KB | 652ms / 15.9KB | 167.4/167.6KB（99.9%） | 4.5KB / 10.9KB |
| slow3g | 5126ms / 185.0KB | 1694ms / 15.9KB | 167.4/167.6KB（99.9%） | 4.5KB / 10.9KB |

归因：跨页后几乎全部 JS/CSS 已复用；未复用的 JS 传输仅约 495B。Vendor 再拆包不会明显减少当前 nav-switch 的资源传输，应暂缓作为优化项。剩余约 15.9KB 中，每次导航都传输约 10.9KB `category-shelf` API 与 4.5KB HTML；下一轮方案应优先比较 API 预取/响应复用与导航方式，并单独验证数据新鲜度约束。当前没有显式 API 缓存策略，不能仅凭前端预取宣称请求已复用。冷加载本次为 185.0KB、slow3g content 5126ms；后续实施以前述同参数结果作为“不劣化”护栏基线。

### 初步方案（供决策闸门讨论，不授权实现）

1. **保留现有 vendor/chunk 缓存方式**：先不新增 npm vendor 包、手工 vendor chunk 或静态资源 preload。当前 nav-switch 的 JS/CSS 解码复用率为 99.9%，再拆包对 10.9KB API 与 4.5KB HTML 没有直接作用；静态 preload 也不会减少已经缓存的字节。
2. **第一版候选：分类书架预取 + 页面间响应复用**：在用户可能切入文章页时预取 `category-shelf`，把结果暂存在同一标签页可跨文档读取的位置，目标是让点击后的内容不等待 API。预取只把 10.9KB 流量提前，不会自动减少总流量；实现后记录预取未使用字节、点击后 API 实际请求数、传输字节和 content 中位数。缓存有效期、后台刷新及过期数据短暂展示策略需要决策。
3. **把 HTTP 条件缓存作为减传输备选**：Product 当前 API envelope 未设置显式缓存头或校验器；为 `category-shelf` 增加校验器可减少重复响应体，但条件请求仍要等一次 RTT。若要完全消除切换后的请求等待，需要短时新鲜缓存或前端预取结果复用，并明确内容更新后的可见时限。
4. **暂不以 SPA 化消除 HTML 导航**：它有机会同时保留页面状态与 API 结果，但改动跨越导航/生命周期边界，且与 `PLAN-FRONTEND-ARCHITECTURE-CONSOLIDATION-001` 写集重叠，应先完成协调并与预取方案分别量测。

候选验收指标：slow3g `nav-switch` content 中位数、点击后 API 请求/传输字节、单次旅程总传输、JS/CSS 复用率；同时要求 slow3g 冷加载 content 与 JS 传输相对本基线不劣化。具体阈值及允许的数据陈旧时间由决策闸门确认。

## v0.2 草稿补充：预取能力包（未定方案）

本轮不再先做“用户点击概率、分类响应大小、预取浪费”的可行性探查；第一版策略固定为**全部分类、串行、空闲触发**，后续再根据实际命中率和浪费流量调整。该选择只表示降低第一版实现复杂度，不表示已确认长期预取策略。

建议先抽出一个无 UI 的 workspace/npm 包（暂名 `@fluvient-loom/mobile-prefetch`），让业务页面只接入能力，不感知 Cache Storage、Service Worker 消息协议、缓存键和 TTL 细节。第一版包的职责边界：

- 页面侧：注册/等待 SW 就绪、提供“预取全部分类”的单一调用、必要时报告预取结果；不直接读写缓存。
- SW 侧：串行请求分类、Cache Storage 写入、GET API fetch 拦截、缓存命中返回、in-flight 去重、版本化 cache name 和 TTL 判断。
- 业务侧仍需显式提供 SW 脚本入口和分类请求描述；包不能绕过构建系统自动生成或隐式接管全站 scope。
- 第一版只缓存 Mobile `category-shelf` GET API，不拦 HTML，不改后端响应头，不引入 ETag/Cache-Control 契约。

包的公共 API 应保持少量且可替换，例如“注册能力”“在空闲时预取全部分类”“读取运行状态”；具体消息格式、缓存键和存储实现留在包内。包不得依赖 Solid、Mobile 页面组件或业务 UI，避免把预取能力与当前页面实现绑定。

这段草稿仍不等于实现授权。首次访问是否由 SW 控制、是否调用 `clients.claim()`、TTL 和允许的数据陈旧时间、SW 更新清理策略、缓存键完整形式，以及上线前冷加载护栏采样，仍需在决策闸门确认。即使采用“全部预取”，实现后仍必须记录 API 命中率、预取未使用字节、切换传输和耗时，作为后续策略调整依据。

## 问题清单（候选，不预授权）

以下是有一期数据或代码证据支撑的候选问题，是否纳入、目标值和方案在决策闸门确认：

1. **非首次访问的资源复用**：量化底栏切换时 JS/CSS 解码体积复用率、复用字节、实际传输和内容可见耗时；先补齐指标并采样，再提出方案。复用是否覆盖多个页面/往返旅程，以探查证据为准。
2. **冷加载护栏**：不是本轮优化目标；实施前后冷加载 JS 传输与内容可见耗时不得劣化。
3. **切换链路重复传输**：目标方向是让底栏切换趋近只传输必要请求；若方案触及公共 API 契约边缘（如缓存相关响应头），必须作为闸门决策项单独确认。
4. **白屏窗口**：是否纳入本轮及对应方案，视真机效果与写集协调决定（一期暂缓项）。
5. **线上数字缺口**：本轮任何优化上线后，`--origin` 采样数字必须留档（补齐一期缺口）。
6. **favicon 404**：小改动，可搭车。

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

1. **问题事实与方案留档**：复用指标、归因结论、候选方案与取舍依据记录在本目录，闸门确认项回写本 PLAN.md。
2. **性能数字**：闸门确认的非首次访问复用/耗时目标达成，并有优化前后同命令同参数（`ops perf mobile --mode integration --runs 3`）的对比留档；冷加载 JS 传输与内容可见耗时不劣化。
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
  - `PLAN-FRONTEND-INFRASTRUCTURE-PACKAGES-001`（已归档，2026-09-30 completed）：`app/infrastructure` 已收敛到 `@fluvient-loom/web`/`node`；本计划改 mobile API client、网络层时以当前 workspace 包形态为准。
  - `PLAN-FRONTEND-ARCHITECTURE-CONSOLIDATION-001`（已归档，2026-10-01 completed）：页面生命周期与导航意图已收敛到 `app/bootstrap`；本计划不再与其写集冲突，以新运行时结构为准。
  - `PLAN-SCRIPTS-REMOVAL-001`（已归档，2026-09-30 completed）：wasm 构建脚本已迁入 `src/frontend/build/`。
  - `PLAN-FRONTEND-VITE-PLUGINS-DIRECTORY-001`（completed，2026-10-01 实施）：Vite 插件已迁入 `src/frontend/vite-plugins/`；本计划未提交的 `mobile-prefetch.ts` 已随迁至新路径，提交时以新路径为准。

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

## 收尾记录（2026-10-01）

### 实际交付

- 新增 `@fluvient-loom/mobile-prefetch` workspace 包，提供页面注册、空闲预取、Service Worker 缓存、TTL、串行预取和 in-flight 去重。
- Mobile 首页接入全部分类预取；与现有 `@fluvient-loom/query` 组合使用，不修改业务 API 契约。
- Vite 产出 `mobile-prefetch-sw.js`；开发服务器和 Product 静态服务器均可访问该脚本。
- integration fixture 使用 `45` 篇文章和 `6` 个分类完成浏览器验证。

### 指标证据

- slow3g、390×844、同一 integration 栈、3 次采样：nav-switch content `1694ms → 51ms`（-97.0%）。
- nav-switch FCP/LCP `872ms → 48ms`（-94.5%）。
- 总传输 `15.9KB → 4.5KB`，分类 API `10.9KB → 0B`，缓存命中 `8/8`，预取完成 `6` 个分类。
- cold-load content 约 `5156ms`，相对本轮基线未劣化。
- 发布后用户确认运行正常。

### 后续计划输入

- 九项端到端体验审计、线上长期观测、预取浪费率、数据新鲜度、TTL 调优和 HTML 缓存作为后续 Mobile 体验专项输入。
- `ops perf mobile --origin <部署域名>` 线上采样属于后续部署观测工作，不构成本期预取优化的交付条件。

### 收尾结论

本计划以 `completed` 归档：本期目标已收敛为非首次访问预取与响应复用，目标已实现、完成指标验证并部署。其他体验审计和长期观测明确移交后续计划，不作为本期未完成项。
