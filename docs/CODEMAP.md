---
kind: guide
id: GUIDE-CODEMAP-001
status: current
owner: project-manager
last_reviewed: 2026-10-01
---

# CODEMAP：代码地图（人类阅读版）

> 这份地图回答一个问题：**"我想看/改某个东西，应该打开哪个文件？"**
> 术语看不懂先查 [GLOSSARY](./GLOSSARY.md)；架构为什么长这样见 [architecture/](./architecture/)。

## 读代码的进入点

| 你想做的事 | 从这里进 |
| --- | --- |
| 看一个页面长什么样、怎么交互 | 看 `src/frontend/app/bootstrap/` 与对应的 `app/habitat/<desktop|mobile>/` |
| 看页面数据从哪来 | 看 `app/habitat/` 注入的 API、资源和 ports |
| 看一个 API 返回什么 | `src/core/protocol/src/wire.rs`（对外形状）+ `docs/api/routes.json`（路由总表） |
| 看后端怎么处理一个请求 | `src/backend/product/src/http.rs` 找到 handler → 它调用的 `bff/` 或 `content_*` 模块 |
| 看数据怎么存 | `src/backend/data/src/store/sqlite.rs` + `migrations/` |
| 看内容怎么变成 GitHub PR | `src/backend/product/src/content_workspace/`（状态机）+ `github/`（传输） |
| 看登录/权限 | `src/backend/product/src/auth/` |
| 看开发命令 | 先运行 `ops help` 看当前命令面，再看 `docs/guides/operations.md` 与实现 `apps/blog/src/registry.ts` |

## 一页总图

```
blog/
├── src/                    ← 应用本体（Cargo workspace 根）
│   ├── core/
│   │   ├── protocol/       ← 三方共用的"合同本"：请求/响应类型、路由表、错误码
│   │   ├── article-html-core/  ← 正文 HTML 校验器（纯 Rust，白名单极严）
│   │   └── article-html-wasm/  ← 同一校验器编译成 WASM 给浏览器用
│   ├── backend/
│   │   ├── product/        ← Product 进程：唯一面向浏览器的 API（8080）
│   │   │   ├── http.rs     ← 路由与协议适配（不做业务决策）
│   │   │   ├── bff/        ← 为前端拼装数据的决策层（货架分组/筛选/截断）
│   │   │   ├── auth/       ← 管理端登录（密码/TOTP/恢复码/限速/会话）
│   │   │   ├── content_workspace/ ← 编辑工作区状态机（保存→复核→提交 PR）
│   │   │   ├── content_service.rs / content_sync/ ← 内容服务与同步协调
│   │   │   ├── taxonomy_changes.rs / model_review.rs ← 分类变更与模型复核
│   │   │   └── github/     ← GitHub 传输（只在后台线程里跑）
│   │   ├── data/           ← Data 进程：SQLite 持久化（8081），不懂业务
│   │   └── mock/           ← Mock 进程：开发时顶替 Product（9090），5 种故障场景
│   └── frontend/
│       ├── app/kernel/     ← 应用层残余：desired-state 状态原语（ports/Result/Task 已归 @fluvient-loom 包）
│       ├── app/habitat/    ← 新运行时的 API 组合、Mobile 逻辑、页面和 UI
│       ├── app/bootstrap/  ← 新运行时页面入口与首绘装配（唯一触碰浏览器全局的层）
│       ├── pages.registry.ts ← 全部 17 个页面的登记表（单一事实源）
│       ├── site-routes.json  ← 页面路由清单（后端经 /api/public/site-routes 下发）
│       ├── app/habitat/validation/ ← HTML 诊断契约与 WASM 浏览器产物（generated/）
│       └── build/           ← Vite 插件：按注册表生成各页 HTML 入口
├── packages/               ← @fluvient-loom 可复用包（ports/query/command/web/gesture 等）
│   └── cli-kit / cli-core / cli-plugins ← ops CLI 的框架能力（参数/输出/进程/端口分配）
├── apps/blog/              ← ops 命令实现（src/registry.ts 是命令登记表）
│   └── src/{admin,content,delivery,e2e,quality,release,runtime}/ ← 各命令域模块
├── apps/blog-deploy/       ← 部署器与安装器（@blog/blog-deploy）
├── docs/                   ← 正式文档（本文件所在）
│   ├── FACTS.md            ← 项目稳定基线（受控）
│   ├── architecture/       ← 当前生效的架构描述
│   ├── specs/              ← 行为契约（每个 Spec 一份）
│   ├── guides/             ← 操作指南（operations.md 最常用）
│   ├── api/routes.json     ← 全部 API 路由总表（有 golden 测试锚定）
│   ├── content-repo/       ← GitHub 内容仓库的契约与 schema
│   └── specs/archive/      ← 已替代契约的历史版本
└── nix/flake.nix           ← 开发环境与 ops 命令 wrapper
```

## 三条旅程（按功能走读代码）

### 旅程一：读者打开一篇文章

```
浏览器 → /articles/detail.html?id=7（HTML 由构建期从 pages.registry 生成）
  → app/bootstrap/desktop/detail.tsx 挂载
  → app/habitat/desktop/pages/detail.tsx
  → app/habitat/api/desktop 发 GET /api/public/articles
  → Product http.rs 路由 → 校验 sceneCode → BFF/data 读取
  → Data（sqlite.rs）查 SQLite 公开快照 → 原路返回 → 页面渲染
```

