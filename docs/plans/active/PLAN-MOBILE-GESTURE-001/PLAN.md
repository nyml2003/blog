---
kind: plan
id: PLAN-MOBILE-GESTURE-001
status: ready
owner: project-manager
created: 2026-09-17
last_reviewed: 2026-09-17
---

# 手势组件接入 blog：workspace 收编 + mobile-ui 包装层 + 浏览页筛选 sheet

## 定位与范围裁定

2026-09-17 用户拍板"把这块（手势组件）融到现在的 src 里"。当日评估结论作为本计划依据：

- **资产不搬家**：`nested-gesture`（协议核）与 `gesture-web`（web 绑定）留在 `packages/`，不 vendor、不发布——vendor 会在协议核出现真消费者的前夜 fork 它（pnpm/turborepo monorepo 惯例：workspace 消费，单一事实源）；此路同时为 PLAN-PAGE-RUNTIME-001 的 blog 接入期预先铺好 workspace 通路。
- **首个真实消费者 = 移动端浏览页筛选 BottomSheet**（自决裁定，业界依据）：Material Design 把 filter/refinement 列为 bottom sheet 首要用例，内容类 App 的标准形态是"紧凑筛选指示条 + sheet 内草稿/应用"；当前一级竖栏是桌面/平板 two-pane 习语，常驻吃掉移动端左栏宽度。该场景开合高频，拖拽关闭手势有真实价值，且正是 PLAN-PAGE-RUNTIME-001 验收第 1 条"sheet 筛选、back 关 sheet 且草稿保留"的预演。
- **手感维持 2026-09-12 冻结水平**：本计划只做产品化必需的正确级修正（主题、Escape、reduced-motion），不做吸附/fling/动画精度调参（`docs/guides/mobile-web-gestures.md` §七）。

**D7 修订记录（2026-09-17，用户指示所致）**：`@fluvient-loom/gesture-web` 及其依赖 `nested-gesture` 允许接入 blog；其余 loom 包维持"workspace 私有、不发布、不接入业务"。本计划**不是** PLAN-PAGE-RUNTIME-001 的 blog 接入：不碰导航栈/快照/保活池；sheet 按 2026-09-12 拍板是纯页面 UI，不进历史。

## 交付

| 件 | 位置 | 说明 |
| --- | --- | --- |
| workspace 收编 | `pnpm-workspace.yaml` 等 | `src/frontend` 加入 workspace；blog-web 以 `workspace:*` 依赖 `@fluvient-loom/gesture-web`；单一 lockfile（删 `src/frontend/pnpm-lock.yaml`） |
| gesture-web 产品化修正 | `packages/gesture-web/src/` | 颜色改 CSS 变量（穿 shadow DOM，fallback 现值）；Escape 关闭派发 `dismiss`；`prefers-reduced-motion` 下过渡时长归零；摘除 `data-sheet="list"` playground 遗留。全部正确级，非手感 |
| mobile-ui 包装层 | `src/frontend/mobile-ui/containers/` | 薄 Solid 包装（暂名 `bottom-sheet.tsx`，命名随 mobile-ui 惯例）：openTo/close/`dismiss`→回调、slot 透传、scroll-view 用法封装；JSX IntrinsicElements 类型（bottom-sheet / scroll-view / sticky-list-view）；页面代码不直接摸 custom element（Ionic `@ionic-react` 式 WC+包装层分工） |
| 浏览页筛选 sheet | `src/frontend/mobile/src/` | CategoryShelfPage：一级竖栏 + 二级 tabs → 紧凑筛选指示条（当前选择摘要 + "筛选"入口，`aria-expanded`）+ sheet 内 L1/L2 级联草稿、重置/应用；应用走既有 pushState 流，URL 语义零变更；拖拽关闭/Escape 保留草稿（草稿存页面级 signal，导航离开才消亡）；sheet 内容滚动用 scroll-view（列表顶部下拉移交关闭） |
| 死代码清理 | `src/frontend/mobile/src/components/browse.tsx` | `BrowseTypeRail` / `BrowseCascade` 无消费者（旧三级语义遗物），随本页写集删除 |
| 文档 | specs / README | SPEC-MOBILE-BROWSE-IA-001 呈现条款随验收修订（"L1 左侧 tab"→ 筛选 sheet；该 spec 三级语义本已被一级/二级分类树部分取代，一并理顺）；plans README 登记与 D7 修订记录 |

## 非目标

