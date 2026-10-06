---
kind: plan
id: PLAN-PAGE-TRANSITION-FRAMEWORK-001
status: ready
owner: project-manager
created: 2026-10-06
last_reviewed: 2026-10-06
---

# 页面加载态框架：多加载形态、静态预渲染与页面级配置

## 目标

把单一的"移动端详情骨架试点"升级为跨端、**多形态、页面可配置**的加载态框架：

1. **多加载形态**：页面按业务场景选择呈现——区域骨架、文字/图标状态、指示器（spinner）、确定性进度、旧内容顶住（stale）、none、受控自定义；同一页面对不同数据单元可各选各的（如"首屏骨架 + 刷新 stale + 分页 spinner"）。
2. **页面级配置**：每页在 `definition.ts` 声明自己的加载策略，注册期校验；不配置 = 现状（纯白屏到内容）。
3. **静态预渲染**：骨架类形态在构建期注入 HTML + 关键 CSS，JS 未挂载即可见；Desktop 与 Mobile 同等支持（当前仅 Mobile 详情一页）。
4. **生命周期与兜底**：把"异步场景 → 呈现形态"的决策做成统一纯函数；旧内容不重画骨架；chunk 失败/超时兜底；a11y、`prefers-reduced-motion`、no-JS 基线。
5. **可回归**：配置校验器 + golden/单测 + 两端 e2e + perf 基线，把加载行为固化成可验证契约，必要时沉淀 Spec。

## 成功标准

1. **形态覆盖**：至少 5 种形态可用——`skeleton` / `message` / `spinner` / `stale` / `none`，另有 `custom` 受控逃生口（边界由 G1/G8 定）。
2. **配置维度**：页面级默认 + 数据单元级覆盖 + 动作级（提交）配置；同一页能表达"首屏骨架、筛选旧内容顶住、加载更多 spinner、保存按钮忙碌"四种行为。
3. **业务场景各一页示范**：详情（`skeleton`）、列表 + 筛选（`stale`/`spinner`）、表单提交（`actions.spinner`，桌面编辑器或登录页）。
4. **两端覆盖**：Desktop 至少 1 个公共页 + 1 个管理页试点（经闸门）；Mobile 详情现有行为不回归；两端呈现组件统一收敛，不再散落 `<p>加载中...</p>`。
5. **不抖与兜底**：壳 → 内容 layout-shift ≤ 0.01；禁 JS 时骨架可见、`#app` 隐藏；chunk 失败/数据超时可见可重试（形态由 G6 定）。
6. **缓存**：筛选/重取有"旧内容顶住"浏览器证据；若持久化快照落地，冷启动直接渲染快照且带 TTL/刷新，admin 被规则排除。
7. **门禁与文档**：`ops quality check`、`ops package check`、相关单测/golden 全绿；`ops e2e` 覆盖两端；perf 不劣化（数值实施时重采样）；字段/形态/缓存策略写入 Spec 或架构文档，接入指南含最小示例。

## 非目标

- 不做 SSR、流式渲染、SPA 路由接管；保持 MPA + 静态托管（后端不产出 loading UI）。
- 不做视觉改版、不引入 UI 框架/动画库/状态管理库。
- admin/编辑页不进入持久化缓存（一致性与隐私）；admin 允许骨架与内存态。
- 不追求全站页面一次铺开；按页面价值逐页推广、逐页验收。
- 不替代 `PLAN-MOBILE-REVEAL-EXPERIENCE-001` 的 H2 真机光栅归因；其结论未定前不改揭幕视觉契约（见写集协调）。

## 业界实践定位

结论：**"多形态加载 + 路由级配置 + 旧数据顶住"就是业界通行的做法，符合实践**；差异在于本项目没有 SSR/流式能力，`boot` 场景的静态骨架是服务端 loading UI 的构建期等价物。

| 实践 | 代表 | 本项目的等价/差异 |
| --- | --- | --- |
| 路由级 loading UI | Next.js `loading.tsx`、SvelteKit fallback、Nuxt loading、Astro | 构建期把骨架写进 HTML + 关键 CSS；无服务端渲染 |
| 骨架屏感知性能 | NN/g skeleton screens | 低对比静态占位、默认不闪；几何与真实内容一致控 CLS |
| 旧数据先渲染、后台刷新 | SWR / RFC 5861 / TanStack Query placeholderData | `@fluvient-loom/query` 的 `snapshot`/`latest`（内存版已具备） |
| 忙碌与进度语义 | WAI-ARIA `aria-busy`、不确定 vs 确定进度 | 原子 button/icon-button 已有 `state="loading"`；进度形态本期按需实现 |
| 跨文档过渡动画 | View Transitions API | 仓库已有 `@view-transition` CSS；遵守 `docs/guides/mobile-web-gestures.md` 坑位与 reduced-motion |
| 配置化策略 | 各框架 route config / segment options | 页面 `definition.ts` 声明配置，注册期校验、构建期展开 |

