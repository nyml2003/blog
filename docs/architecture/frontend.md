---
kind: architecture
id: ARCH-FRONTEND
status: current
owner: frontend
last_reviewed: 2026-10-07
---

# Frontend 架构

## 技术基线

- H5：Solid.js + TypeScript + Vite 多 HTML 入口，页面本体为 workspace 页面包；
- 微信小程序：原生 WXML/WXSS/TypeScript 工程，UI 独立重写，复用同一协议与纯逻辑；
- 浏览器原生 `fetch`；小程序经 `wx.request` 适配到同一 `NetworkPort`；
- 不引入第三方路由、状态管理、UI 或 CSS 框架；
- `ops runtime integration` 模式下由 Rust Product 同源托管构建产物（页面 + `/api`）；`dev` 模式 Vite 代理 `/api`，代理目标由 ops 注入 `BLOG_API_ORIGIN`。

## 代码边界

```text
src/frontend/                   H5 应用壳（平铺，无平台世界目录）
├── bootstrap/                  desktop.tsx / mobile.tsx（每端唯一入口）
│   ├── mobile-settings.tsx     构建期注入 <head> 的首绘主题引导
│   └── mobile-prefetch-plan.ts SW 预取 URL 解析
├── pages.registry.ts           页面唯一枚举（17 个；desktop/mobile 装载视图由此派生）
├── page-registry/              注册表校验与 site-routes 清单同步 CLI
├── site-routes.json            路由清单（生成物，H5 构建期内嵌）
├── tests/                      前端测试与源码形态守卫
└── vite.config.ts              多页构建配置

packages/app/pages/<name>/      页面包（每页一包）
└── src/                        definition.ts（登记 + 懒装载，node 安全，只允许 import() 表达式）
                                page.tsx（组件工厂）+ feature/model（逻辑）+ page.css
```

协议、纯逻辑与宿主适配的来源：

- `@fluvient-loom/port`（`packages/ts/port`）：宿主无关的端口接口（网络/存储/导航/调度等）；
- `@fluvient/core`（`packages/ts/core`）：`Result`、取消与基础类型；
- `@fluvient-loom/query`（`packages/ts/query`）：`DataTask`/`DataResource`，负责取消与竞态；
- `@fluvient-loom/net`（`packages/web/net`）：fetch 型 `NetworkPort`；HTTP 内核在 `@fluvient-loom/web-http`（`packages/web/http`）；
- `@fluvient-loom/page-contract`（`packages/solid/page-contract`）：平台中立的页面契约（`definePage`、`siteRoute`、参数解析）；
- `@fluvient-loom/page-kit`（`packages/solid/page-kit`）：Web 宿主适配器唯一装配点（`./mobile`、`./desktop`）；
- `@blog/mobile-foundation`（`packages/app/mobile-foundation`）：H5 与小程序共享的移动端纯逻辑（货架模型、设置、收藏解析、高亮分段、日期）；
- `@fluvient-loom/app-shell`、`@fluvient-loom/mobile-prefetch`：H5 骨架与预取。

依赖方向：`bootstrap → 页面包（page.tsx → feature/model）→ 协议/纯逻辑包 → port/query/core`。页面不直接拼 API 请求或映射 wire DTO；数据获取和错误归一在页面包内 `feature`/`model` 层。Desktop 与 Mobile 的页面、DOM、CSS、交互和内部状态互相隔离，只共享数据语义与纯逻辑。

## 页面入口

- Desktop 首页、文章列表、详情和 Admin 页面使用独立 HTML 入口；
- Mobile 推荐、文章列表、详情和设置使用独立 HTML 入口，并由 `bootstrap/mobile.tsx` 装配；
- Mobile 管理预览也使用 `bootstrap/mobile.tsx` 入口；
- H5 使用静态页面入口和 query 参数，不依赖动态路由库；小程序使用 `app.json` 声明的页面路径与 `onLoad(options)` 参数。

## 状态

页面至少处理 `loading`、`success`、`empty`、`error`。编辑器至少处理 `idle`、`dirty`、`saving`、`saved`、`save_error`。

HTML 正文由各端独立实现渲染入口（H5 `ArticleBody`、小程序 rich-text 转换），输入遵守同一正文片段契约。

## 公开文章货架

