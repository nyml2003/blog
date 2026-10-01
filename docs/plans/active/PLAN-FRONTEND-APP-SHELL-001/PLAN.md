---
kind: plan
id: PLAN-FRONTEND-APP-SHELL-001
status: partial
owner: project-manager
created: 2026-10-01
last_reviewed: 2026-10-01
---

# 前端 App Shell 与不抖骨架屏

## 目标

分两阶段交付 App Shell 能力与博客应用接入。

**第一阶段只交付一个可消费的 `@fluvient-loom/app-shell` workspace/npm 包**：沉淀与宿主无关的 shell 描述、HTML/CSS 生成能力和几何约束，不修改博客应用，不接入页面模板或 bootstrap。

**第二阶段再接入博客应用**：让页面在**没有数据、JS 未挂载**时即可渲染完整页面框架（App Shell 模式）：HTML 模板自带页头/底栏/内容区骨架与内联关键 CSS，首帧不等外链资源与 JS；JS 启动后按"删壳契约"填充数据。同时建立"不抖"的三条纪律：

1. **几何一致**：骨架与真实内容同高（`aspect-ratio` 图片位、`line-clamp` 标题行数、同一套间距/字号 CSS 变量），替换时 layout-shift 为 0；
2. **迟到流光**：慢加载的 shimmer 用纯 CSS `animation-delay` 实现，前约 200ms 骨架静止，零 JS 参与 hold-back；
3. **刷新不闪骨架**：换筛选/重取时用 `@fluvient-loom/query` loading 态保留的 `latest` 渲染旧内容（降不透明度），不重画骨架。

第二阶段直接承接 `PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001` 暂缓的"底栏静态骨架"与二期移交的"白屏窗口"问题，与已交付的 SW 预取互补：预取压缩"数据等待"，App Shell 压缩"JS 挂载前的框架空白"。

第一阶段不拥有页面路由、API 数据、文章内容、Mobile/Desktop UI 或博客主题实现；这些内容由第二阶段的应用接入层负责。

## 当前基线（2026-10-01 现场核实）

- **HTML 模板是空壳**：`src/frontend/vite-plugins/page-template.ts:33-46` 生成的页面只有 `<div id="app"></div>` + JS entry；已核对 `dist/mobile/pages/home/index.html`，首帧唯一预绘内容是主题/字号内联脚本（设 `data-theme`/`data-font`）。JS 下载解析挂载前为白屏，slow3g 下该窗口约 918ms（一期移交数字，实施前需按当前 build 重采样）。
- **预取不覆盖 HTML**：`@fluvient-loom/mobile-prefetch` SW 只拦 `/api/public/mobile/category-shelf`，页面导航仍是 MPA 整页加载。
- **query 语义支持旧内容顶住**：`packages/query/src/resource.ts:77-82` loading 态清空 `snapshot` 但保留 `latest`，页面可直接消费，**无需改包契约**。
- **数据形状**：列表响应带 `total` 与 `items/articles.length`；注意 t-shelf 的 `total` 是截断前全量（`wire.rs` 注释明确与 articles 之和刻意不等），骨架条数不能直接用 `total`，首次用视口常量、二次用 `latest` 条数。
- **二期后性能基线**：slow3g nav-switch content 51ms、传输 4.5KB、缓存命中 8/8；cold-load content 约 5156ms。作为不劣化护栏。
- **现有加载态**：Mobile 为 `StateMessage` 组件（`role="status"`/`aria-busy` 齐全），Desktop 为散落的 `<p>加载中...</p>`；全项目无骨架屏。

## 核心设计契约（候选，闸门确认后授权实现）

