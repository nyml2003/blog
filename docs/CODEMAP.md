---
kind: guide
id: GUIDE-CODEMAP-001
status: current
owner: project-manager
last_reviewed: 2026-09-09
---

# CODEMAP：代码地图（人类阅读版）

> 这份地图回答一个问题：**"我想看/改某个东西，应该打开哪个文件？"**
> 术语看不懂先查 [GLOSSARY](./GLOSSARY.md)；架构为什么长这样见 [architecture/](./architecture/)。

## 读代码的进入点

| 你想做的事 | 从这里进 |
| --- | --- |
| 看一个页面长什么样、怎么交互 | `src/frontend/<desktop\|mobile>/src/pages/<页面>.tsx` |
| 看页面数据从哪来 | 页面 import 的 `solid/queries/` 里的函数 |
| 看一个 API 返回什么 | `src/core/protocol/src/wire.rs`（对外形状）+ `docs/api/routes.json`（路由总表） |
| 看后端怎么处理一个请求 | `src/backend/product/src/http.rs` 找到 handler → 它调用的 `bff/` 或 `content_*` 模块 |
| 看数据怎么存 | `src/backend/data/src/store/sqlite.rs` + `migrations/` |
| 看内容怎么变成 GitHub PR | `src/backend/product/src/content_workspace/`（状态机）+ `github/`（传输） |
| 看登录/权限 | `src/backend/product/src/auth/` |
| 看开发命令 | `docs/guides/operations.md`（最准）→ 实现 `ops/src/interface/registry.ts` |

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
│       ├── pages.registry.ts ← 全部 17 个页面的登记表（单一事实源）
│       ├── site-routes.json  ← 页面路由清单（后端经 /api/public/site-routes 下发）
│       ├── desktop/src/pages/  ← Desktop 页面（public/ 公开，admin/ 管理）
│       ├── mobile/src/pages/   ← Mobile 页面
│       ├── mobile/src/logic/   ← Mobile 无 UI 逻辑（导航、筛选、设置）
│       ├── mobile/src/components/ ← Mobile 共享组件（壳、卡片、货架页）
│       ├── mobile-ui/       ← Mobile 原子组件库（atoms/molecules/containers）
│       ├── desktop/src/app.tsx ← Desktop 共享壳（页头导航、文章表格、货架）
│       ├── solid/queries/   ← 数据获取层：页面要数据只能走这里
│       ├── solid/page.tsx   ← definePage：每页引导（先拉路由清单再渲染）
│       ├── common/client/   ← 框架无关的 API 客户端与浏览器适配
│       ├── common/data/     ← 纯工具：Result/Task/Transport/Storage
│       ├── common/validation/ ← HTML 校验的 WASM 前端接驳
│       └── build/           ← Vite 插件：按注册表生成各页 HTML 入口
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
│   └── plans/              ← 跨职能计划（active/ 进行中，archive/ 已归档）
├── nix/flake.nix           ← 开发环境与 ops 命令 wrapper
└── tempDocForHuman/        ← 给人类读者的图（PlantUML 源码 + PNG）
```

## 三条旅程（按功能走读代码）

### 旅程一：读者打开一篇文章

```
浏览器 → /articles/detail.html?id=7（HTML 由构建期从 pages.registry 生成）
  → desktop/src/pages/public/detail.tsx 挂载（definePage 先拉路由清单）
  → usePublishedArticle()（solid/queries/public.ts）
  → common/client/client.ts 按 CLIENT_API_ROUTES 发 GET /api/public/articles
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
  → definePage 引导期拉取 → configureSiteRoutes 存入内存
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
| `desktop/src/pages/` | Desktop 页面 | 页面只管 UI；要数据走 queries |
| `mobile/src/pages/` | Mobile 页面 | 同上 |
| `solid/queries/` | 数据获取层（public/admin/taxonomy-source/site-routes） | 页面禁直连 client/data |
| `common/client/` | API 客户端、会话重定向、路由清单缓存 | 框架无关（不许 import solid） |
| `common/data/` | result/task/transport/storage 纯工具 | 无 UI、无框架 |
| `mobile-ui/` | Mobile 原子组件库 | Desktop 不得引用 |

### ops/ —— 开发工具链

四层结构：`interface/`（CLI 与命令登记表）→ `application/`（编排）→ `domain/`（纯规则：架构边界检查、运行矩阵、端口分配）→ `infrastructure/`（进程/文件系统/网络适配）。质量门禁的全部规则在 `domain/architecture.ts`。

## 已知的布局痛点（治理中）

- 同名文件歧义：`http.rs` ×3（三个进程各一，语义其实清晰）、`runtime.ts` ×2（ops 的 domain/application 各一）；
- 通用名文件：`app.tsx`、`ui.tsx`、`core.ts`、`client.ts` 名字不携带领域；
- `solid/queries/public.ts`（436 行）与 `common/client/client.ts`（819 行）是跨领域大杂烩；
- 前端按技术层堆放，追踪一个领域要跨 6 个目录。

→ 以上由 [PLAN-CODE-LAYOUT-001](./plans/active/PLAN-CODE-LAYOUT-001/PLAN.md) 治理。