Mobile 的 `/m/articles/index.html` 与 `/m/articles/list.html` 当前使用同一套分类树 F 型货架：
左侧选择一级分类，右侧选择该一级下的二级分类并展示文章。分类选择写入
`category_id`，浏览器前进、后退会恢复选择。首页推荐等其他公开文章展示使用 T 型结构：
顶部为文章类型筛选，下面为文章列表。管理端文章列表是管理表格，不属于展示货架。

T 型货架首次请求同时取得筛选项和首个筛选项对应的文章；切换筛选后重新请求文章数据并
重渲染。切换期间保留筛选条，内容区明确显示 loading、error、empty 和 retry 状态；查询
层通过取消与 generation guard 丢弃旧请求结果，避免快速切换时旧响应覆盖当前筛选。

## Mobile 设置

H5 设置页使用 `@fluvient-loom/port` 的 persistence ports 与可逆状态命令、
`@fluvient-loom/web` 的浏览器适配器，以及 `mobile` 页面包的组合。设置以
`blog.mobile.settings.v1` 快照持久化；旧的 theme/font key 只用于兼容读取和迁移。
保存失败时恢复上一次稳定快照并提供重试，页面不直接访问存储。设置值域与归一化逻辑在
`@blog/mobile-foundation` 中，H5 与小程序共用。

公开 Mobile 页面统一使用 `.mobile-shell` 和 `mobile-shared` 的组件；设置页使用
`Field` + `Select`，带底栏的页面共享三项导航。主题变量覆盖 `.mobile-shell`。

行为与验收契约见 [SPEC-MOBILE-THEME-SETTINGS-001](../specs/SPEC-MOBILE-THEME-SETTINGS-001.md)。

## 微信小程序端

- 工程在 `apps/weapp/`：`app.json`（页面清单、Skyline、glass-easel、按需注入、超时）、四个页面（home/articles/detail/settings）与 `src/`；
- 页面 import 统一走 `src/runtime.ts`（共享 CommonJS 入口）；构建时公共协议与纯逻辑打包一次到 `lib/runtime.js`，四页 require 复用，不再各自打包；
- 宿主能力经 `@blog/weapp-host`（`packages/weapp/mobile-host`）：`wx.request`（10s 超时、GET 最多 3 次退避重试、取消可中断）、`wx.*StorageSync` 持久化、页面栈导航（`reLaunch`/`navigateTo`）；页面不直连 wx 存储与导航；
- 请求生命周期复用 `@fluvient-loom/query` 的 `DataResource`（薄包装在 `apps/weapp/src/resource.ts`）：新请求取消旧请求、竞态按 generation 丢弃、页面卸载时 cancel；
- 正文渲染：`article-html/v1` 校验过的 HTML 转为 `rich-text` 节点；因 Skyline `rich-text` 不支持表格布局，渲染层拒绝 `table/thead/tbody/tr/th/td`（发布校验与 H5 仍允许表格，含表格文章在小程序端整页不可读，属已知差异）；链接单列为可点击复制的原生按钮；
- 环境隔离：API origin 在构建期经 `ops weapp build --environment <test|production> --api-origin <URL>` 注入（test 默认 `http://127.0.0.1:8080`，production 必须显式提供），产物无运行时环境变量；
- 构建与发布命令、CI tag 规则见 [operations.md](../guides/operations.md)。

## 正文校验

`@blog/validation`（`packages/app/validation`）定义诊断 schema，其 `src/generated/` 装配共享 Rust core 的 WASM 浏览器产物（构建期由 wasm-bindgen 生成，博客私有）；页面通过注入的编辑器 API 使用，不维护 TS allowlist。Desktop 预览只能消费当前源码的成功校验结果。WASM 加载失败、过期结果或无效正文均不注入 `innerHTML`，也不能绕过服务端保存校验。公开正文由 Product 的原生同源规则保证，见 [SPEC-ARTICLE-HTML-VALIDATION-001](../specs/SPEC-ARTICLE-HTML-VALIDATION-001.md)。

## Client 注入

`@fluvient-loom/web` 提供网络、存储和导航适配器；Mock 会话拦截器在 bootstrap composition root 装配，Mock 专用类型与常量不泄漏到页面和领域模型。宿主适配器的装配点：H5 在 `@fluvient-loom/page-kit`（`./mobile`、`./desktop`）；小程序在 `@blog/weapp-host`，由页面与 `runtime.ts` 消费（SPEC-ARCH-BOUNDARY-001）。
