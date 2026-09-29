---
kind: plan
id: PLAN-FRONTEND-PAGE-COMPOSITION-001
status: partial
owner: project-manager
created: 2026-09-28
last_reviewed: 2026-09-28
---

# 页面通用逻辑收敛与组装编排

## 目标

让组件只处理自身展示和局部交互，页面只决定内容与状态如何编排。页面启动、URL 与页面的对应关系、参数解析、数据请求和导航地址由页面外的明确边界处理。文章条目的详情链接由后端数据返回。先用新 Mobile 文章详情页及其入口卡片验证职责划分，同时收敛本次触及的 Mobile 导航图标；再根据证据决定哪些通用逻辑值得推广到其他页面。

## 当前基线

- `pages.registry.ts` 已登记页面入口和 URL alias；后端下发 site-routes 清单，构建工具生成 HTML。
- 旧页面由 `solid/page.tsx` 挂载和引导路由，数据经 `solid/queries` 获取；新公开 Mobile 由 `app/bootstrap/mobile/environment.tsx` 装配宿主能力、挂载和引导路由，数据经 habitat API、Resource 获取。
- 新 Mobile 详情页在页面组件内解析 `?id=`、创建并启动资源、处理返回导航和渲染；`ArticleCard` 接收完整 `MobilePageContext` 并拼详情链接。推荐和分类列表的文章数据均无 `href`，与已接受的 site-routes Spec 中条目链接由后端返回的要求不符。Desktop 详情页也在页面内读取 `id`。
- 新旧链路各有挂载、路由引导和启动失败处理；新 Mobile 页面重复资源启动/刷新代码。相似不等于可直接共用：两套运行时有现行依赖隔离规则。
- Mobile 已有 `IconButton`，但部分导航仍用文字箭头或字符图标；当前前端依赖未包含 Lucide。

## 职责边界

| 边界 | 负责 | 不负责 | 对下一层提供 |
| --- | --- | --- | --- |
| 注册表与构建 | URL alias、HTML 入口、首绘脚本和静态页面映射 | 页面数据、组件内部状态 | 页面入口标识与产物 |
| 启动与组合根 | 获取挂载点、引导 site-routes、读取并校验当前 URL 参数、装配 API/ports、处理启动失败与释放 | 文章业务决策、页面 JSX | 已校验的页面输入和所需能力 |
| 页面级逻辑 | 用页面输入请求数据，管理加载/失败/重试、请求竞态和取消；将后端返回的条目 `href` 传给页面，并处理返回操作 | 读取 `location`、拼页面 URL、决定 DOM 布局 | 页面可直接消费的状态、操作和链接 |
| 页面 | 根据状态选择加载、失败、空内容或正文视图，安排组件与页面级交互 | 解析 URL、直接访问 API/transport/storage、拼路由路径、持有完整宿主 context | 组件所需数据、`href` 与回调 |
| 组件 | 渲染传入的数据，处理仅属于自身的临时状态和局部交互 | 请求业务数据、访问全局路由/宿主能力、决定跨页面跳转地址 | 用户事件或局部状态变化 |

边界描述的是目标职责，不等于必须为每行新建目录或类。条目链接使用后端数据中的 `href`；文章库等壳层链接仍从后端 site-routes 清单取得。页面只传递已有的 `href`，不拼地址，保留复制链接和新标签页等浏览器行为。状态所有权按使用范围放置：组件局部状态不机械上移，跨组件或请求状态由页面级逻辑管理。

## 生命周期与交接

1. 注册表把 URL 映射到 HTML 入口；入口启动组合根。
2. 组合根等待路由清单，解析并校验 `id` 等参数，再创建页面级逻辑；参数无效进入明确错误状态，不发无意义请求。
3. 页面级逻辑启动请求并提供状态、重试操作和导航目标；列表数据中的详情 `href` 由后端生成，页面只用这些值编排组件。
4. 参数或选择变化时，旧请求不能覆盖新结果；离开页面时取消请求并释放监听。优先复用现有 `Task`、`Resource` 和 Solid `onCleanup`，只有出现独立生命周期需求时才引入显式 `dispose()` 接口。
5. 启动失败与业务请求失败分开处理：前者由组合根展示重试，后者由页面根据页面级状态展示；错误不静默回退到硬编码 URL。
6. 详情页的返回操作在能够确认站内前序页面时返回上一页；直接打开、新标签页或无法确认时，使用 site-routes 下发的文章库链接。返回控件保留可访问名称和可用的链接目标。