对照只用于约束验收口径；不引入任何外部运行时。

## 现状基线（2026-10-06 现场核实）

**骨架/静态预渲染**
- 包已存在：`packages/web/app-shell` 提供纯渲染器 `renderAppShell(spec) → { html, criticalCss }`；`AppShellSpec` 支持 `platform: "desktop" | "mobile"`、`regions/placeholders`（block/line/media）、`loadingLabel`、可选 `shimmer/shimmerDelayMs`；golden 测试只覆盖 mobile。
- 注入链：`PageRegistration.shell`（`packages/solid/page-kit/src/shared.ts:75`）→ `renderPageHtml`（`packages/build/page-build-kit/src/plugins/page-template.ts:24-47`）：`<style data-loom-app-shell>` + 壳 HTML 注入 `#app` 之前；关键 CSS 用 `.loom-app-shell + #app{visibility:hidden}`（`packages/web/app-shell/src/shell.ts:190`）。
- 平台限制：校验规则 `shell-mobile-only` 拒绝 desktop（`packages/build/page-build-kit/src/validate.ts:149-155`），且 `mountDesktopApplication` 没有删壳 hook（`packages/solid/page-kit/src/desktop.tsx:52-64`）。
- 使用面仅 1 页：`packages/app/pages/mobile-detail/src/definition.ts:14-48`。

**现有加载 UI（多但散）**
- Mobile 有 `StateMessage`（kind: `loading | empty | error`，`packages/app/mobile-shared/src/ui/molecules/state-message.tsx:5-12`），页面消费点：`mobile-home:71-99`、`mobile-articles`、`mobile-detail:70,120`、`mobile-admin-preview`。
- 原子级忙碌：`button.tsx:49`、`icon-button.tsx:40` 的 `state === "loading"` + `aria-busy`。
- Desktop 无共享加载组件：散落 `<p>加载中...</p>`（`desktop-home:37`、`desktop-articles:136`、`desktop-admin-home:60`、`desktop-taxonomy:42`）、`Text role="status"`（`desktop-editor:230,294`、`desktop-taxonomy:33`）、`fallback={<p role="alert">文章加载中或不存在。</p>}`（`desktop-detail:57`）、`page.message()`（`desktop-admin-home:53`）。
- 结论：呈现形态存在，但**没有"场景 → 形态"的统一模型**，每个页面各自为政，配置与验收无从谈起。

**运行时与缓存**
- `query` 的 `snapshot/latest` 在重取/错误时保留旧值（`packages/ts/query/src/resource.ts:27-28,79-97`），可直接消费，无需改包。
- `mobile-prefetch` SW 只拦 `/api/public/mobile/category-shelf` 同源 GET，TTL 60s、缓存优先、过期即删、不拦 HTML（`packages/web/mobile-prefetch/src/service-worker.ts:54-57,105-125`）。
- HTTP 头：`/assets/*` immutable 一年、页面 HTML `no-cache`（`src/backend/product/src/static_files.rs:33-34`）。
- 兜底缺口：动态 chunk 失败无捕获（`bootstrap/desktop.tsx:52` 的 `load().then(...)` 没有 `catch`），失败会长时间空白；两端 StartupError 不统一。

**揭幕与测试**
- 揭幕归因进行中：`PLAN-MOBILE-REVEAL-EXPERIENCE-001`（in-progress）H2「内容预绘制」可能改 `#app` 隐藏契约，本计划不预设其结论。
- `page-template` 测试锁定"只有 mobile-detail 带壳"与两端 CSS import 集合（`src/frontend/tests/vite-plugins/page-template.test.ts:148-153,183-212`）；e2e 的禁 JS 壳、layout-shift、主题/几何断言都在 Mobile（`apps/blog/src/e2e/e2e.ts:260-408`）；Desktop 旅程无壳断言。
- 没有 active Spec 定义加载态/骨架；字段类型声明在 `packages/solid/page-kit/src/shared.ts`；`SPEC-ARCH-BOUNDARY-001`、`SPEC-SITE-ROUTES-001` 约束归属与路由。

## 加载态全景（本计划的核心模型）

两个维度：**异步场景**（什么时候） × **呈现形态**（显示什么）。配置与解析都基于这两列。

场景（统一命名，作为配置 key 与解析输入）：

