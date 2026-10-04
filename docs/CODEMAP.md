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
| 看一个页面长什么样、怎么交互 | 看 `src/frontend/bootstrap/<desktop|mobile>/` 与对应平台世界的 `pages/<slice>/` |
| 看页面数据从哪来 | 看 `{mobile,desktop}/foundation/api/` 与 `features/<slice>/` 注入的 API、资源和 ports |
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
 │   └── frontend/           ← 应用壳（页面本体全在 packages/app/ 页面包）
│       ├── bootstrap/      ← 每端一个统一入口（page-kit 唯一调用点）：desktop.tsx / mobile.tsx / mobile-settings.tsx（内联主题引导）
│       ├── styles/         ← 应用样式：mobile.css（聚合 10 个分片）+ desktop.css
│       ├── pages.registry.ts ← 页面唯一枚举（17 行显式 import 聚合，页面包 definePage 产出；desktop/mobile 装载视图由此派生）
│       ├── page-registry/  ← 注册表校验/清单同步 CLI（机制与同步实现在 @fluvient-loom/page-build-kit）
│       └── site-routes.json ← 页面路由清单（registry 生成物，两端构建期内嵌）
├── packages/               ← 全部 npm 包，按类别分目录（目录即门禁策略，未知类别 fail-closed）：
│   ├── ts/                 ← 真通用基础件：core port query command mock net serde
│   ├── web/                ← web 域：web gesture-web mobile-prefetch nested-gesture text-highlight app-shell serde-web
│   ├── solid/              ← web+solid UI：persisted-state page-kit
│   ├── cli/                ← node 侧：cli-kit cli-core cli-plugins node
│   ├── build/              ← 构建链（node+vite）：page-build-kit（校验/生成/vite 插件/脚手架）
│   └── app/                ← @blog 应用私有包：desktop-api desktop-shared kernel mobile-api mobile-shared
│                           　mobile-h5-solid-atoms（mobile 专属设计系统）validation + pages/（页面包）
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
  → bootstrap/desktop.tsx 按 data-page-id 取注册表派生的懒装载并挂载
  → desktop/pages/detail/page.tsx
  → desktop/foundation/api 发 GET /api/public/articles
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
  → site-routes.json（page-registry 生成物，逐字节比对守卫）
  → protocol/site_routes.rs 编译期内嵌
  → GET /api/public/site-routes 下发（Product 与 Mock 同一份，端点保留）
  → Desktop 与 Mobile 均在构建期内嵌同一份清单（bootstrap environment），
    首绘零清单请求；registry 违例在 vite 配置加载期被校验器拦截
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

### src/frontend/ —— 功能切片 + 平台世界

| 目录 | 内容 | 规则 |
| --- | --- | --- |
| `pages.registry.ts` | 17 个页面的唯一枚举（平台装载视图由此派生） | 加页面 = 建包（definition 写全）+ 这里两行 |
| `bootstrap/{desktop,mobile}.tsx` | 每端统一入口：环境装配 + 按 `data-page-id` 挂载 | 只做 composition root（page-kit 唯一调用点）；页面 id → 懒装载从注册表派生 |
| `{mobile,desktop}/pages/<slice>/` | 页面（UI 编排） | 不触碰宿主能力；数据经 features 与注入 ports |
| `{mobile,desktop}/widgets/<slice>/` | 复合组件（shell、article-card、source-editor 等） | 只依赖本端 foundation 与 features |
| `{mobile,desktop}/features/<slice>/` | 业务模型（model/persistence） | 数据获取与领域状态在此 |
| `{mobile,desktop}/foundation/{api,styles,ui}/` | 端内基础层：API 客户端与 BFF 归一化、全局样式、原子 UI | 不访问 UI 之外的宿主适配器 |
| `kernel/` | 纯机制：desired-state 状态原语 | ports/Task/Resource 来自 `@fluvient-loom/port|query`；禁宿主能力 |
| `validation/` | 跨端输入校验（article-html、WASM 产物） | 纯函数与契约，无 UI |

依赖方向与 slice 隔离的源码扫描门禁已于 2026-10-04 移除，包内导入不设路径级限制；`tests/app/architecture/source-layout.test.ts` 仅保留目录形态与 mobile 页面契约检查。两端隔离与底层纯度（`SPEC-ARCH-BOUNDARY-001`）由包结构与评审承载，逐步迁移至 workspace 包（`src/frontend/packages/`）。

### packages/ 与 apps/ —— 可复用能力与 ops 命令工作区

根目录 pnpm workspace 覆盖 `packages/*`、`apps/*` 和 `src/frontend`。`packages/` 提供
`@fluvient-loom` 的平台中立能力、宿主适配和 Web/手势模块（另有 `@fluvient-cli/cli-*` 三个包承载 ops CLI 框架能力），博客前端通过 workspace 依赖
消费这些包。入口以各包 `package.json`、根
`package.json` 和 `ops package check` 为准。

### apps/blog —— ops 命令实现

`apps/blog/src/registry.ts` 是命令登记表（命令面以 `ops help` 为准）；各命令域模块位于 `admin/`、`content/`、`delivery/`、`e2e/`、`quality/`、`release/`、`runtime/`。质量门禁编排于 `quality/quality-check.ts`，架构扫描仅剩 Cargo manifest 依赖禁令（`quality/architecture.ts`）。`apps/blog-deploy/` 提供部署器与安装器。

## 当前布局状态

- 功能切片结构（FSD 适配版）于 2026-10-01 落地（PLAN-FRONTEND-FSD-RESTRUCTURE-001）：`bootstrap/` + `mobile|desktop` 平台世界（pages/widgets/features/foundation）+ `kernel/domain/protocol/validation` 底层；旧 `app/` 壳已删除。
- 全部 17 个注册页面均已接入新 `bootstrap/`；旧页面、旧查询层、旧 Mobile UI 与旧 `desktop-ui/` 组件库在更早的整合中已删除。
- Desktop UI 组件位于 `desktop/widgets/`，Mobile UI 位于 `mobile/widgets/` 与 `mobile/foundation/ui/`，两端互不导入。
- 计划目录当前不作为代码地图的一部分。后续计划重新建立后，应只登记仍然有效的工作范围，不回填旧索引。