## 成功标准

1. 新 Mobile 文章详情试点中，页面不读 URL、不直接调用 API 或 navigation port、不拼 URL；推荐和分类接口的文章项由 Product、Mock 返回详情 `href`，前端类型和测试与之同步；`ArticleCard` 不再接收完整 `MobilePageContext`，只接收文章数据和后端返回的详情 `href`。
2. 详情页的无效 `id`、加载、成功、失败重试、离开时取消、过期结果以及返回上一页/文章库兜底行为清楚且可测试；文章卡片链接仍可由浏览器正常打开新标签页。
3. 试点记录每项职责的实际落点、接口形状、测试结果和仍存在的重复代码；据此决定是否推广到首页、列表、设置与旧页面，不预先承诺全量迁移。
4. 本次触及的 Mobile 详情页和导航控件使用同一套 Lucide 图标，减少重复的文字箭头和字符图标；图标操作有可访问名称和悬浮提示，文章标题、错误信息等需要阅读的文字保留。
5. Desktop/Mobile UI 隔离和新旧运行时依赖方向不变；页面注册表、alias、文章可见性和首绘设置行为不变。公共 wire 仅增加本次所需的条目 `href`，不改变既有字段语义。
6. 运行 `ops quality check`，补充 Product/Mock 接口契约、前端相关测试与构建，并取得 Mobile 详情页及卡片链接的浏览器交互、响应式证据。

## 非目标

- 不引入路由框架、页面基类、全局控制器、SSR 或 SPA 化；
- 不一次性重写全部 Desktop/Mobile 页面或统一新旧运行时；
- 不合并 Desktop 与 Mobile 的 JSX、DOM、CSS、UI 组件或内部状态；
- 除文章列表项新增详情 `href` 外，不改变其他公开 API、wire DTO、文章状态、页面 alias 或后端领域语义；
- 不将图标替换扩展到 Desktop、管理端或未触及的页面；
- 不把组件自身的开关、输入焦点等局部状态移到页面级逻辑；
- 不以减少文件数或代码行数代替职责清晰度和行为验证。

## 约束与依据

- `docs/specs/SPEC-ARCH-BOUNDARY-001.md`：旧页面通过 `solid/queries` 取数，新 `app/` 通过 habitat API/Resource 和 kernel ports；新 `app/` 不导入旧运行时，Desktop/Mobile UI 隔离。
- `docs/specs/SPEC-SITE-ROUTES-001.md`：路由值来自后端清单，条目详情 `href` 从后端数据返回；引导失败有可重试错误态，不用路径字面量兜底。本次补齐实现与已接受契约之间的差异。
- `docs/specs/SPEC-MOBILE-THEME-SETTINGS-001.md`：Mobile 首绘设置和 bootstrap 边界保持现状。
- `docs/architecture/frontend.md`：当前实现快照；动手时再以源码和测试核对，不能把本计划直接当成新架构事实。
- 修改 TypeScript/TSX 前阅读项目 TypeScript 风格、Review 清单和相关工具配置；验证按 `AGENTS.md` 的风险分级执行。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 详情链路基线与接口设计 | frontend+backend+pm | - | 本计划、详情链路测试设计；不改产品源码 | ready |
| 文章条目 `href` 契约 | backend | 基线与接口设计 | `src/core/protocol/src/wire.rs`、Product/Mock 推荐与分类接口的组装代码、相关契约测试 | ready |
| 新 Mobile 详情页试点 | frontend | 基线与接口设计 | `src/frontend/app/bootstrap/mobile/detail.tsx`、`app/habitat/mobile/pages/detail.tsx`、相关页面级逻辑和测试；必要时更新导航 port 与浏览器适配 | ready |
| 文章卡片链接接入 | frontend | `href` 契约 | `src/frontend/app/habitat/api/mobile/types.ts`、`app/habitat/mobile/components/article-card.tsx`、首页/文章列表使用处及相关测试 | ready |
| Mobile 图标与返回控件 | frontend | 详情页试点、卡片接入 | `src/frontend/package.json`、`pnpm-lock.yaml`、本次触及的 Mobile 导航/详情控件与样式、相关测试 | ready |
| 试点验收与推广决策 | frontend+backend+pm | 上述实现工作流 | 本计划验收记录；仅在结论明确后更新相关架构文档或开启后续工作 | ready |