| 场景 | 触发 | 典型页面 |
| --- | --- | --- |
| `boot` | HTML 到达 → JS 挂载/首块数据确定前 | 所有页面首访 |
| `first-load` | 某数据单元首次取数且无缓存 | 详情、列表 |
| `refetch` | 已有数据后重取（筛选、返回） | 列表筛选、Mobile 底栏切换 |
| `pagination` | 加载更多/翻页 | 列表增量 |
| `action` | 提交/保存/登录/收藏等命令执行 | 编辑器、登录、导航操作 |
| `background` | 后台静默刷新（不打断阅读） | SWR 刷新、预取 |

形态：

| 形态 | 说明 | 可静态预渲染 | 现有资产 |
| --- | --- | --- | --- |
| `skeleton` | 区域化几何占位 | 是（仅 `boot`） | app-shell + mobile-detail 试点 |
| `message` | 文字/图标状态（含 label） | 否 | Mobile `StateMessage`；Desktop 散落文案 |
| `spinner` | 小型指示器/行内忙碌 | 否 | 原子 button/icon-button busy；无独立组件 |
| `progress` | 确定性进度（上传/批次提交） | 否 | 无，按需实现 |
| `stale` | 旧内容顶住 + 弱化/刷新指示 | 否 | `query.latest` 能力 |
| `none` | 不显示（乐观/后台） | 否 | 无 |
| `custom` | 页面自定义片段（受控逃生口） | 否 | 无 |

规则：`boot` 只有 `skeleton`/`none` 可静态化；形态与场景的兼容组合由校验器执行（见 L5）。

## 核心设计候选（闸门确认后授权实现）

### L1 页面配置模型（G1）

```ts
loading?:
  | "none"
  | {
      boot?: "skeleton" | { preset?: LoadingPreset; skeleton?: AppShellSpec } | "message" | "none";
      units?: Record<string, LoadingPresentation>;  // 页面内数据单元逻辑名 → 场景策略
      actions?: "spinner" | "message" | "none";
      reveal?: "ready" | "crossfade";
      fallback?: { timeoutMs: number; action: "error" | "remove-shell" };
      cache?: "off" | "latest" | { mode: "snapshot"; ttlMs: number };  // G2
    }

type LoadingPresentation =
  | "skeleton" | "message" | "spinner" | "progress" | "stale" | "none"
  | { kind: "custom"; view: ... };  // 逃逸口，G8 定边界
```

- **解析函数是纯逻辑**：`resolveLoadingPresentation({ scenario, hasData, hasCache, policy }) → Presentation`（真值表单测），页面/组件只消费结果；放无 UI 层（page-kit 或 common），两端组件只负责渲染。
- `units` 的 key 需要页面声明数据单元清单（definition 或 feature 常量），校验器只放行已声明 key，防止拼写漂移；清单形态由 G1 定。
- 骨架预设按端提供（`@blog/desktop-shared` / `@blog/mobile-shared` 导出返回 `AppShellSpec` 的纯函数），`app-shell` 保持纯渲染器。
- 迁移：现仅 mobile-detail 用 `shell`，可平滑换成 `loading.boot`（Option A）；也可保留 `shell` + 新增 `loading`（Option B），由 G1 拍板。

### L2 呈现组件层（两端隔离、逻辑共享）

- 新增/收敛两端 `LoadingView`：Mobile 扩展现有 `StateMessage`（新增形态渲染分支）；Desktop 在 `desktop-shared` 新建，替换散落文案。输入统一为 `{ presentation, label, busy }`。
- `spinner`/`progress` 用 CSS + 内联 SVG 实现，不引动画库；`prefers-reduced-motion: reduce` 时降级为静态指示或文字。
- `stale` 是页面行为约定（保留旧内容 + 可选弱化/刷新指示），由页面 + `query.latest` 协作，不新建状态库。
- a11y：`role="status"`、`aria-busy`、`aria-live`、`aria-label`；遵守 `docs/architecture/ui-ux.md:50,52,62`。
- 桌面/移动 UI 不互导；共享只有类型、解析函数与文案 key。

### L3 运行时生命周期（两端对称）

- `boot`：HTML 静态骨架 → `mountXxxApplication` 创建页面 → 状态确定时 `removeAppShell`（保留双 rAF + 100ms 兜底）；Desktop 补删壳链路。
- `first-load` / `refetch` / `pagination`：页面 feature 调 `resolveLoadingPresentation` 渲染对应形态；`stale` 消费 `latest`，不重画骨架；`none` 不打断。
- `action`：提交中禁用控件 + `aria-busy` + 形态；失败恢复可交互（现有 login/editor busy 行为收敛到同一约定）。
- `background`：默认 `none`，静默刷新。
- 兜底：chunk 失败/超时在 `mountXxxApplication` 内部捕获 → 统一 StartupError + 删壳；数据错误走页面既有 error 态；JS 永不重画骨架。

