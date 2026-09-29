---
kind: guide
id: GUIDE-CODEMAP-001
status: current
owner: project-manager
last_reviewed: 2026-09-19
---

# CODEMAP：代码地图（人类阅读版）

> 这份地图回答一个问题：**"我想看/改某个东西，应该打开哪个文件？"**
> 术语看不懂先查 [GLOSSARY](./GLOSSARY.md)；架构为什么长这样见 [architecture/](./architecture/)。

## 读代码的进入点

| 你想做的事 | 从这里进 |
| --- | --- |
| 看一个页面长什么样、怎么交互 | 旧页面看 `src/frontend/<desktop\|mobile>/src/pages/`；新 Mobile 入口看 `src/frontend/app/bootstrap/` 与 `app/habitat/mobile/` |
| 看页面数据从哪来 | 旧页面看 `solid/queries/`；新运行时看 `app/habitat/` 注入的 API、资源和 ports |
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
│       ├── app/kernel/     ← 平台中立的 ports、Result、Task、Resource 与状态原语
│       ├── app/infrastructure/ ← browser/memory 等宿主适配器
│       ├── app/habitat/    ← 新运行时的 API 组合、Mobile 逻辑、页面和 UI
│       ├── app/bootstrap/  ← 新运行时页面入口与首绘装配
│       ├── pages.registry.ts ← 全部 17 个页面的登记表（单一事实源）
│       ├── site-routes.json  ← 页面路由清单（后端经 /api/public/site-routes 下发）
│       ├── desktop/src/pages/  ← Desktop 页面（public/ 公开，admin/ 管理）
│       ├── mobile/src/pages/   ← 尚未迁移的 Mobile 页面（含管理预览）
│       ├── mobile/src/logic/   ← 旧 Mobile 无 UI 逻辑
│       ├── mobile/src/components/ ← 旧 Mobile 共享组件
│       ├── mobile-ui/       ← 旧 Mobile 原子/组合组件库
│       ├── desktop/src/shell/ ← Desktop 共享壳
│       ├── desktop-ui/      ← Desktop 独立基础组件库
│       ├── solid/queries/   ← 旧页面的数据获取层
│       ├── solid/page.tsx   ← 旧页面 definePage 引导
│       ├── common/client/   ← 框架无关的 API 客户端与浏览器适配
│       ├── common/data/     ← 纯工具：Result/Task/Transport/Storage
│       ├── common/validation/ ← HTML 校验的 WASM 前端接驳
│       └── build/           ← Vite 插件：按注册表生成各页 HTML 入口
├── packages/               ← @fluvient-loom 可复用包（ports/query/command/web/gesture 等）
├── apps/playground/        ← 包能力与移动手势的独立演示、实证入口
├── ops/                    ← 开发工具链 CLI（Node 直跑 TS，零依赖）
│   └── src/{domain,application,infrastructure,interface}/
│                           ← 四层；interface/registry.ts 是命令登记表
├── docs/                   ← 正式文档（本文件所在）
│   ├── FACTS.md            ← 项目稳定基线（受控）
│   ├── architecture/       ← 当前生效的架构描述
│   ├── specs/              ← 行为契约（每个 Spec 一份）
│   ├── guides/             ← 操作指南（operations.md 最常用）
│   ├── api/routes.json     ← 全部 API 路由总表（有 golden 测试锚定）
│   ├── content-repo/       ← GitHub 内容仓库的契约与 schema
│   └── specs/archive/      ← 已替代契约的历史版本
├── nix/flake.nix           ← 开发环境与 ops 命令 wrapper
└── tempDocForHuman/        ← 给人类读者的图（PlantUML 源码 + PNG）
```

## 三条旅程（按功能走读代码）

### 旅程一：读者打开一篇文章

```
浏览器 → /articles/detail.html?id=7（HTML 由构建期从 pages.registry 生成）
  → desktop/src/pages/public/detail.tsx 挂载（definePage 先拉路由清单）
  → usePublishedArticle()（solid/queries/articles.ts）
  → common/client 的 api-client（按 routes-contract.ts 的契约表）发 GET /api/public/articles
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
  → 旧页面由 definePage、新页面由 bootstrap environment 拉取并存入运行时上下文
  → 页面调语义函数（如 mobileArticlesHref()）得到路径 → 渲染 <a href>
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
| `app/kernel/` | 新运行时的无宿主核心 | 不依赖 Solid、DOM、网络或旧页面层 |
| `app/infrastructure/` | browser/memory 等适配器 | 只实现 kernel ports，不承载页面业务 |
| `app/habitat/` | 新运行时的 API、资源、Mobile 逻辑与 UI | 通过注入 ports 工作，不导入旧页面层 |
| `app/bootstrap/` | 新运行时页面入口与首绘装配 | 只做 composition root |
| `desktop/src/pages/` | 旧 Desktop 页面 | 页面只管 UI；要数据走 queries |
| `mobile/src/pages/` | 尚未迁移的 Mobile 页面 | 页面只管 UI；要数据走 queries |
| `solid/queries/` | 数据获取层（public/admin/taxonomy-source/site-routes） | 页面禁直连 client/data |
| `common/client/` | API 客户端、会话重定向、路由清单缓存 | 框架无关（不许 import solid） |
| `common/data/` | result/task/transport/storage 纯工具 | 无 UI、无框架 |
| `mobile-ui/` | Mobile 原子组件库 | Desktop 不得引用 |

### packages/ 与 apps/ —— 可复用能力工作区

根目录 pnpm workspace 只覆盖 `packages/*` 和 `apps/*`。`packages/` 提供
`@fluvient-loom` 的平台中立能力、宿主适配和 Web/手势模块，`apps/playground/` 用于独立演示与
真机验证；它们与 `src/frontend/` 同仓库演进，但不等同于博客页面运行时。入口以各包
`package.json`、根 `package.json` 和 `ops package check` 为准。

### ops/ —— 开发工具链

四层结构：`interface/`（CLI 与命令登记表）→ `application/`（编排）→ `domain/`（纯规则：架构边界检查、运行矩阵、端口分配）→ `infrastructure/`（进程/文件系统/网络适配）。质量门禁的全部规则在 `domain/architecture.ts`。

## 当前布局状态

- `app/` 新运行时层已经进入源码：`kernel` 保持平台中立，`infrastructure` 提供宿主适配，`habitat` 负责应用组合，`bootstrap` 负责页面入口。
- 公开 Mobile 的首页、文章库、平铺页、详情和设置页使用 `app/bootstrap/mobile/`；Mobile 管理预览及部分旧页面仍位于 `mobile/src/`。
- `desktop-ui/` 与 `mobile-ui/` 继续保持平台隔离；组件是否接入页面以当前源码、测试和构建入口为准。
- 计划目录当前不作为代码地图的一部分。后续计划重新建立后，应只登记仍然有效的工作范围，不回填旧索引。
