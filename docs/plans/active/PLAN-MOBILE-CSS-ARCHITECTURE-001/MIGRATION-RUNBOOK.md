---
kind: migration-runbook
plan_id: PLAN-MOBILE-CSS-ARCHITECTURE-001
status: ready
owner: mobile-css-architecture
depends_on: [STYLE-INVENTORY.md, ATOM-CONTRACT.md, REGRESSION-BASELINE.md]
write_set: [docs/plans/active/PLAN-MOBILE-CSS-ARCHITECTURE-001/MIGRATION-RUNBOOK.md]
last_reviewed: 2026-09-05
---

# C Mobile CSS 迁移执行蓝图

## 目标与硬边界

本 Runbook 是 CSS 文件/class 迁移的执行顺序和验收合同，不授权当前页面提前消费原子。迁移完成后，既有 Mobile 页面必须保持 DOM 语义、请求/路由、Filter 焦点管理、Shelf scrollspy、详情返回和文章正文渲染行为；原子库继续作为独立、未接入的受控 UI 层。

明确不在本 Runbook 内：Desktop 代码或样式、`ui.tsx` 业务重构、页面数据流、Client SDK、分子抽取、文章 HTML 编辑器/Web Components、正文 sanitization 和 002 信息密度改造。

## 模块拆分顺序

按依赖从低到高执行，每一步完成独立的静态检查和必要的浏览器回归后再进入下一步。新文件的建议位置为 `web/mobile/styles/`；当前旧入口在全部步骤完成前保留为回滚锚点。

| 步骤 | 新/目标文件 | 负责内容 | 允许依赖 | 不得承担 | 独占 write set |
| --- | --- | --- | --- | --- | --- |
| 0 | 旧 `styles.css`、`filter.css` | 建立迁移前快照、selector inventory 和基线截图/手工记录。 | 现有源码与固定 fixture。 | 不改视觉、不补新 class。 | 迁移负责人自己的基线记录。 |
| 1 | `styles/tokens.css` | 颜色、表面、前景、焦点、边框、圆角、尺寸、层级、安全区、motion 的语义 token。 | 无。 | 不放组件 selector、页面 margin 或领域颜色逻辑。 | `web/mobile/styles/tokens.css`。 |
| 2 | `styles/base.css` | `box-sizing`、html/body、原生元素 reset、全局 focus-visible、reduced-motion。 | `tokens.css`。 | 不放业务状态、Filter scroll lock 或正文排版。 | `web/mobile/styles/base.css`。 |
| 3 | `styles/atoms.css` + `src/atoms/**`（已完成、保持隔离） | 九个批准原子的原生语义、受控状态、触控尺寸和独占样式。 | `tokens.css`、`base.css`。 | 不读取 SDK/路由/全局状态，不承担业务布局或页面间距。 | `src/frontend/mobile-ui/styles/atoms.css`、`src/frontend/mobile-ui/atoms/**`；本次 CSS 迁移不得改写。 |
| 4 | `styles/shell.css`、`styles/layout.css` | Skip link、Mobile header/brand、主容器、BottomNav，以及不带业务语义的布局原语。 | `tokens.css`、`base.css`；可引用已稳定 atoms，但不覆盖其内部。 | 不放 Shelf、Filter、详情、文章条目规则。 | `web/mobile/styles/shell.css`, `layout.css`。 |
| 5 | `styles/components.css` | `ArticleRow`、`StateMessage` 等共享业务组件及内部稳定结构。 | token/base/shell/layout。 | 不吸收 Shelf、Filter、页面编排、正文主题或数据读取。 | `web/mobile/styles/components.css`。 |
| 6 | `styles/shelf.css` | Shelf layout/index/section/card、sticky、scrollspy 视觉和 Shelf 私有状态。 | token/base/shell/layout/components（仅按需）。 | 不修改 scrollspy 逻辑，不变成通用 grid 或 Link 卡。 | `web/mobile/styles/shelf.css`。 |
| 7 | `styles/filter.css` | Filter trigger/backdrop/panel、字段编排、日期网格、操作区。 | token/base/shell/layout/atoms（仅未来显式消费时）。 | 不实现请求、筛选业务、焦点圈定、滚动锁定或恢复焦点；这些仍属 `FilterPanel` 逻辑。 | `web/mobile/styles/filter.css`。 |
| 8 | `styles/detail.css` | 阅读栏、详情外围、metadata/footer；仅详情页外围结构。 | token/base/shell/layout/atoms（仅未来显式消费时）。 | 不放 Shelf/Filter 规则，不改 002 的信息密度决策。 | `web/mobile/styles/detail.css`。 |
| 9 | `styles/article-body.css` | `.article-body` 受控 HTML 主题、标题/段落/代码/表格/图片/引用/链接。 | token/base。 | 不读取作者 class，不开放 inline CSS，不处理内容存储或 sanitization。 | `web/mobile/styles/article-body.css`。 |
| 10 | `styles/pages.css` + 最小入口文件 | 首页、文章库、详情的页面节奏和不能稳定归属组件的局部规则；建立固定 import 顺序。 | 全部已冻结模块。 | 不覆盖原子/业务组件内部，不创造一次性通用 class。 | `web/mobile/styles/pages.css` 与页面 CSS 入口。 |

