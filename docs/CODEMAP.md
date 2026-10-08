---
kind: guide
id: GUIDE-CODEMAP-001
status: current
owner: project-manager
last_reviewed: 2026-10-07
---

# CODEMAP：代码地图（任务索引）

> 这份地图回答一个问题：**"我想看/改某个东西，应该打开哪个文件？"**
> 术语看不懂先查 [GLOSSARY](./GLOSSARY.md)；架构为什么长这样见 [architecture/](./architecture/)。
> 只登记高频入口；目录结构变化后，以源码与 `pnpm-workspace.yaml` 为准。

## 按任务进入

| 你想做的事 | 从这里进 |
| --- | --- |
| 看/改一个 H5 页面 | `packages/app/pages/<name>/src/`：`page.tsx`（UI）+ `feature.ts`/`model.ts`（逻辑）+ `definition.ts`（注册） |
| 看页面如何装配 | `src/frontend/bootstrap/{desktop,mobile}.tsx` + `src/frontend/pages.registry.ts`（页面唯一枚举） |
| 看页面数据从哪来 | `packages/app/mobile-api/`、`packages/app/desktop-api/`（协议客户端）+ 页面包内 `feature.ts` |
| 看移动端共享纯逻辑 | `packages/app/mobile-foundation/src/`（货架/settings/favorites/highlight/date） |
| 看/改微信小程序页面 | `apps/weapp/pages/<name>/`（WXML/WXSS/TS）+ `apps/weapp/src/runtime.ts`（共享入口） |
| 看小程序宿主适配 | `packages/weapp/mobile-host/src/index.ts`（wx.request/存储/导航） |
| 小程序怎么构建与发布 | `apps/weapp/build.mjs` + `ops weapp build --environment test|production`；流程见 operations.md |
| 看一个 API 返回什么 | `src/core/protocol/src/wire.rs`（对外形状）+ `docs/api/routes.json`（路由总表） |
| 看后端怎么处理一个请求 | `src/backend/product/src/http.rs` 找到 handler → 它调用的 `bff/` 或 `content_*` 模块 |
| 看数据怎么存 | `src/backend/data/src/store/sqlite.rs` + `migrations/` |
| 看内容怎么变成 GitHub PR | `src/backend/product/src/content_workspace/`（状态机）+ `github/`（传输） |
| 看登录/权限 | `src/backend/product/src/auth/` |
| 看页面契约与构建链 | 契约 `packages/solid/page-contract/src/shared.ts`；Web 装配 `packages/solid/page-kit/src/`；构建 `packages/build/page-build-kit/src/` |
| 看开发命令 | 先运行 `ops help`，再看 `docs/guides/operations.md` 与实现 `apps/blog/src/registry.ts` |

## 一页总图

```text
blog/
├── src/                       ← 应用本体（Cargo workspace 根）
│   ├── core/
│   │   ├── protocol/          ← 三方共用契约：DTO、26 种 typed operations、sceneCode、site-routes
│   │   ├── article-html-core/ ← 正文 HTML 校验器（纯 Rust，白名单极严）
│   │   └── article-html-wasm/ ← 同一校验器编译成 WASM 给浏览器用
│   ├── backend/
│   │   ├── product/           ← 唯一面向浏览器的 API：http.rs（路由）/ bff/ / auth/ / content_* / github/
│   │   ├── data/              ← SQLite 持久化：store/sqlite.rs / executor.rs / migrations/
│   │   └── mock/              ← 开发时顶替 Product，5 种故障场景
│   └── frontend/              ← H5 应用壳（页面本体在 packages/app/pages/）
│       ├── bootstrap/         ← desktop.tsx / mobile.tsx / mobile-settings.tsx / mobile-prefetch-plan.ts
│       ├── pages.registry.ts  ← 页面唯一枚举（17 个，desktop/mobile 装载视图由此派生）
│       ├── page-registry/     ← 注册表校验/清单同步 CLI
│       ├── site-routes.json   ← 路由清单（registry 生成物，H5 构建期内嵌）
│       └── tests/             ← 前端测试与源码形态守卫
├── packages/                  ← workspace 包，目录类别即边界策略（未知类别 fail-closed）：
│   ├── ts/      platform-neutral: command core mock port query serde
│   ├── web/     浏览器宿主: app-shell gesture-web http net mobile-prefetch nested-gesture serde-web text-highlight web
│   ├── solid/   Web UI/绑定: mobile-resource page-contract page-kit persisted-state
│   ├── weapp/   小程序宿主: mobile-host（wx 适配器）
│   ├── cli/     ops 框架: cli-core cli-kit cli-plugins node
│   ├── build/   构建链: page-build-kit
│   └── app/     @blog 私有: desktop-api desktop-atoms desktop-shared kernel mobile-api
│                mobile-foundation mobile-h5-solid-atoms mobile-shared validation pages/
├── apps/
│   ├── blog/                  ← ops 命令实现（src/registry.ts 是命令登记表）
│   ├── blog-deploy/           ← 部署器与安装器
│   └── weapp/                 ← 微信小程序工程（原生四页；产物在 target/weapp）
├── deploy/                    ← 部署配置（nginx、systemd、local）
├── docs/                      ← 事实、架构快照、Spec 与指南（本文件所在）
└── nix/                       ← ops 命令入口与可复现开发环境
```

## 四条旅程

