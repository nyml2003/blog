---
kind: plan
id: PLAN-UI-ICON-CONTROLS-001
status: completed
owner: project-manager
created: 2026-09-28
last_reviewed: 2026-09-29
---

# 图标与控件文案整理

## 目标

让常见操作更易扫描，同时保持明确的操作含义和无障碍名称。用一致的图标替换当前零散的字符符号；只在含义熟悉、周围语境充分的控件上减少可见文字。文章内容、状态反馈和需要判断后果的操作保持文字。

## 当前基线

- `src/frontend/package.json` 已声明 `lucide-solid@1.48.0`；新 Mobile 已使用 Lucide，旧 Mobile 与旧 Desktop 的部分返回、前进、导航和状态提示此前仍使用字符图形。
- 新旧 Mobile 各有一个 `IconButton`，均要求 `ariaLabel`，但图标由调用方传入，没有统一图标来源或悬浮提示契约。
- 新旧 Mobile 底部导航均展示符号和可见文字；现行 `docs/architecture/ui-ux.md` 明确 Mobile 不依赖 hover/tooltip，主要触控目标不小于 44px。
- Desktop 与 Mobile 的 UI、DOM、CSS 和内部状态必须隔离；新 `app/` 运行时不能导入旧组件库。

## 决策顺序

1. 盘点公开 Mobile、公开 Desktop 和管理端现有控件，记录当前标签、动作、状态、触控/键盘使用方式与图标候选；先区分装饰性符号和承担操作含义的图标。
2. 记录现有 `lucide-solid` 方案的版本、许可、按图标导入、构建兼容性和维护成本；继续使用该受控来源，不新增图标框架或重复封装。
3. 定义图标清单和语义用法：同一动作在各端使用同一含义，但 Desktop/Mobile 分别实现 UI 封装；图标尺寸、笔画、对齐和 active/disabled 状态由各端组件控制。
4. 先做公开 Mobile 导航与文章详情的可见样例，核对窄屏、触控和读屏；确认可读性后，再决定公开 Desktop 与管理端的具体替换范围。

## 文字与图标边界

| 场景 | 默认呈现 | 理由 |
| --- | --- | --- |
| Mobile 底部导航 | 图标 + 可见短标签 | 三项导航虽高频，但触屏没有可靠的悬浮提示；标签帮助区分“推荐”和“文章” |
| 返回、设置、筛选、外链等熟悉操作 | 可用图标；空间允许时保留短标签 | 仅在目标和作用清楚时使用纯图标，不能让图形承担独有的业务解释 |
| 文章标题、分类名、筛选选项、主要行动 | 保留可见文字；图标只辅助 | 内容名称和行动目标需要可读、可扫描 |
| 加载、空状态、错误、保存结果 | 保留状态文字和恢复动作；图标只辅助 | 用户需要知道发生了什么、下一步能做什么 |
| 删除、发布、下架等有后果的管理操作 | 保留明确文字或紧邻的文字说明 | 不能只凭图标猜测后果 |

纯图标按钮与链接必须有与动作一致的可访问名称，如 `aria-label`；装饰性图标从读屏顺序中隐藏。Desktop 的纯图标控件提供悬浮提示，并保留键盘焦点样式；Mobile 不以悬浮提示作为理解操作的前提。相同操作的提示、可访问名称和实际行为必须一致。

## 成功标准

1. 图标来源决策有证据，项目只保留一套受控的图标语义清单；新旧 Mobile 与 Desktop 可以各自封装，不互相导入 UI。
2. 试点范围内的字符符号由统一图标替代；所有纯图标控件都有可访问名称，Desktop 有悬浮提示，Mobile 在无 hover 下仍可识别。
3. 减字前后，页面标题、文章信息、主要行动、错误/加载/空状态和管理端高后果操作的意义没有丢失；底部导航保留可见标签。
4. 触控目标、键盘焦点、active/disabled/loading 状态、窄屏换行与对齐符合现行 UI 约束；不因图标替换导致布局跳动或功能变化。
5. 试点通过相关组件测试、前端 typecheck/lint/format/build，并有 Mobile 窄屏、Desktop 键盘/悬浮及读屏名称的验收记录；跨模块或共享契约变更再运行 `ops quality check`。