### L4 缓存渲染（G2）

1. **内存顶住（本期默认）**：`stale` 形态消费 `query.latest`；筛选/重取场景补浏览器证据。
2. **持久化快照（候选，闸门）**：`cache: { mode: "snapshot", ttlMs }`；key = route + 查询参数摘要；启动时未过期直接渲染（可带 stale 标识），后台刷新后替换；仅公开只读页，admin/编辑/预览由校验器拒绝。存储选型（localStorage / CacheStorage）与清理策略由 G2 定，优先复用 `PLAN-MOBILE-PERSISTED-STATE-001` 的持久化原语。
3. **SW 预取泛化**：不默认；先量化收益再决定，页面文档 `no-cache` 是有意设计。

### L5 防线

- `validate.ts` 新规则：形态枚举、场景兼容组合、`units` key 白名单、平台可用性、admin 禁 snapshot；`ops page check` 与 vite 加载期同时 fail fast。
- 单测：解析函数真值表、预设 golden、两端 `LoadingView` 渲染、app-shell 两端 golden。
- 构建测试：`page-template` 的"带壳页面清单 + 两端 CSS import"契约更新。
- e2e：两端 `boot` no-JS 骨架与删壳、layout-shift；`refetch` stale 不闪骨架；`action` busy；chunk 失败/超时兜底；reduced-motion。
- perf：沿用 `ops perf mobile` 基线防劣化；Desktop 度量方式见 G7。

## 约束与依据

- 事实：`FACT-RUNTIME-001`（2C/2GB 单机，低资源）。
- Spec：`SPEC-ARCH-BOUNDARY-001`（端隔离、page-kit 是宿主适配器唯一装配点）、`SPEC-SITE-ROUTES-001`（注册表/路由生成物）、`SPEC-MOBILE-THEME-SETTINGS-001`（首绘主题脚本）。
- 架构：`docs/architecture/ui-ux.md:50,60,62`（加载/错误/空态不跳动、reduced-motion）、`docs/architecture/frontend.md:59`（页面至少处理 loading/success/empty/error）。
- 指南：`docs/guides/testing.md`（浏览器验收独立于 quality check）、`AGENTS.md` 验证标准（UI 改动需浏览器证据）。
- 前序计划：`PLAN-FRONTEND-APP-SHELL-001`（包 + Mobile 详情试点 completed；其恢复条件"重新确认公共页接入范围"由本计划承接）。
- **写集协调（实施前互核，不得并行修改）**：
  - `PLAN-MOBILE-REVEAL-EXPERIENCE-001`（in-progress）：拥有 `packages/solid/page-kit/src/mobile.tsx` 撤壳时序与 H2 预绘制候选（可能改 `#app` 隐藏契约）。W1/W3 在其结论前不得改同名文件与关键 CSS 契约。
  - `PLAN-MOBILE-COMPONENT-EXPERIENCE-001`（active）：`styles/shell.css` 在其写集内；Mobile 骨架样式改动需先协调。
  - `PLAN-MOBILE-PERSISTED-STATE-001`（in-progress）：`createPersistedRecord` 持久化原语；W4 快照优先复用其接口/约定。
  - `PLAN-QUALITY-GOVERNANCE-001`（active）：`ops package check` 中立性误报；L2 扩展包测试时需互核。
  - `PLAN-LOCAL-RESIDENT-DEPLOY-001`（in-progress）：`ops runtime dev` 刚新增 `--admin-entry`；本计划如需新运行参数另立契约。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| W0 决策闸门（G1–G9） | product+pm | 现状基线 | 本 PLAN.md 决策记录 | ready |
| W1 骨架两端泛化 | frontend | W0-G3/G5、MOBILE-REVEAL H2 结论 | `packages/web/app-shell/**`、`page-kit/src/desktop.tsx`、`bootstrap/desktop.tsx`、`validate.ts` 平台规则 | ready |
| W2 加载态组件层 | frontend | W1 | `packages/app/mobile-shared`（StateMessage 扩展、LoadingView）、`packages/app/desktop-shared`（新建 LoadingView）、原子按钮 busy 对齐 | ready |
| W3 配置字段、解析函数与预设 | frontend+build | W0-G1、W2 | `page-kit/src/shared.ts`、`page-build-kit/src/{validate,plugins/page-template}.ts`、两端 shared 预设、`pages.registry.ts` 涉及页 | ready |
| W4 揭幕与兜底 | frontend | W0-G6、MOBILE-REVEAL 结论 | `page-kit` 两端 mount、bootstrap 两端、错误/骨架样式 | ready |
| W5 缓存渲染 | frontend | W0-G2、MOBILE-PERSISTED-STATE 接口 | 页面 features/foundation 消费点、缓存策略纯函数、存储原语接线 | ready |
| W6 推广与证据 | frontend+qa | W1–W5 | 目标页面 definition/样式、`apps/blog/src/e2e/e2e.ts`、perf 基线记录、文档 | ready |