建议入口顺序：`tokens -> base -> atoms -> shell -> layout -> components -> shelf -> filter -> detail -> article-body -> pages`。实际 import 只能在每个模块通过静态扫描后调整；不得以 CSS Cascade Layer 作为未审定的隐式解决方案。

## Class 改名与选择器替换策略

1. 先建立旧 class 到新 class 的一对一表，再同时修改其 CSS 声明和唯一消费者；不允许先删 CSS 再让页面进入“无样式”状态。
2. 只有职责确实变清楚时改名：裸状态改为所属根的 `.is-active`、`.is-empty`、`.is-loading`、`.is-error`；组件内部的位置选择器改为稳定的内部 class；页面和业务根 class 保持领域可读性。
3. 语义元素不能因外观共用而互换：`<a>` 保持 Link，`<button>` 保持 Button；`.primary-action` 与 `.apply-button` 必须拆成不同的拥有者。Button 不获得 `href`，Link 不模拟 disabled。
4. 页面祖先选择器逐步降级为“组件根 + 受控 modifier”：例如 `.page-heading h1, .detail-header h1` 由 Heading 的显式 `as/size` 承接；页面只保留标题区间距。
5. 暂时不删除孤儿 selector。`.meta`、`.back-button`、未使用的参数/入口先做全仓静态搜索；确认无模板或静态页面引用后，单独记录删除证据。
6. 保留 `.article-body` 及其受控语义后代的深层选择器；对 Shelf、Filter、详情和业务组件，仅允许稳定 root 内部结构选择器，不允许 `.page .component` 覆盖共享组件。
7. 不用 `!important` 解决迁移冲突。Filter 的 `.check` 与 `.filter-panel label` 应先分离字段布局和 Checkbox 尺寸，再删除覆盖。
8. 所有原始色值先映射到 token 再移动规则；内容主题的代码色、引用色可以是内容专属 token，但不能回流到通用原子。

## 原子层隔离规则

`src/atoms/index.ts` 是未来调用方唯一入口，`styles/atoms.css` 是原子 CSS 唯一所有者。CSS 拆分阶段不修改现有 `ui.tsx`、页面 JSX 或 `styles.css` 中的消费者 class；不要为了证明组件可用而在业务页面增加隐式 import。

原子只接收可渲染 Props 和事件回调。数据读取、请求、异步生命周期、错误归一化、重试/取消、缓存、路由、Filter/Shelf 状态机必须继续由 Client SDK、Solid adapter、业务组件或页面处理。原子接入是 CSS 迁移和回归完成后的独立变更，须引用本 Runbook、`ATOM-CONTRACT.md` 与 `REGRESSION-BASELINE.md`，不能与模块拆分同一提交混合。

## 每步验证与回滚点