- 手感打磨（吸附曲线、fling rAF 通道、动画精度）——冻结中；
- StickyListView 的页面级消费者——包装层落地即可，等分组列表/TOC 类需求另接；
- sheet 的导航语义（`form: sheet`、历史栈、快照、保活池）——归 PLAN-PAGE-RUNTIME-001；
- gesture-web 自建 DOM 测试设施（现无测试；本计划靠包装层信号级测试 + 集成走查覆盖）；
- 桌面端、gesture-web 发布到 registry、其余 loom 包接入。

## 约束与依据

- 事实：`src/frontend`（blog-web）现为 workspace 外独立安装（自带 lockfile 与 node_modules）；`apps/playground` 是 gesture-web 唯一消费者；浏览页 = `CategoryShelfPage`（articles / article-list 共用）左侧一级竖栏 + 二级横 tabs + 卡片流，筛选状态进 URL（`browse-filter.ts`），历史/滚动恢复已完备（`category-browser.ts`）；SPEC-MOBILE-BROWSE-IA-001（accepted）含"L1 左侧 tab"呈现条款。
- 平台依据：`docs/guides/mobile-web-gestures.md` 的行为矩阵与坑位图（touch-action 许可语义、popover/scrim 挂载、dvh、LAN HTTP secure context 静默缺失）；2026-09-12"sheet 不进历史"拍板。
- 业界依据：workspace 消费不 vendor；WC + 框架薄包装层（Ionic 先例）；CSS custom properties 是穿 shadow DOM 的标准主题通道；筛选 sheet 草稿/应用语义（Material Design bottom sheet 指南）。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| W1 workspace 收编 | infra | - | `pnpm-workspace.yaml`、root `pnpm-lock.yaml`、`src/frontend/pnpm-lock.yaml`（删）、`src/frontend/package.json`、`ops/src/application/package-check.ts`（仅当 `pnpm -r` 枚举行为变化需适配） | ready |
| W2 gesture-web 产品化修正 | frontend-mobile | W1 | `packages/gesture-web/src/**` | ready |
| W3 mobile-ui 包装层 | frontend-mobile | W1（与 W2 并行） | `src/frontend/mobile-ui/**`、`src/frontend/tests/mobile-ui/**`、`src/frontend/vite-env.d.ts` | ready |
| W4 浏览页筛选 sheet | frontend-mobile | W2、W3 | `src/frontend/mobile/src/**`、`src/frontend/tests/mobile/**` | ready |
| W5 文档与验收 | project-manager | W4 | `docs/specs/SPEC-MOBILE-BROWSE-IA-001.md`、`docs/plans/README.md`、`docs/FACTS.md` / `docs/architecture/ui-ux.md`（仅当沉淀出事实） | ready |

W1 验证清单：`pnpm install` 后 root `pnpm check` 全绿；`src/frontend` 的 `typecheck` / `lint` / `format:check` / `test:core` / `build` 全绿；`ops package check`、`ops quality check` 全绿；`ops runtime dev` 页面可开。风险注记两条：blog tsconfig（Bundler 解析）对 exports→`.ts` 源码直出的解析若不通过，fallback 为 blog tsconfig `paths` 映射；`allowBuilds` 若拦 biome/oxlint 二进制按实际报错补条目（现仅 esbuild）。

W3 测试走 blog 既有 `tsx --test` 管线，信号与回调级（不建 DOM 设施）；W4 逻辑测试进 `tests/mobile/logic/`，走查清单见集成验收。

## 集成验收

1. 门禁全绿：root `pnpm check` + blog `test:core` / `build` + `ops quality check` + `ops package check`；
2. 375px 视口走查：筛选入口开合与 `aria-expanded`；L1→L2 级联选择；应用后 URL、列表、卡片一致，刷新可复现；grabber 拖拽关闭与 sheet 内列表顶部下拉移交关闭；scrim 点击与 Escape 关闭；系统返回键 = 离开页面（sheet 不进历史，按 2026-09-12 拍板的语义显式验证）；深色主题下 sheet 配色随主题；`prefers-reduced-motion` 模拟下无过渡时长；
3. 草稿保留：开 → 选 → 拖关 → 再开，草稿在；应用或导航离开后回到"URL 即真相"；
4. 真机抽查可选（LAN HTTP 时注意 guide 的 secure context 缺失项）。

## 未决项

- sticky-list-view 的首个页面消费者（出现分组列表需求时接，如详情 TOC / 标签分组）；
- gesture-web 测试设施（jsdom / playground 级集成测试，若未来要发布或重构再立项）；
- page runtime 落地后本包装层与 `form: sheet` 的合流方式（预计升级为手势基座，届时另裁）；
- fling rAF 通道接入（nested-gesture README 已留缝，冻结中）。