### 读者打开一篇文章（H5）

```text
浏览器 → /articles/detail.html?id=7（HTML 由构建期从 pages.registry 生成）
  → src/frontend/bootstrap/desktop.tsx 按 data-page-id 取注册表派生的懒装载并挂载
  → packages/app/pages/desktop-detail/src/page.tsx
  → @blog/desktop-api 发 GET /api/public/articles
  → Product http.rs → BFF/Data 读取 → SQLite 公开快照 → 原路返回 → 页面渲染
```

### 作者写一篇文章

```text
Desktop 管理端 /admin → 登录（auth/ 校验密码+TOTP）
  → packages/app/pages/desktop-editor/src/page.tsx（CodeMirror）保存草稿
  → content_workspace 状态机（版本号乐观并发）
  → 可选：模型出分类变更 JSON → taxonomy_changes 校验分配 ID → model_review 一次复核
  → 提交 → github/ 在仓库开一个 PR → 你在 GitHub 手动合入
  → content_sync 拉取已合入内容 → Data 单事务替换公开快照 → 读者可见
```

### 页面里的一个链接

```text
src/frontend/pages.registry.ts（页面登记表）
  → site-routes.json（page-registry 生成物，逐字节比对守卫）
  → protocol/site_routes.rs 编译期内嵌
  → GET /api/public/site-routes 下发（Product 与 Mock 同一份，端点保留）
  → H5 在构建期内嵌同一份清单，首绘零清单请求；页面调语义函数得到路径
  → 小程序端不消费该清单：页面路径在 apps/weapp/app.json 自维护（见 architecture/frontend.md）
```

### 小程序读者打开一篇文章

```text
微信开发者工具打开 target/weapp
  → pages/detail/detail.ts（Page 注册）
  → src/runtime.ts（共享 CommonJS 入口，构建期打包为 lib/runtime.js）
  → @blog/mobile-api 协议客户端 → @blog/weapp-host 的 wx.request 适配器
  → 同一 Product API（构建期注入 origin）→ schema 校验 → rich-text 渲染
```

## 按目录明细

### src/core/ —— 共享地基

| 目录 | 内容 | 备注 |
| --- | --- | --- |
| `protocol/` | `wire.rs` 对外 DTO、`operation.rs` Product→Data 的 26 种受控操作、`scene.rs` 路由与场景码、`envelope.rs` 响应信封、`taxonomy.rs` 分类树类型、`site_routes.rs` 路由清单内嵌 | 纯类型与常量，无业务决策 |
| `article-html-core/` | 手写 HTML 解析器 + Profile | 上限 256KB/深 64/2 万节点 |
| `article-html-wasm/` | 上述校验器的浏览器版本 | 编辑器实时校验与后端同一套规则 |

### src/backend/ —— 三个进程

| 进程 | 端口 | 职责 | 关键文件 |
| --- | --- | --- | --- |
| `product/` | 8080 | 唯一面向浏览器：公开/管理 API、BFF、鉴权、静态挂载 | `http.rs`（路由）、`bff/`、`auth/`、`content_*/`、`github/`、`static_files.rs` |
| `data/` | 8081 | 只被 Product 调用：SQLite、迁移、受控读写 | `store/sqlite.rs`、`store/mock.rs`、`executor.rs`、`migrations/` |
| `mock/` | 9090 | 开发时顶替 Product：等价 BFF + 故障场景 | `http.rs`、`scenario.rs`、`store/` |

### src/frontend/ —— H5 应用壳

| 路径 | 内容 | 规则 |
| --- | --- | --- |
| `bootstrap/{desktop,mobile}.tsx` | 每端统一入口：环境装配 + 按 `data-page-id` 挂载 | 只做 composition root（page-kit 唯一调用点）；页面 id → 懒装载从注册表派生 |
| `pages.registry.ts` | 17 个页面的唯一枚举（平台装载视图由此派生） | 加页面 = 建包（definition 写全）+ 这里两行 |
| `page-registry/` | 注册表校验与 site-routes 清单同步 | 机制在 `@fluvient-loom/page-build-kit` |
| `site-routes.json` | 路由清单 | registry 生成物；H5 构建期内嵌，小程序不使用 |
| `tests/` | 前端测试与源码形态守卫 | — |

页面本体与平台世界在 `packages/app/pages/<name>/src/`（每页一包：`definition.ts` 节点安全声明 + 懒装载；`page.tsx` 组件工厂；UI/逻辑在包内自由组织）。跨端硬隔离由包依赖面承载，两端互不 import。

### packages/ 与 apps/

- `packages/` 提供 `@fluvient-loom/*`（平台中立/宿主适配/UI）、`@fluvient-cli/cli-*`（ops 框架）与 `@blog/*`（应用私有）包；入口以各包 `package.json` 和 `ops package check` 为准。
- `apps/blog/src/registry.ts` 是 ops 命令登记表（命令面以 `ops help` 为准）；各命令域位于 `admin/`、`content/`、`delivery/`、`e2e/`、`local/`、`page/`、`quality/`、`release/`、`runtime/`、`stats/`、`weapp/`。质量门禁编排于 `quality/quality-check.ts`；架构扫描仅剩 Cargo manifest 依赖禁令（`quality/architecture.ts`）。
- `apps/blog-deploy/` 提供部署器与安装器；`apps/weapp/` 是微信小程序工程。