每个步骤都形成一个可回退点：保留旧入口文件、旧 class 对照表和前后文件清单；新模块在入口未切换前不影响运行页面。切换入口后若发现回归，优先回退入口而不是临时添加父选择器或 `!important`。

| 回滚点 | 切换条件 | 必须记录的证据 | 失败时动作 |
| --- | --- | --- | --- |
| R0 基线 | 固定 fixture、路由和视口已记录。 | `REGRESSION-BASELINE.md` 场景状态、before 截图/手工记录。 | 不开始拆分。 |
| R1 token/base | token 命名与 reset 通过静态扫描。 | 无 raw color 扩散、import 顺序、typecheck/build。 | 恢复旧 `styles.css` 入口，修正 token 映射。 |
| R2 shell/layout | 壳层与布局独立、无页面横向溢出。 | NAV、safe-area、focus、视口记录。 | 回退 shell/layout 入口，保留 token/base。 |
| R3 components/shelf | ArticleRow/State/Shelf 选择器完全归属。 | HOME、SHELF、loading/empty/error、sticky/scrollspy。 | 回退最后切换的业务模块，不动已通过模块。 |
| R4 filter | Filter 样式统一入模块且旧 `filter.css` 已合并。 | FILTER-01 至 FILTER-04、焦点圈定、滚动锁定、360px 表单。 | 回退 Filter 入口；禁止用祖先覆盖掩盖问题。 |
| R5 detail/article-body/pages | 详情和正文可独立定位，页面局部规则最小。 | DETAIL-01 至 DETAIL-04、正文宽表/图片/代码溢出。 | 回退详情/正文/页面入口，保护 002 基线。 |
| R6 原子接入（未来独立） | CSS 架构全验收且 API 已冻结。 | 原子单测、调用方 typecheck、全量回归对照。 | 完整撤回消费者接入，原子目录仍可独立存在。 |

## 验收证据合同

- 静态：每个旧 selector 都有唯一目标模块；没有跨模块同名声明、深层页面覆盖、未解释的 raw color 或新增 `!important`；Desktop 无 import 变化。
- 构建：运行项目规定的 `ops workspace doctor`、`ops quality check`、`pnpm --dir web typecheck`、`pnpm --dir web lint`、`pnpm --dir web format:check`、`pnpm --dir web build`；既有与本计划无关的失败必须单独标注，不能冒充 CSS 通过。
- 浏览器/人工：按 `REGRESSION-BASELINE.md` 的固定数据、路由、320/360/375/390 portrait 与 812x375 landscape 视口检查推荐页、文章库、Shelf、Filter、详情、加载/空/错状态、键盘焦点、safe area、reduced motion 和正文溢出。
- 可访问性：交互目标至少 44px；按钮/链接原生语义不互换；Filter dialog 的 Escape、Tab trap、焦点恢复、body scroll lock 保持；状态不只用颜色表达。
- 交付：提供模块 import 图、class 对照表、回滚点结果和 before/after 证据；未完成的页面接入和原子消费必须明确列为 deferred，而不是通过编译即视为完成。

## 当前执行结论

CSS 拆分可以在不改现有消费者的前提下启动，顺序从 token/base 开始，最终才切换页面入口。原子源码和 `atoms.css` 已具备独立交付条件，但在本阶段保持不接入。`PLAN-MOBILE-DENSITY-002` 继续等待 R5 完成后修改详情/正文；任何需要新增原子 Props、分子或业务组件的需求必须回到 PM 审定范围。

## 未决问题

- 是否启用 CSS Cascade Layer：在 R1 静态扫描后由 PM 决定，不作为冲突兜底。
- `mobile-shell` 当前是无样式根 class；是否保留只在入口切换前确认其是否作为 shell scope 使用。
- `.meta`、`.back-button` 是否存在静态模板消费者；搜索证据完成前不删除。
- 现有质量门禁若仍有非 CSS 的 typecheck/lint/format 失败，应由对应 owner 修复或显式登记，不扩张本迁移写集。
