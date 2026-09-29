---
kind: plan
id: PLAN-FRONTEND-MOBILE-ROLLOUT-001
status: partial
owner: project-manager
created: 2026-09-29
last_reviewed: 2026-09-29
---

# 新 Mobile 页面逻辑全面收敛

## 目标

把 `src/frontend/app/` 的公开 Mobile 页面统一到已在文章详情试点验证的职责边界：组合根负责启动、路由清单和宿主能力；页面级逻辑负责参数、请求、取消、重试和导航目标；页面负责状态编排；组件只渲染数据并处理局部交互。推广按页面逐步验收，不要求一次性重写所有页面。

## 前置证据

- 归档的 `PLAN-FRONTEND-PAGE-COMPOSITION-001` 已完成新 Mobile 文章详情试点，状态为 `partial`。
- 详情试点已验证后端返回文章 `href`、Resource 生命周期、同源返回与文章库兜底、失败重试和 Mobile 图标控件。
- 详情试点未覆盖首页、文章库、文章检索和设置页，不能直接假定它们适合共享同一套页面级逻辑。

## 范围

- 新公开 Mobile：`mobile-home`、`mobile-articles`、`mobile-article-list`、`mobile-settings`、`mobile-article-detail`。
- 首页推荐筛选、文章库分类选择、文章检索参数、设置保存、详情请求和各页面的加载/失败/空状态。
- 文章卡片和壳层导航使用后端 `href` 或 site-routes 清单；前端不拼页面 URL。
- 在真实页面重复出现并经过测试证明有益的纯逻辑才抽取；组件局部状态继续留在组件内部。

## 成功标准

1. 上述新 Mobile 页面逐页完成职责检查：页面不直接读 `location`、不直接访问 API/transport/storage、不拼页面 URL、不持有完整宿主 context。
2. 参数解析、请求竞态、取消、重试、错误、空内容、浏览器前进后退和新标签页行为均有对应的自动化测试；页面入口和 site-routes 引导保持可重试失败态。
3. 首页、文章库、文章检索和设置页的已有业务行为、API/wire、文章可见性、首绘设置和 URL alias 不变。
4. Desktop、旧 Mobile 与新 `app/` Mobile 的 UI、DOM、CSS、内部状态和运行时依赖方向保持隔离。
5. 新 Mobile 相关页面完成代表性窄屏/宽屏浏览器验收；交互、响应式、无横向溢出和图标控件可访问性均有证据。
6. 试点后的重复代码、保留的页面差异、未迁移内容和继续推广条件记录在结果中；允许以 `partial` 收尾。

## 非目标

- 不迁移 Desktop、旧 Mobile 或管理端页面。
- 不引入路由框架、SPA 化、SSR、页面基类、全局控制器或跨运行时 UI 共享。
- 不改变公开 API、wire DTO 语义、文章状态、文章可见性、页面 alias 或后端领域规则；新增字段必须另有明确契约依据。
- 不把所有加载/错误视图机械抽成全局组件；重复证据不足时保留页面本地实现。
- 不把局部开关、输入焦点、标签选择等组件状态上移到页面级逻辑。

## 约束与依据

- `docs/specs/SPEC-ARCH-BOUNDARY-001.md`：新 `app/` 使用 habitat API/Resource 和 kernel ports，Desktop/Mobile UI 隔离。
- `docs/specs/SPEC-SITE-ROUTES-001.md`：路由来自后端清单；条目详情链接来自后端数据；引导失败不得回退到前端字面量路径。
- `docs/specs/SPEC-MOBILE-THEME-SETTINGS-001.md`：Mobile 首绘设置、主题、字体和设置保存边界保持现状。
- `docs/architecture/frontend.md`：仅作为实现快照，实施时以源码、配置和测试为准。
- 详情试点归档：`docs/plans/archive/PLAN-FRONTEND-PAGE-COMPOSITION-001/PLAN.md`。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 页面基线与重复逻辑清单 | frontend+pm | - | 本计划、页面职责矩阵和测试设计；不改产品源码 | completed |
| Mobile 文章库与检索页 | frontend | 基线清单 | `src/frontend/app/bootstrap/mobile/articles.tsx`、`article-list.tsx`、对应 pages/logic/tests、文章卡片使用处 | completed |
| Mobile 首页推荐页 | frontend | 文章库与检索页 | `src/frontend/app/bootstrap/mobile/home.tsx`、对应 page/logic/tests、推荐筛选调用处 | completed |
| Mobile 设置页 | frontend | 基线清单 | `src/frontend/app/bootstrap/mobile/settings-page.tsx`、对应 page/logic/tests；不得改首绘模块契约 | completed |
| 详情页回归与共享逻辑收敛 | frontend | 前述页面至少两个完成 | 详情试点相关 logic、共享纯函数和测试；仅保留有真实重复证据的抽取 | completed |
| 新 Mobile 集成验收与收尾 | frontend+pm | 上述工作流 | 本计划结果、职责矩阵、浏览器证据和必要架构记录 | partial |