## 非目标

- 不把全站所有文字压缩为图标，也不更改文章内容、产品文案语义或导航层级；
- 不以图标重画替代 Lucide/封装方案评估，不为单个控件引入整套新 UI 框架；
- 不跨端共享 JSX、CSS、DOM 或组件内部状态；
- 不改变 API、路由、文章状态和管理操作的行为；
- 不要求本计划一次完成全部旧页面与管理端控件的迁移。

## 约束与依据

- `AGENTS.md`：Desktop/Mobile UI 隔离、`common` 无 UI、按改动风险验证；依赖修改留在项目 manifest/lockfile。
- `docs/architecture/ui-ux.md`：内容优先、Mobile 不依赖 hover/tooltip、底栏三项导航、触控目标与焦点要求。
- `docs/architecture/frontend.md` 与 `docs/specs/SPEC-ARCH-BOUNDARY-001.md`：新旧运行时及组件依赖方向。
- 图标选择和减字范围属于本计划的实施决策；若拟改变底栏标签或有后果操作的可见说明，须先取得产品决策。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 控件盘点与图标决策 | design+frontend | - | 本计划、控件清单与图标方案记录 | completed |
| Mobile 公开端试点 | frontend | 图标决策 | `src/frontend/app/habitat/mobile/**`、相应 Mobile 测试与样式；涉及旧 Mobile 时串行处理 `src/frontend/mobile-ui/**`、`src/frontend/mobile/**` | completed |
| Desktop 与管理端范围评估 | design+frontend | Mobile 试点 | 本计划验收记录；确认范围后另列 `src/frontend/desktop-ui/**`、`src/frontend/desktop/**` 的具体写集 | completed |
| 集成验收与收尾 | frontend+pm | 前述工作流 | 本计划结果、必要的架构/指南更新 | completed |

工作流按依赖推进；若选择新增依赖，`src/frontend/package.json` 与 `src/frontend/pnpm-lock.yaml` 由图标决策工作流单独负责。与页面编排计划触及同一 Mobile 文件时，先协调写集并串行修改。

## 集成验收

1. 对照控件清单逐项检查图标含义、可见文字、`aria-label`、提示、实际动作与焦点/禁用状态；纯图标控件必须能被键盘和读屏识别。
2. 在 Mobile 窄屏和宽屏检查底栏、返回、筛选和文章详情；在 Desktop 检查鼠标悬浮与键盘焦点。分别记录截图和交互结果，构建通过不替代浏览器验收。
3. 运行与实际修改范围对应的测试、静态检查和构建；记录未验收的端与页面，不将试点成功写成全站完成。
4. 收尾记录实际交付、未交付控件、采用或拒绝 Lucide 的理由，以及后续推广条件。

## 收尾记录

- 实际交付：新旧 Mobile、公开 Desktop 和管理预览中的方向、导航、状态字符图形统一替换为 `lucide-solid`；保留底栏、返回入口、状态反馈和高后果操作的必要文字。
- Mobile CSS 同步修正：视口高度使用 `svh`，移除窄屏 `min-width` 限制，补齐顶部 safe-area，并阻止页面级横向溢出。
- 自动化证据：`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm test:frontend`（114 项通过）、`pnpm build`、`git diff --check` 均通过。
- 人工验收：用户确认 Mobile 窄屏/宽屏、Desktop 键盘与悬浮、读屏名称和图标对齐均通过。
- 未交付：无。本计划不扩展到新增 UI 框架、API、路由或管理操作语义变更。
- 采用理由：仓库已有 `lucide-solid@1.48.0`，按图标导入，与 Solid/Vite 构建兼容；各端继续独立封装，不共享 JSX、CSS 或内部状态。