### 旅程二：作者写一篇文章

```
Desktop 管理端 /admin → 登录（auth/ 校验密码+TOTP）
  → 编辑器（editor.tsx + CodeMirror）保存草稿
  → content_workspace 状态机（版本号乐观并发）
  → 可选：模型出分类变更 JSON → taxonomy_changes 校验分配 ID → model_review 一次复核
  → 提交 → github/ 在仓库开一个 PR → 你在 GitHub 手动合入
  → content_sync 拉取已合入内容 → Data 单事务替换公开快照 → 读者可见
```

### 旅程三：页面里的一个链接

```
pages.registry.ts（页面登记表）
  → site-routes.json（路由投影，测试守卫同步）
  → protocol/site_routes.rs 编译期内嵌
  → GET /api/public/site-routes 下发（Product 与 Mock 同一份）
  → Desktop 与 Mobile 均由 bootstrap environment 运行时装配；
    Mobile 入口在构建期内嵌同一份清单（bootstrap/mobile/environment.tsx），
    首绘不再等待该请求
  → 页面调语义函数（如 `categoryHref()`）得到路径 → 渲染 <a href>
```

## 按目录明细

### src/core/ —— 共享地基

| 目录 | 内容 | 备注 |
| --- | --- | --- |
| `protocol/` | `wire.rs` 对外 DTO、`operation.rs` Product→Data 的 25 种受控操作、`scene.rs` 路由与场景码、`envelope.rs` 响应信封、`taxonomy.rs` 分类树类型、`site_routes.rs` 路由清单内嵌 | 纯类型与常量，无业务决策 |
| `article-html-core/` | 手写 HTML 解析器 + Profile | 上限 256KB/深 64/2 万节点 |
| `article-html-wasm/` | 上述校验器的浏览器版本 | 编辑器实时校验与后端同一套规则 |

### src/backend/ —— 三个进程

| 进程 | 端口 | 职责 | 关键文件 |
| --- | --- | --- | --- |
| `product/` | 8080 | 唯一面向浏览器：公开/管理 API、BFF、鉴权、静态挂载 | `http.rs`（路由）、`bff/`、`auth/`、`content_*/`、`github/`、`static_files.rs` |
| `data/` | 8081 | 只被 Product 调用：SQLite、迁移、受控读写 | `store/sqlite.rs`、`store/mock.rs`、`executor.rs`、`migrations/` |
| `mock/` | 9090 | 开发时顶替 Product：等价 BFF + 故障场景 | `http.rs`、`scenario.rs`、`store/` |

### src/frontend/ —— 两个端 + 共享层

| 目录 | 内容 | 规则 |
| --- | --- | --- |
| `pages.registry.ts` | 17 个页面的登记表 | 加页面只改这里 + 建入口文件 |
| `app/kernel/` | 应用层残余：desired-state 状态原语 | ports/Result/Task/Resource 统一来自 `@fluvient-loom/port|common|query` |
| `app/habitat/` | 新运行时的 API、资源、Mobile 逻辑与 UI | 通过注入 ports 工作，不导入旧页面层或宿主适配器包 |
| `app/bootstrap/` | 新运行时页面入口与首绘装配 | 只做 composition root，唯一允许装配 `@fluvient-loom/web` 适配器的层 |
| `app/habitat/desktop/` | Desktop 页面逻辑、页面和 UI | 页面只编排已注入的 API、资源和命令 |
| `app/habitat/mobile/` | Mobile 页面逻辑、页面和 UI | 页面只编排已注入的 API、资源和命令 |
| `app/habitat/api/` | 页面域 API 与 wire schema | 不访问 UI 或宿主适配器 |

### packages/ 与 apps/ —— 可复用能力与 ops 命令工作区

根目录 pnpm workspace 覆盖 `packages/*`、`apps/*` 和 `src/frontend`。`packages/` 提供
`@fluvient-loom` 的平台中立能力、宿主适配和 Web/手势模块（另有 `@fluvient-cli/cli-*` 三个包承载 ops CLI 框架能力），博客前端通过 workspace 依赖
消费这些包。入口以各包 `package.json`、根
`package.json` 和 `ops package check` 为准。

### apps/blog —— ops 命令实现

`apps/blog/src/registry.ts` 是命令登记表（命令面以 `ops help` 为准）；各命令域模块位于 `admin/`、`content/`、`delivery/`、`e2e/`、`playground/`、`quality/`、`release/`、`runtime/`。质量门禁的全部规则在 `quality/architecture.ts`。`apps/blog-deploy/` 提供部署器与安装器。

## 当前布局状态

- `app/` 是唯一页面运行时：`kernel` 只保留应用层状态原语，协议与宿主适配统一来自 `@fluvient-loom` workspace 包，`habitat` 负责应用组合，`bootstrap` 负责页面入口与适配器装配。
- 全部 17 个注册页面均已接入 `app/bootstrap/`，旧页面、旧查询层和旧 Mobile UI 已删除；`desktop-ui/` 是旧 Desktop 基础组件库，应用侧已无消费者（仍保留自身测试与门禁，待清理决策）。
- Desktop UI 组件位于 `app/habitat/desktop/components/`，Mobile UI 位于 `app/habitat/mobile/ui/`，两端互不导入。
- 计划目录当前不作为代码地图的一部分。后续计划重新建立后，应只登记仍然有效的工作范围，不回填旧索引。
