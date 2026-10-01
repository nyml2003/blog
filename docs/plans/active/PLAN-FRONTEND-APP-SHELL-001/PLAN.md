---
kind: plan
id: PLAN-FRONTEND-APP-SHELL-001
status: ready
owner: project-manager
created: 2026-10-01
last_reviewed: 2026-10-01
---

# 前端 App Shell 与不抖骨架屏

## 目标

让页面在**没有数据、JS 未挂载**时即可渲染完整页面框架（App Shell 模式）：HTML 模板自带页头/底栏/内容区骨架与内联关键 CSS，首帧不等外链资源与 JS；JS 启动后按"删壳契约"填充数据。同时建立"不抖"的三条纪律：

1. **几何一致**：骨架与真实内容同高（`aspect-ratio` 图片位、`line-clamp` 标题行数、同一套间距/字号 CSS 变量），替换时 layout-shift 为 0；
2. **迟到流光**：慢加载的 shimmer 用纯 CSS `animation-delay` 实现，前约 200ms 骨架静止，零 JS 参与 hold-back；
3. **刷新不闪骨架**：换筛选/重取时用 `@fluvient-loom/query` loading 态保留的 `latest` 渲染旧内容（降不透明度），不重画骨架。

本计划直接承接 `PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001` 暂缓的"底栏静态骨架"与二期移交的"白屏窗口"问题，与已交付的 SW 预取互补：预取压缩"数据等待"，App Shell 压缩"JS 挂载前的框架空白"。

## 当前基线（2026-10-01 现场核实）

- **HTML 模板是空壳**：`src/frontend/vite-plugins/page-template.ts:33-46` 生成的页面只有 `<div id="app"></div>` + JS entry；已核对 `dist/mobile/pages/home/index.html`，首帧唯一预绘内容是主题/字号内联脚本（设 `data-theme`/`data-font`）。JS 下载解析挂载前为白屏，slow3g 下该窗口约 918ms（一期移交数字，实施前需按当前 build 重采样）。
- **预取不覆盖 HTML**：`@fluvient-loom/mobile-prefetch` SW 只拦 `/api/public/mobile/category-shelf`，页面导航仍是 MPA 整页加载。
- **query 语义支持旧内容顶住**：`packages/query/src/resource.ts:77-82` loading 态清空 `snapshot` 但保留 `latest`，页面可直接消费，**无需改包契约**。
- **数据形状**：列表响应带 `total` 与 `items/articles.length`；注意 t-shelf 的 `total` 是截断前全量（`wire.rs` 注释明确与 articles 之和刻意不等），骨架条数不能直接用 `total`，首次用视口常量、二次用 `latest` 条数。
- **二期后性能基线**：slow3g nav-switch content 51ms、传输 4.5KB、缓存命中 8/8；cold-load content 约 5156ms。作为不劣化护栏。
- **现有加载态**：Mobile 为 `StateMessage` 组件（`role="status"`/`aria-busy` 齐全），Desktop 为散落的 `<p>加载中...</p>`；全项目无骨架屏。

## 核心设计契约（候选，闸门确认后授权实现）

- **注入通道**：`pages.registry.ts` 每页新增可选 `shell` 字段；`page-template` 插件只负责注入到 `renderPageHtml`，不拥有内容。
- **端隔离归属**：Mobile shell 模板由 `app/habitat/mobile` 拥有，Desktop 由 `app/habitat/desktop` 拥有；共享的只有 CSS 设计令牌与纯逻辑。
- **删壳契约**：shell 是 `#app` 的兄弟节点（如 `#app-shell`，`aria-hidden="true"`，含视觉隐藏的"正在加载"文本）；bootstrap 在**第一个确定状态提交时**移除——数据成功则内容淡入后删，错误/空态换成现有 `StateMessage`；**JS 内永不重画骨架**，杜绝"HTML 骨架闪一下又被 JS 骨架替换"。
- **主题跟随**：shell 样式消费现有 `data-theme`/`data-font` 变量，暗色/sepia 自动生效，不新增主题机制。
- **防漂移**：e2e 增加"禁 JS 截图 shell"与"shell 高度 ≈ 加载后内容高度"断言；生成 HTML 结构变化进 golden。
- **进阶留档（本轮不做）**：Solid `renderToString` 构建期渲染 pending 态注入模板，实现壳的单真相源（Next.js `loading.tsx` 的构建期等价物）；待第一版出现实际漂移痛点再立项。

## 成功标准

1. slow3g 冷加载下，HTML 首帧（FCP）即呈现页面框架与骨架，JS 挂载前的白屏窗口消除；目标数值与度量口径由闸门确认，以截图/录屏 + `ops perf mobile` 采样留档。
2. shell → 内容替换的 layout-shift 断言为 0；CLS 不劣于现状。
3. 换筛选/重取场景不再出现骨架闪烁（旧内容顶住 + 交叉淡入），有浏览器证据。
4. 二期成果不回归：nav-switch content ≤ 51ms 量级、传输 4.5KB 量级、缓存命中不降；cold-load 不劣化。
5. 375/390/430 viewport 与主题/字体组合下 shell 颜色与几何正确。
6. 改动范围内 typecheck、lint、相关测试、build 通过；跨模块改动跑 `ops quality check`；`ops e2e --mode integration` 通过。

