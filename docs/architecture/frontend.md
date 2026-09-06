---
kind: architecture
id: ARCH-FRONTEND
status: current
owner: frontend
last_reviewed: 2026-09-05
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
├── common/       # 无 UI 的契约和逻辑
├── desktop/      # C Desktop + B Desktop
└── mobile/       # C Mobile
```

`src/frontend/common` 不得依赖 JSX、CSS、Desktop 或 Mobile。Desktop 与 Mobile 不互相导入 UI。

## 页面入口

- Desktop 首页、文章列表、详情和 Admin 页面使用独立 HTML 入口；
- Mobile 推荐、文章列表和详情使用独立 HTML 入口；
- URL 使用静态页面入口和 query 参数，不依赖动态路由库。

## 状态

页面至少处理 `loading`、`success`、`empty`、`error`。编辑器至少处理 `idle`、`dirty`、`saving`、`saved`、`save_error`。

HTML 正文由各端独立实现 `ArticleBody`，输入遵守同一正文片段契约。

## 正文校验

`src/frontend/common/validation` 装配共享 Rust core 的 WASM 并验证诊断 schema；页面通过 `client.draftEditor.inspectHtml` 使用，不维护 TS allowlist。B Desktop 预览只能消费当前源码的成功校验结果；session preview 重新验证存储内容。WASM 加载失败、过期结果或无效正文均不注入 `innerHTML`，但不剥夺保存草稿的能力。公开正文由 Product 的原生同源规则保证，见 `SPEC-ARTICLE-HTML-VALIDATION-001`。

## Client 注入与拦截器

`src/frontend/common/data` 的 `createJsonTransport` 支持创建时注入请求拦截器；composition root（`src/frontend/common/client/browser.ts`）装配调试拦截器：URL 查询参数 `mock-session` 存在时为请求附加 `X-Blog-Mock-Session` 头（Mock 会话隔离），无参数时零副作用。Mock 专用类型与常量只存在于注入层，不泄漏到页面和领域模型。