W1/W3 共享 `validate.ts` 与 `page-template.ts`，串行或同一 workstream 内合并；W4 在 Mobile 侧与 REVEAL 计划互斥；W2 与 MOBILE-COMPONENT-EXPERIENCE-001 共享 Mobile 样式须互核。

## 分阶段交付

- **P0 闸门**：确认 G1–G9；确定首批页面清单（建议：Mobile 首页、Desktop 文章档案、Desktop 文章管理、编辑器保存动作）。
- **P1 通用化**：desktop 骨架 + 删壳链路 + 校验放行 + 两端 golden；Desktop 一页冒烟。
- **P2 组件层**：两端 `LoadingView` + `StateMessage` 扩展；散落文案收敛；单测/golden。
- **P3 配置化**：`loading` 字段、解析函数、预设、校验；Mobile 详情迁移且行为不变（回归证据）。
- **P4 揭幕与兜底**：chunk 失败/超时、crossfade（可选）、reduced-motion；e2e 补断言。
- **P5 缓存渲染**：`stale` 场景证据；snapshot 按 G2 决定落地或明确不做。
- **P6 推广收尾**：首批页面全量接入（含 action 场景）、perf 重采样、文档/Spec、RESULT。

## 集成验收

1. **构建/注册**：非法配置在 `ops page check` 与 vite 加载期 fail fast；两端 `renderPageHtml` golden 含骨架顺序与关键 CSS。
2. **解析**：`resolveLoadingPresentation` 真值表覆盖场景 × 形态 × 有无数据/缓存，非法组合有测试。
3. **浏览器**：`ops e2e --mode integration` 覆盖——两端 no-JS 骨架、挂载删壳、layout-shift ≤ 0.01；筛选不闪骨架；提交忙碌；chunk 失败/超时兜底可见可重试。
4. **性能**：`ops perf mobile --mode integration --runs 3` 相对当前基线（nav-switch content 51–63ms 量级、缓存命中不降、cold-load 不劣化）无回归；Desktop 按 G7 补证据。
5. **门禁**：改动范围 `ops quality check` 全绿；包改动 `ops package check` 通过；受影响包单测/golden 全绿。
6. **文档**：字段/形态/缓存策略有 Spec 或架构落点；接入指南含最小示例与反面规则（admin 禁 snapshot、形态兼容表）。

## 未决项（决策闸门）

- **G1 形态集合与配置 schema**：是否含 `progress`/`custom`；`units` key 的声明方式；Option A（统一 `loading`，推荐）vs Option B（保留 `shell` + 新增 `loading`）。
- **G2 缓存深度**：只做内存顶住，还是允许公开页持久化快照；存储选型、TTL、stale 标识、清理策略。
- **G3 首批页面与两端范围**：Desktop 公共页先做哪页；admin 是否本轮（骨架允许、快照禁止）。
- **G4 与 MOBILE-REVEAL H2 的关系**：等结论再动揭幕契约，还是先做不涉及 `#app` 隐藏的部分（推荐后者，W1/W2 可先行）。
- **G5 契约落点**：新建 `SPEC-PAGE-LOADING-001`，还是并入 `SPEC-ARCH-BOUNDARY-001`/`page-kit` 文档。
- **G6 兜底形态**：统一错误页、`noscript` 文案，还是仅删壳露出页面自身错误态。
- **G7 Desktop 性能证据**：`ops perf` 扩展桌面旅程，还是 e2e filmstrip + 人工截图。
- **G8 组件归属与逃生口**：两端 `LoadingView` 的共享边界（类型/解析共享、UI 隔离）；`custom` 是否开放、开放到什么程度。
- **G9 action 场景范围**：提交/按钮 busy 是否纳入本期（现有原子已支持，纳入成本低，推荐纳入）。

## 收尾要求

- 按 Plan 语义收尾（允许 `partial`/`parked`）：记录实际交付形态/页面、未交付项、证据（命令、产物目录、截图）、停止原因与恢复条件，写入同目录 `RESULT.md`。
- 若 G2 选择持久化快照，必须同步 admin 排除规则与清理策略，否则不得标记完成。