## 非目标

- 不做 SPA 化或路由接管；后端仍只服务静态文件，不做服务端模板渲染。
- 不修改公开 API 契约、文章可见性；不改 `@fluvient-loom/query` 包语义。
- 不做视觉改版；admin 页本轮不做（闸门可调整）。
- 不引入新 UI 框架、状态管理或性能监控平台。
- 不实现 Solid SSR 构建期渲染（仅留档为进阶方案）。

## 约束与依据

- 事实：`FACT-RUNTIME-001`（2C/2GB 单机）。
- Spec：`SPEC-ARCH-BOUNDARY-001`（端隔离与 app 分层，shell 模板按端归属）、`SPEC-MOBILE-THEME-SETTINGS-001`（主题先行脚本）、`SPEC-SITE-ROUTES-001`。
- 移交输入：`PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001/002` 的白屏窗口与骨架暂缓记录。
- 业界参照（按名检索即可）：App Shell 模型（web.dev PWA 章节）、NN/g 骨架屏研究（闪烁伤感知）、CLS 治理实践、React Query `keepPreviousData`/SWR 的旧数据顶住模式。
- **写集协调（实施前必须互核，不得并行修改）**：
  - `PLAN-NAV-ACTIONS-001`（已 completed 归档，2026-10-01 复核）：顶栏五类入口与页面级 BFF 聚合（`modules[]`/`moduleKey` 分发）已落地，成为本计划基线；顶栏 shell 以当前已落地结构为准，闸门无需再等其冻结，但删壳时机绑定的状态源已变为页面聚合数据。
  - `PLAN-MOBILE-COMPONENT-EXPERIENCE-001`（active）：管 `styles/shell.css` 与组件结构（吸顶修复）。shell.css 在其写集内，本计划试点涉及同名/同目录样式时必须先协调。
  - `PLAN-SEARCH-001`（active）：新增搜索页按 registry `shell` 字段自然跟进，无直接写集冲突。
  - `PLAN-FRONTEND-FSD-RESTRUCTURE-001`（active）：前端目录重组，逐片改写 `pages.registry.ts`、`vite-plugins/` 模板、bootstrap 与样式/e2e 路径，与本计划试点写集逐文件重叠；先 shell 后重构还是先重构后 shell 是双方闸门必答题，未定前不得并行修改共享文件。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 基线复核与度量准备 | frontend | - | 本目录基线记录（白屏窗口重采样、CLS/layout-shift 断言能力）；`apps/blog/src/e2e` 断言模块 | ready |
| 决策闸门 | 产品+pm | 基线复核 | 本 PLAN.md 范围、阈值与顺序确认 | blocked |
| Mobile 公共页 shell 试点（home/articles/detail） | frontend | 闸门 + 写集互核 | `pages.registry.ts`、`vite-plugins/page-template.ts`、Mobile shell 模板（新）、Mobile bootstrap 删壳逻辑、Mobile 样式、相关 e2e | blocked by 闸门 |
| Desktop 公共页推广 | frontend | 试点验收 + 闸门确认纳入 | Desktop 对应 shell 模板（新）、bootstrap、样式、e2e | blocked |
| 验收与收尾 | qa+pm | 推广完成 | 验收证据、RESULT.md | pending |

试点与 Desktop 推广共享前端构建/模板写集，不得并行修改；与 FSD-RESTRUCTURE、COMPONENT-EXPERIENCE 的 Mobile UI 写集重叠部分按"约束与依据"逐项互核。

## 集成验收

1. `ops perf mobile --mode integration --runs 3` 前后对比：cold-load 白屏窗口/shell 首帧可见时机、nav-switch 与传输不劣化，对照闸门阈值。
2. `ops e2e --mode integration` 全量回归 + 新增断言：禁 JS 的 shell 截图、shell→内容 layout-shift 为 0、shell/内容几何一致性。
3. 375px、390px、430px 宽度与主题/字体组合截图对照；弱网、断网、接口 4xx/5xx 下 shell 正确让位于错误态，不永久滞留。
4. 优化前后截图对照，视觉差异非目标行为时必须修复或记录。
5. 自动化证据与人工视觉/交互证据分开记录。

## 未决项

- Desktop 与 admin 页是否纳入本轮（闸门）。
- 与 `PLAN-NAV-ACTIONS-001` 顶栏改造的先后顺序（闸门必答）。
- 白屏窗口目标值、骨架条数常量、shimmer 延迟阈值的具体数字（基线复核后由闸门或实现记录）。
- JS 完全加载失败时 shell 的兜底形态（`noscript` 提示或超时文案），不阻塞主链路。
- App Shell 模式是否在收尾时固化为 Spec。
