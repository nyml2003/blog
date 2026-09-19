---
kind: architecture
id: ARCH-FRONTEND
status: current
owner: frontend
last_reviewed: 2026-09-19
---

# Frontend 架构

## 技术基线

- Solid.js + TypeScript；
- Vite 多 HTML 入口；
- 浏览器原生 `fetch`；
- 不引入第三方路由、状态管理、UI 或 CSS 框架；
- `ops runtime integration` 模式下由 Rust Product 同源托管构建产物（页面 + `/api`）；`dev` 模式 Vite 代理 `/api`，代理目标由 ops 注入 `BLOG_API_ORIGIN`。

## 代码边界

```text
src/frontend/
├── app/          # 新运行时：kernel / infrastructure / habitat / bootstrap
├── common/       # 无 UI 的契约和逻辑
├── desktop/      # C Desktop + B Desktop
├── desktop-ui/   # Desktop 独立基础组件库（尚未接入页面）
├── mobile/       # C Mobile 页面与适配
├── mobile-ui/    # Mobile 独立原子、组合组件与页面容器
└── solid/        # Solid 资源适配与页面查询层
```

`src/frontend/common` 不得依赖 JSX、CSS、Desktop 或 Mobile。Desktop 与 Mobile 不互相导入 UI。

`app/kernel` 保持平台中立，提供 ports、Result、Task、Resource 和可逆状态原语；
`app/infrastructure` 提供 browser、memory 等宿主适配器；`app/habitat` 负责 API、页面逻辑和
Mobile UI 的组合；`app/bootstrap` 只负责页面入口与首绘装配。新运行时层不反向依赖旧的
`common`、`solid`、`desktop` 或 `mobile` 页面层。

当前公开 Mobile 的首页、文章库、平铺页、详情和设置页使用 `app/bootstrap/mobile/`；Mobile
管理预览及部分旧页面仍使用 `mobile/src/`。两套实现并存期间，以页面注册表、源码和测试的
实际接线为准，不把“已存在新层”理解成全量迁移完成。

`desktop-ui` 与 `mobile-ui` 是平台隔离的同级组件库，不互相导入。`desktop-ui` 当前只包含
根据既有 Desktop 高频范式准入的 Button、ActionLink、Field 和 StateMessage；它不访问
Client、Data、query、路由、业务组件或页面。第一批组件仅完成内部类型、SSR、边界与独立
showcase 构建测试，现有 Desktop 页面与 shell 尚未消费该库；后续接入必须单独迁移和验收。

旧页面的 `src/frontend/solid/queries` 是数据入口：它组合 `browserClient` 与
`useDataResource`，负责请求参数、DTO 到页面模型的映射、错误归一和异步竞态控制。新运行时
在 `app/habitat` 通过注入的 API、资源和 ports 完成相同职责。两种入口都不让页面直接拼
API 请求或直接映射 wire DTO；它们只共享数据语义，不共享界面实现。

旧的 `mobile-ui/atoms`、`molecules` 和 `containers` 提供独立控件；新运行时对应能力位于
`app/habitat/mobile/ui/`。两套组件都不访问 Client、存储或业务路由状态，页面提供已归一化
的数据和命令；Desktop 与 Mobile 组件库继续保持隔离。

## 页面入口

- Desktop 首页、文章列表、详情和 Admin 页面使用独立 HTML 入口；
- Mobile 推荐、文章列表、详情和设置使用独立 HTML 入口，并由 `app/bootstrap/mobile/` 装配；
- Mobile 管理预览仍使用旧页面入口；
- URL 使用静态页面入口和 query 参数，不依赖动态路由库。

## 状态

页面至少处理 `loading`、`success`、`empty`、`error`。编辑器至少处理 `idle`、`dirty`、`saving`、`saved`、`save_error`。

HTML 正文由各端独立实现 `ArticleBody`，输入遵守同一正文片段契约。

## 公开文章货架

Mobile 的 `/m/articles/index.html` 与 `/m/articles/list.html` 当前使用同一套分类树 F 型货架：
左侧选择一级分类，右侧选择该一级下的二级分类并展示文章。分类选择写入
`category_id`，浏览器前进、后退会恢复选择。首页推荐等其他公开文章展示使用 T 型结构：
顶部为文章类型筛选，下面为文章列表。管理端文章列表是管理表格，不属于展示货架。

T 型货架首次请求同时取得筛选项和首个筛选项对应的文章；切换筛选后重新请求文章数据并
重渲染。切换期间保留筛选条，内容区明确显示 loading、error、empty 和 retry 状态；查询
层通过取消与 generation guard 丢弃旧请求结果，避免快速切换时旧响应覆盖当前筛选。

## Mobile 设置

当前公开 Mobile 设置使用 `app/kernel` 的 persistence ports 和可逆状态命令、
`app/infrastructure` 的 browser/memory 适配器，以及 `app/habitat/mobile` 的页面组合。
设置以 `blog.mobile.settings.v1` 快照持久化；旧的 theme/font key 只用于兼容读取和迁移。
保存失败时恢复上一次稳定快照并提供重试，页面不直接访问存储。

公开 Mobile 页面统一使用 `.mobile-shell` 和 `app/habitat/mobile/ui` 的组件；设置页使用
`Field` + `Select`，带底栏的页面共享三项导航。主题变量覆盖 `.mobile-shell`，并兼容旧
`.m-page-container`。所有已注册且启用 bootstrap 的 Mobile HTML 入口在 head 中同步执行同一
首绘模块，避免在 HTML 中另写存储规则。

行为与验收契约见 [SPEC-MOBILE-THEME-SETTINGS-001](../specs/SPEC-MOBILE-THEME-SETTINGS-001.md)；入口的 Vite 注册和 Product 静态白名单为两处独立接线，不能互相替代。

## 正文校验

`src/frontend/common/validation` 装配共享 Rust core 的 WASM 并验证诊断 schema；页面通过 `client.draftEditor.inspectHtml` 使用，不维护 TS allowlist。B Desktop 预览只能消费当前源码的成功校验结果；session preview 重新验证存储内容。WASM 加载失败、过期结果或无效正文均不注入 `innerHTML`，也不能绕过服务端保存校验。公开正文由 Product 的原生同源规则保证，见 `SPEC-ARTICLE-HTML-VALIDATION-001`。

## Client 注入与拦截器

`src/frontend/common/data` 的 `createJsonTransport` 支持创建时注入请求拦截器；composition root（`src/frontend/common/client/browser.ts`）装配调试拦截器：URL 查询参数 `mock-session` 存在时为请求附加 `X-Blog-Mock-Session` 头（Mock 会话隔离），无参数时零副作用。Mock 专用类型与常量只存在于注入层，不泄漏到页面和领域模型。
