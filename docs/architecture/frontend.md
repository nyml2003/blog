---
kind: architecture
id: ARCH-FRONTEND
status: current
owner: frontend
last_reviewed: 2026-09-07
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
├── mobile/       # C Mobile 页面与适配
├── mobile-ui/    # Mobile 独立原子、组合组件与页面容器
└── solid/        # Solid 资源适配与页面查询层
```

`src/frontend/common` 不得依赖 JSX、CSS、Desktop 或 Mobile。Desktop 与 Mobile 不互相导入 UI。

`src/frontend/solid/queries` 是页面的数据入口：它组合 `browserClient` 与
`useDataResource`，负责请求参数、DTO 到页面模型的映射、错误归一和异步竞态控制。页面
只消费查询结果和命令，不直接拼 API 请求，也不直接映射 wire DTO。该层不含 Desktop 或
Mobile UI，因此两端只共享数据语义，不共享界面实现。

`mobile-ui/atoms` 提供独立控件，`molecules` 提供 Field、PageHeader、BottomNav、TabGroup、ChipGroup 和 StateMessage，`containers` 提供 PageContainer；样式由对应层负责。Field 管理标签与 Select 的关联，Select 消费 `{ value, label }` 列表并回调选中值；Tab/Chip 分组保持受控，StateMessage 不读取资源状态。mobile-ui 不访问 Client、存储或业务路由状态，页面提供已归一化的数据和命令。

## 页面入口

- Desktop 首页、文章列表、详情和 Admin 页面使用独立 HTML 入口；
- Mobile 推荐、文章列表、详情和设置使用独立 HTML 入口；
- URL 使用静态页面入口和 query 参数，不依赖动态路由库。

## 状态

页面至少处理 `loading`、`success`、`empty`、`error`。编辑器至少处理 `idle`、`dirty`、`saving`、`saved`、`save_error`。

HTML 正文由各端独立实现 `ArticleBody`，输入遵守同一正文片段契约。

## 公开文章货架

除 Mobile 文章入口 `/m/articles/index.html` 及其二级平铺页
`/m/articles/list.html` 使用 F 型货架外，公开文章展示货架统一使用 T 型结构：顶部为文章
类型筛选，下面为文章列表。管理端文章列表是管理表格，不属于展示货架。

T 型货架首次请求同时取得筛选项和首个筛选项对应的文章；切换筛选后重新请求文章数据并
重渲染。切换期间保留筛选条，内容区明确显示 loading、error、empty 和 retry 状态；查询
层通过取消与 generation guard 丢弃旧请求结果，避免快速切换时旧响应覆盖当前筛选。

## Mobile 设置

`common/data/storage.ts` 提供可注入的同步存储适配，以 Result 处理存储对象获取、读写失败和边界空值。`common/client/mobile-settings.ts` 负责主题与字体选项、默认值、键名和保存语义；独立浏览器组合根注入 localStorage。Mobile 适配层连接页面状态、Client 与 html 的主题属性，页面只组合 UI、绑定值和选择命令。

移动页面统一使用 `mobile-shell`、`MobileNav` 和 `mobile-ui` 的 BottomNav；设置页继续使用 `Field` + `Select`，并与其他 Mobile 页面共享顶部、主体和底部布局。主题变量覆盖 `.mobile-shell`，所有 Mobile HTML 入口的同步首绘脚本都由 Vite 插件从同一套 Data / Client 源码装配，避免在 HTML 中另写存储规则。

行为与验收契约见 [SPEC-MOBILE-THEME-SETTINGS-001](../specs/SPEC-MOBILE-THEME-SETTINGS-001.md)；入口的 Vite 注册和 Product 静态白名单为两处独立接线，不能互相替代。

## 正文校验

`src/frontend/common/validation` 装配共享 Rust core 的 WASM 并验证诊断 schema；页面通过 `client.draftEditor.inspectHtml` 使用，不维护 TS allowlist。B Desktop 预览只能消费当前源码的成功校验结果；session preview 重新验证存储内容。WASM 加载失败、过期结果或无效正文均不注入 `innerHTML`，但不剥夺保存草稿的能力。公开正文由 Product 的原生同源规则保证，见 `SPEC-ARTICLE-HTML-VALIDATION-001`。

## Client 注入与拦截器

`src/frontend/common/data` 的 `createJsonTransport` 支持创建时注入请求拦截器；composition root（`src/frontend/common/client/browser.ts`）装配调试拦截器：URL 查询参数 `mock-session` 存在时为请求附加 `X-Blog-Mock-Session` 头（Mock 会话隔离），无参数时零副作用。Mock 专用类型与常量只存在于注入层，不泄漏到页面和领域模型。