- **包边界（第一阶段）**：`@fluvient-loom/app-shell` 只提供纯类型、纯函数和可显式导入的 CSS 资源；运行时不访问 `window`/`document`/`navigator`，不依赖 Solid、Vite、路由或博客 API。包输出必须具备明确的 `exports`、`files`、README、类型检查、测试和 pack smoke。
- **包契约（第一阶段）**：shell 描述至少表达平台、稳定区域、骨架几何约束、无障碍属性和 shimmer 规则；HTML/CSS 生成结果可做 golden 校验。包不决定页面内容，也不负责删除 shell。
- **注入通道（第二阶段）**：`pages.registry.ts` 每页新增可选 `shell` 字段；`page-template` 插件只负责调用包并注入到 `renderPageHtml`，不拥有内容。
- **端隔离归属**：Mobile shell 模板由 `app/habitat/mobile` 拥有，Desktop 由 `app/habitat/desktop` 拥有；共享的只有 CSS 设计令牌与纯逻辑。
- **删壳契约（第二阶段）**：shell 是 `#app` 的兄弟节点（如 `#app-shell`，`aria-hidden="true"`，含视觉隐藏的"正在加载"文本）；bootstrap 在**第一个确定状态提交时**移除——数据成功则内容淡入后删，错误/空态换成现有 `StateMessage`；**JS 内永不重画骨架**，杜绝"HTML 骨架闪一下又被 JS 骨架替换"。
- **主题跟随**：shell 样式消费现有 `data-theme`/`data-font` 变量，暗色/sepia 自动生效，不新增主题机制。
- **防漂移（分阶段）**：第一阶段验证生成 HTML/CSS 的结构和几何契约；第二阶段 e2e 增加"禁 JS 截图 shell"与"shell 高度 ≈ 加载后内容高度"断言。
- **进阶留档（本轮不做）**：Solid `renderToString` 构建期渲染 pending 态注入模板，实现壳的单真相源（Next.js `loading.tsx` 的构建期等价物）；待第一版出现实际漂移痛点再立项。

## 第一阶段成功标准

1. 新增 `packages/app-shell/`，包名为 `@fluvient-loom/app-shell`，可通过 workspace 导入并通过 `pnpm pack --dry-run` 检查交付文件。
2. 包不依赖宿主全局、Solid、Vite、路由、博客 API 或页面实现；现有 package neutrality guard 通过。
3. shell 描述、HTML/CSS 生成器和几何约束有单元测试与 golden 输出；包 README 记录公开入口、使用边界和主题变量约定。
4. 第一阶段不修改 `src/frontend/pages.registry.ts`、`src/frontend/vite-plugins/`、`src/frontend/app/bootstrap/`、应用页面和现有公共 API。

## 第二阶段成功标准

1. slow3g 冷加载下，HTML 首帧（FCP）即呈现页面框架与骨架，JS 挂载前的白屏窗口消除；目标数值与度量口径由闸门确认，以截图/录屏 + `ops perf mobile` 采样留档。
2. shell → 内容替换的 layout-shift 断言为 0；CLS 不劣于现状。
3. 换筛选/重取场景不再出现骨架闪烁（旧内容顶住 + 交叉淡入），有浏览器证据。
4. 二期成果不回归：nav-switch content ≤ 51ms 量级、传输 4.5KB 量级、缓存命中不降；cold-load 不劣化。
5. 375/390/430 viewport 与主题/字体组合下 shell 颜色与几何正确。
6. 改动范围内 typecheck、lint、相关测试、build 通过；跨模块改动跑 `ops quality check`；`ops e2e --mode integration` 通过。

## 第一阶段非目标

- 不接入博客应用页面，不修改 `pages.registry.ts`、`page-template.ts`、bootstrap、页面样式或 e2e。
- 不实现页面级 shell 模板、删壳生命周期、数据加载和旧内容顶住。
- 不发布到公共 npm registry；如需正式发布，另行确认包名、版本策略、许可证、构建产物和发布流程。

## 全计划非目标

- 不做 SPA 化或路由接管；后端仍只服务静态文件，不做服务端模板渲染。
- 不修改公开 API 契约、文章可见性；不改 `@fluvient-loom/query` 包语义。
- 不做视觉改版；admin 页本轮不做（闸门可调整）。
- 不引入新 UI 框架、状态管理或性能监控平台。
- 不实现 Solid SSR 构建期渲染（仅留档为进阶方案）。

