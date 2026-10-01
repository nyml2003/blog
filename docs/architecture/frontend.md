---
kind: architecture
id: ARCH-FRONTEND
status: current
owner: frontend
last_reviewed: 2026-10-01
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
├── bootstrap/{desktop,mobile}/ # 组合根：页面入口与首绘装配
├── mobile/  desktop/           # 平台世界：pages/<slice> → widgets/<slice> → features/<slice> → foundation/{api,styles,ui}
├── kernel/                      # 纯机制：desired-state 状态原语
├── domain/ protocol/ validation/ # 跨端契约与输入校验（route-input、article-html、WASM generated/）
├── build/        # WASM 构建脚本等非插件工具
├── vite-plugins/ # Vite 页面生成插件
├── sw/           # Service Worker（Mobile 预取）
├── pages.registry.ts # 页面登记表
└── site-routes.json  # 路由清单投影
```

协议与宿主适配的唯一来源是 workspace 包：`@fluvient-loom/port`（宿主无关 ports）、
`@fluvient-loom/common`（Result、取消、基础类型）、`@fluvient-loom/query`（Task/Resource）、
`@fluvient-loom/web`（浏览器适配器）和 `@fluvient-loom/node`（Node 与内存适配器）。
`kernel/` 只剩 `desired-state` 等纯状态原语，禁宿主能力。`bootstrap/`
只负责把浏览器原生对象和运行配置装配进 workspace 适配器，是唯一允许触碰浏览器全局的层，
平台世界与底层不直接导入 `@fluvient-loom/web`/`node`。

依赖方向机械化（`tests/app/architecture/source-layout.test.ts` 门禁）：
`bootstrap → 平台世界（pages → widgets → features → foundation） → kernel/domain/protocol/validation`；
同层 slice 互不 import，Desktop 与 Mobile 两端互不 import。Desktop 与 Mobile 的业务逻辑和 UI
分别位于 `desktop/` 与 `mobile/` 平台世界内，只共享数据语义，不共享界面实现。

各端 `foundation/api` 与 `features/<slice>/` 通过注入的 ports 负责请求参数、DTO 映射、错误归一和异步竞态；
页面不直接拼 API 请求或映射 wire DTO。

## 页面入口

- Desktop 首页、文章列表、详情和 Admin 页面使用独立 HTML 入口；
- Mobile 推荐、文章列表、详情和设置使用独立 HTML 入口，并由 `bootstrap/mobile/` 装配；
- Mobile 管理预览也使用 `bootstrap/mobile/` 入口；
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

当前公开 Mobile 设置使用 `@fluvient-loom/port` 的 persistence ports 与可逆状态命令、
`@fluvient-loom/web`/`node` 的 browser/memory 适配器，以及 `mobile` 平台世界的页面组合。
设置以 `blog.mobile.settings.v1` 快照持久化；旧的 theme/font key 只用于兼容读取和迁移。
保存失败时恢复上一次稳定快照并提供重试，页面不直接访问存储。

公开 Mobile 页面统一使用 `.mobile-shell` 和 `mobile/foundation/ui` 的组件；设置页使用
`Field` + `Select`，带底栏的页面共享三项导航。主题变量覆盖 `.mobile-shell`，并兼容旧
`.m-page-container`。所有已注册且启用 bootstrap 的 Mobile HTML 入口在 head 中同步执行同一
首绘模块，避免在 HTML 中另写存储规则。

行为与验收契约见 [SPEC-MOBILE-THEME-SETTINGS-001](../specs/SPEC-MOBILE-THEME-SETTINGS-001.md)；入口的 Vite 注册和 Product 静态白名单为两处独立接线，不能互相替代。

## 正文校验

`validation/` 定义诊断 schema，其 `generated/` 子目录装配共享 Rust core 的 WASM 浏览器产物（构建期由 wasm-bindgen 生成，博客私有，不属于通用宿主适配器）；页面通过注入的编辑器 API 使用，不维护 TS allowlist。B Desktop 预览只能消费当前源码的成功校验结果；session preview 重新验证存储内容。WASM 加载失败、过期结果或无效正文均不注入 `innerHTML`，也不能绕过服务端保存校验。公开正文由 Product 的原生同源规则保证，见 `SPEC-ARTICLE-HTML-VALIDATION-001`。

## Client 注入与拦截器

`@fluvient-loom/web` 提供网络、存储和导航适配器；Mock 会话拦截器在 bootstrap composition root 装配，Mock 专用类型与常量不泄漏到页面和领域模型。