工作流按依赖串行推进。首页、文章库和文章检索写集可能交叉使用 `ArticleCard` 与 Mobile API 类型，由同一 owner 串行修改。`PLAN-UI-ICON-CONTROLS-001` 若仍在执行，图标依赖和控件写集必须先协调，不重复修改同一文件。

## 集成验收

1. 逐页面对照迁移前后：有效/无效参数、加载、成功、空数据、请求失败、重试、取消和过期结果。
2. 验证首页筛选、文章库分类、文章检索 URL 状态、设置保存与恢复、详情返回和文章卡片新标签页行为。
3. 检查 import、参数和调用链：页面不持有完整 context，组件不访问 API/路由宿主能力，详情链接由响应数据提供。
4. 验证页面 registry、HTML 入口、site-routes、Mobile 首绘设置、主题字体和新旧运行时边界无回归。
5. 运行改动范围对应的 TypeScript 格式、typecheck、lint、相关测试、构建；跨模块契约或运行时接线变化时运行 `ops quality check`。
6. 使用至少一个窄屏和一个宽屏浏览器视口，记录页面可达性、交互、截图或像素证据及未执行检查。

## 未决项

- 文章库、文章检索和首页是否需要同一个请求协调函数，还是只共享参数解析和状态类型；由两个以上页面的重复测试决定。
- 设置页现有资源和保存逻辑是否已满足页面级边界；若无需移动，不为形式统一而重构。
- 各页面失败/空状态是否足够相似以共享视图函数；必须先有真实重复证据。
- 本计划是否覆盖全部五个页面，还是在文章库与首页验收后以 `partial` 收尾；取决于收益、回归风险和写集冲突。
- 是否在本计划结束后再处理旧 Mobile；它不自动成为本计划待办。

## 执行结果

### 已交付

- 首页、文章库、文章检索和设置页改为接收页面专用输入；壳层导航只接收路由清单。
- 首页推荐、文章分类参数、分类导航、设置读取/保存/补偿和详情请求分别收敛到 `logic` 层；页面只负责状态展示和局部交互。
- 文章卡片继续使用后端返回的 `href`；未改变公开 API、wire DTO、文章可见性、首绘设置或页面 alias。
- 新增分类参数与导航测试，以及页面宿主能力边界回归测试；资源层已有测试覆盖过期结果、取消和重取。
- `ops quality check` 除首次发现并修复的 lint 警告外，其余 Rust、类型检查、格式、核心测试、构建和架构边界均通过；修复后 `pnpm lint` 已通过。

### 未完成与证据限制

- 未完成 Playwright 窄屏/宽屏浏览器验收。当前环境没有 `playwright-core` 或 Chromium；项目 Flake 获取依赖时仍缺少浏览器模块，因此没有截图、像素或真实交互证据。
- 现有自动化覆盖 API、参数、设置、资源竞态/取消和源码边界；首页、文章库、设置页的完整渲染级交互仍需浏览器环境补验。
- 继续推进条件：提供项目要求的 Playwright 模块和 Chromium 可执行文件后，运行 `ops e2e` 的 `dev` 场景及 `integration` 场景，补录至少一个窄屏和一个宽屏结果，再决定是否将本计划改为 `completed`。