## 约束与依据

- 事实：`FACT-RUNTIME-001`（2C/2GB 单机）。
- Spec：`SPEC-ARCH-BOUNDARY-001`（端隔离与 app 分层，shell 模板按端归属）、`SPEC-MOBILE-THEME-SETTINGS-001`（主题先行脚本）、`SPEC-SITE-ROUTES-001`。
- 移交输入：`PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001/002` 的白屏窗口与骨架暂缓记录。
- 业界参照：App Shell 架构（[web.dev PWA architecture](https://web.dev/learn/pwa/architecture)）、CLS 治理（[web.dev CLS](https://web.dev/articles/cls)）、骨架屏时序与感知（[NN/g Skeleton Screens](https://www.nngroup.com/articles/skeleton-screens/)）、旧数据顶住（[TanStack Query placeholderData](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries)）。这些资料用于约束包契约和第二阶段验收，不替代本项目现有边界。
- **写集协调（实施前必须互核，不得并行修改）**：
  - `PLAN-NAV-ACTIONS-001`（已 completed 归档，2026-10-01 复核）：顶栏五类入口与页面级 BFF 聚合（`modules[]`/`moduleKey` 分发）已落地，成为本计划基线；顶栏 shell 以当前已落地结构为准，闸门无需再等其冻结，但删壳时机绑定的状态源已变为页面聚合数据。
  - `PLAN-MOBILE-COMPONENT-EXPERIENCE-001`（active）：管 `styles/shell.css` 与组件结构（吸顶修复）。shell.css 在其写集内，本计划试点涉及同名/同目录样式时必须先协调。
  - `PLAN-SEARCH-001`（active）：新增搜索页按 registry `shell` 字段自然跟进，无直接写集冲突。
  - `PLAN-FRONTEND-FSD-RESTRUCTURE-001`（active）：前端目录重组，逐片改写 `pages.registry.ts`、`vite-plugins/` 模板、bootstrap 与样式/e2e 路径，与本计划试点写集逐文件重叠；先 shell 后重构还是先重构后 shell 是双方闸门必答题，未定前不得并行修改共享文件。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| App Shell 包设计与契约 | frontend | - | `packages/app-shell/package.json`、公开入口、类型/纯函数、README、包测试 | completed |
| App Shell 包验证与 pack smoke | frontend | 包设计与契约 | `packages/app-shell/test/**`、golden、package smoke/门禁补充 | completed |
| 阶段闸门与应用接入决策 | 产品+pm | 包契约验收 | 本 PLAN.md 阶段状态、接入范围、阈值与顺序 | completed for home pilot |
| Mobile 公共页 shell 试点（home/articles/detail） | frontend | 闸门 + 写集互核 | `pages.registry.ts`、`vite-plugins/page-template.ts`、Mobile shell 模板（新）、Mobile bootstrap 删壳逻辑、Mobile 样式、相关 e2e | partial: home |
| Desktop 公共页推广 | frontend | 试点验收 + 闸门确认纳入 | Desktop 对应 shell 模板（新）、bootstrap、样式、e2e | blocked |
| 第二阶段验收与收尾 | qa+pm | 推广完成 | 性能/浏览器证据、RESULT.md | pending |

第一阶段包开发与第二阶段应用接入在写集上隔离，可以先完成包；阶段闸门通过后才允许修改共享前端模板和 bootstrap。试点与 Desktop 推广共享前端构建/模板写集，不得并行修改；与 FSD-RESTRUCTURE、COMPONENT-EXPERIENCE 的 Mobile UI 写集重叠部分按"约束与依据"逐项互核。

## 第一阶段验收

1. `pnpm --filter @fluvient-loom/app-shell run typecheck`、测试和包 smoke 通过；若包沿用当前 workspace 源码导出模式，则至少补充 `pnpm pack --dry-run` 文件清单检查。
2. 公开入口、类型、HTML/CSS golden、无障碍属性和 `prefers-reduced-motion` 行为有测试覆盖。
3. `ops package check` 通过；不要求运行博客应用，不要求浏览器截图或性能基线变化。

### 第一阶段执行记录（2026-10-01）

- 已交付 `packages/app-shell/` workspace 包：结构化 shell 描述、确定性 HTML/关键 CSS 生成器、静态基础样式、README、类型检查与 4 项单元测试；未修改 `src/frontend` 应用接入代码。
- 已通过：`tsc --noEmit -p packages/app-shell/tsconfig.json`、`tsx --test packages/app-shell/test/*.test.ts`、包 smoke，以及 `NPM_CONFIG_CACHE=/tmp/blog-app-shell-npm-cache npm pack --dry-run --json`。pack 清单只包含 README、package.json、源码和 CSS。
- `ops package check` 的平台中立性检查触达新包且未报告新包违规；统一门禁随后被当前工作树既有的 `@fluvient/core` 迁移/锁文件漂移阻断（`package.json` 与 `pnpm-lock.yaml` 的 workspace 依赖不一致），未能取得全工作区门禁通过证据。
- 第一阶段不发布公共 npm，不接入博客页面；第二阶段仍需阶段闸门、写集互核和应用验收证据后再启动。

### 移动端首页接入记录（2026-10-01）

- 已在 `mobile-home` registry 条目接入 `@fluvient-loom/app-shell`：构建期模板在 `#app` 前注入 shell HTML 与关键 CSS，壳存在时隐藏应用挂载点，避免首帧出现两套加载态。
- 已在首页 bootstrap 接入删壳回调：推荐请求首次进入成功、错误或空结果等确定状态后移除 shell；启动失败也会移除 shell 并显示现有错误态。
- 首页刷新筛选时继续消费 query resource 的 `latest`，已有内容保持可见并标记 `aria-busy`，首次加载仍使用现有 `StateMessage`。
- 主题样式为 shell 提供 paper/dark/sepia 与字体变量映射；articles/detail/Desktop 尚未接入。
- 已通过：app-shell 4 项测试、page-template/page-bootstrap 8 项测试、定向 TypeScript 检查和改动文件格式检查。全量前端类型检查仍被工作树既有的 `mobile/features/search/model.ts` 可变/只读数组类型错误阻断。

## 集成验收

1. `ops perf mobile --mode integration --runs 3` 前后对比：cold-load 白屏窗口/shell 首帧可见时机、nav-switch 与传输不劣化，对照闸门阈值。
2. `ops e2e --mode integration` 全量回归 + 新增断言：禁 JS 的 shell 截图、shell→内容 layout-shift 为 0、shell/内容几何一致性。
3. 375px、390px、430px 宽度与主题/字体组合截图对照；弱网、断网、接口 4xx/5xx 下 shell 正确让位于错误态，不永久滞留。
4. 优化前后截图对照，视觉差异非目标行为时必须修复或记录。
5. 自动化证据与人工视觉/交互证据分开记录。

## 第二阶段未决项

- Desktop 与 admin 页是否纳入本轮（闸门）。
- 与 `PLAN-FRONTEND-FSD-RESTRUCTURE-001` 的先后顺序（闸门必答）。
- 白屏窗口目标值、骨架条数常量、shimmer 延迟阈值的具体数字（基线复核后由闸门或实现记录）。
- JS 完全加载失败时 shell 的兜底形态（`noscript` 提示或超时文案），不阻塞主链路。
- App Shell 模式是否在收尾时固化为 Spec。

## 第一阶段未决项

- 包是否仅作为 workspace 内部包，还是在第二阶段验收后进入公共 npm registry。
- 包是否需要预构建 ESM/CSS 产物，还是暂时沿用仓库现有的 TypeScript 源码导出方式。
- shell 描述是否以结构化数据为唯一输入，还是允许受控的 HTML/CSS 片段扩展；默认选择结构化数据，避免包承载页面业务。