这些工作流按依赖串行推进；页面、导航和测试写集有交叉时，由同一 owner 串行修改。Lucide 的实际包、版本和与 Solid 的适配在实施时核对，依赖与 lockfile 仅在本项目内更新，不批准依赖安装脚本或批量升级。旧 `solid/page.tsx`、Desktop 页面、注册表和架构门禁本轮先作为对照与回归检查对象。

## 集成验收

1. 对照迁移前后的 Mobile 详情：有效/无效 ID、请求失败与重试、站内返回、直达时文章库兜底、文章卡片链接、浏览器前进后退及新标签页行为；记录自动化与浏览器证据各自覆盖的范围。
2. 验证 Product 与 Mock 推荐和分类响应中的文章 `href`、前端解码与卡片链接一致；链接值由后端提供，前端不重新拼装。检查图标按钮的可访问名称、悬浮提示、键盘操作和 Mobile 视口布局。
3. 检查页面和组件的 import、参数与调用：页面只接收状态/操作/链接，组件不接收完整 context；API 与 URL 接线位置可从入口追到实际实现。
4. 验证入口、路由清单、页面 alias、Mobile 首绘设置与新旧运行时架构边界没有回归；执行跨模块质量检查和相应构建。
5. 结束时记录实际交付、未交付页面、失败或未执行的验证、继续推广所需条件；允许以 `partial` 收尾，不把未勾选迁移当成自动待办。

## 未决项

- 页面级逻辑采用返回状态/操作的函数组合即可，还是确有跨组件持有、独立重启与统一释放需求，需要类或显式 `dispose()`；由试点生命周期测试决定，不预设类。
- 后端条目 `href` 在 Product/Mock 哪个组装层生成、如何复用 site-routes 清单，实施时以当前接口接线和测试确定；前端只消费，不自行拼接。
- 站内前序页面如何可靠识别，试点时用浏览器场景验证；识别不确定时使用文章库 `href`，不依赖 `history.length` 单独判断。
- 哪些状态分支值得抽成通用视图逻辑，哪些应保留在页面；按两个以上真实页面的重复证据决定，不提前抽象。
- 试点后是否推广到首页、列表、设置、Desktop 与旧 Mobile；需要结合试点收益和写集另定范围。

## 执行记录（2026-09-29）

已交付：

- Product、Mock 和共享 wire 为 Mobile 推荐/分类文章卡片返回后端生成的详情 `href`；前端类型和 `ArticleCard` 已改为直接消费该字段，不再拼接 URL。
- Mobile 详情页将参数校验、Resource 生命周期和页面渲染拆开；返回控件优先回到可确认的同源上一页，直达或无法确认时使用文章库链接兜底。
- Mobile 详情、底部导航、状态提示和首页行动控件接入 `lucide-solid`；保留可访问名称、悬浮提示和触摸尺寸。
- 补充协议、Product/Mock HTTP、前端解码、详情输入、失败重试和返回行为测试。

已有证据：

- `cargo fmt --all --check` 通过；Product 单元测试 95 项、Mock 单元测试 34 项、Product 链路测试 1 项、Mock HTTP 契约测试 8 项通过。
- 前端 `test:frontend` 114 项、`test:mobile` 9 项、typecheck、lint、format check 和 build 通过。
- `ops quality check` 全部通过，包含 Rust、ops 契约、前端检查、构建和架构边界。
- 本地浏览器验收通过：390px/820px 视口、首页卡片进入详情、站内返回、直达文章库兜底、无效 ID、失败重试、新标签页和横向溢出检查；生成 `/private/tmp/blog-mobile-home.png`、`/private/tmp/blog-mobile-detail.png`、`/private/tmp/blog-mobile-detail-wide.png`。

未交付与停止原因：

- 未迁移首页、文章列表、设置、Desktop 或旧 Mobile 的页面级逻辑；当前结果只证明详情试点和卡片链接边界，暂不足以决定全量推广。
- 未替换未触及页面中的字符图标；图标依赖只加入本次 Mobile 试点范围。
- Plan 保持 `partial`，后续推广需要两个以上真实页面的重复证据、收益评估和不冲突的写集安排。
