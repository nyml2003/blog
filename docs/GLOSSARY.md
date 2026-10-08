---
kind: guide
id: GUIDE-GLOSSARY-001
status: current
owner: project-manager
last_reviewed: 2026-10-07
---

# GLOSSARY：项目术语表（人话版）

> 按拼音/字母排序。每条给一句"人话"+ 主要落点。配合 [CODEMAP](./CODEMAP.md) 使用。

## 进程与角色

| 术语 | 人话 | 落点 |
| --- | --- | --- |
| **Product** | 唯一面向浏览器的后端进程。所有 API 请求先到它；它懂业务但不碰数据库 | `src/backend/product/`，端口 8080 |
| **Data** | 只被 Product 调用的存储进程。只会执行 26 种预定义操作，不懂业务、不解析 HTML、不知道 GitHub | `src/backend/data/`，端口 8081 |
| **Mock** | 开发时的假 Product。写前端不用启动真实后端，还能模拟慢响应/服务器错误等 5 种故障 | `src/backend/mock/`，端口 9090 |
| **ops** | 本仓库自研的开发工具链 CLI。所有质量检查、启动服务、凭证生成都走它 | `packages/cli/` 框架 + `apps/blog/` 命令实现，命令表在 `apps/blog/src/registry.ts` |

## 数据与契约

| 术语 | 人话 | 落点 |
| --- | --- | --- |
| **typed operation** | Product 问 Data 要数据的 26 种"标准问法"。不写裸 SQL，每种操作有明确的请求/响应类型 | `src/core/protocol/src/operation.rs` |
| **sceneCode** | 每个 API 场景的编号，格式 `端点.场景`（如 `public.article_list`）。请求必须带上，防调用错场景 | `src/core/protocol/src/scene.rs` |
| **envelope（信封）** | 所有 API 响应的统一外壳：`{ code, message, data }`。先看 code 再看 data | `src/core/protocol/src/envelope.rs` |
| **wire** | "对外线缆"——前后端之间传输的数据形状（DTO） | `src/core/protocol/src/wire.rs` |
| **BFF** | Backend For Frontend。Product 里专门为前端拼装数据的层：把多个 Data 操作组合成页面要的样子（货架分组、截断、筛选） | `src/backend/product/src/bff/` |
| **快照（snapshot）** | 公开内容的数据库投影。GitHub 是真源，同步后整体替换快照；页面只读快照 | `content_snapshot` 表 |
| **fixture** | 固定测试数据集（6 分类、2 标签的稳定树），开发/测试用 | `src/backend/data/src/fixture.rs` |
| **taxonomy** | 内容分类体系：分类树 + 标签 + 文章引用 | `src/core/protocol/src/taxonomy.rs` |
| **site-routes** | 后端下发的页面路由清单。H5 页面不写 URL 字面量，渲染前先拉这份清单；**小程序端不使用**（页面路径在 `apps/weapp/app.json` 自维护） | `src/frontend/site-routes.json` → `/api/public/site-routes` |

## 内容生产

| 术语 | 人话 | 落点 |
| --- | --- | --- |
| **内容真源** | 文章内容的唯一权威存放处：GitHub 私有仓库。数据库只是它的投影，可随时重建 | 仓库经 `BLOG_CONTENT_REPO` 运行时配置，契约见 `docs/content-repo/CONTRACT.md` |
| **工作区（workspace）** | 编辑中的草稿状态机：保存→（可选）模型分析→复核→提交 PR。带版本号乐观并发 | `src/backend/product/src/content_workspace/` |
| **模型复核（model review）** | 大模型出的分类变更 JSON，后端校验分配 ID 后，**至多一次**人工确认，防止来回改糊 | `src/backend/product/src/model_review.rs` |
| **同步（sync）** | 把 GitHub 上已合入的内容拉回来替换公开快照。同一时刻只允许一次在跑（single-flight） | `src/backend/product/src/content_sync/` |
| **single-flight** | "同一件事同时只做一次"：并发请求只触发一次实际执行，其余等结果复用 | 同上 |

## 前端结构

| 术语 | 人话 | 落点 |
| --- | --- | --- |
| **页面注册表** | 17 个页面的登记表：路径别名、输出文件、标题。加页面 = 建包 + 这里两行 | `src/frontend/pages.registry.ts` |
| **页面包** | 每页一个 workspace 包：`definition.ts`（登记 + 懒装载）+ `page.tsx`（组件工厂）+ 包内 feature/model | `packages/app/pages/<name>/` |
| **bootstrap** | 每端统一的页面入口：装配环境（page-kit）、按 `data-page-id` 挂载 | `src/frontend/bootstrap/{desktop,mobile}.tsx` |
| **page-kit** | 页面运行时契约与 Web 宿主适配器的唯一装配点：`definePage`、`siteRoute`、`createWebMobilePorts` | `packages/solid/page-kit/src/` |
| **page-contract** | 平台中立的页面契约类型：`PageRegistration`、`PageEntry`、`parseParams` | `packages/solid/page-contract/src/shared.ts` |
| **mobile-foundation** | H5 与小程序共享的移动端纯逻辑：货架模型、设置、收藏解析、高亮分段、日期 | `packages/app/mobile-foundation/src/` |
| **T 型货架** | 公开页的文章陈列：顶部一排类型筛选 + 下面一列文章 | `packages/app/pages/desktop-home/src/page.tsx`（H5） |
| **F 型货架** | Mobile 分类浏览布局：左一级分类、右二级 tabs、下文章卡片 | `packages/app/pages/mobile-articles/src/page.tsx`（H5） |
| **原子/分子（atoms/molecules）** | 最小 UI 积木 / 由积木拼的小组件。Desktop 与 Mobile 各自实现，不跨端导入 | `packages/app/desktop-atoms/`、`packages/app/mobile-h5-solid-atoms/`、`packages/app/mobile-shared/src/ui/` |
| **WASM 校验器** | 正文 HTML 规则检查器编译成的浏览器版本。编辑器实时报错和后端保存校验是同一套规则 | Rust 在 `src/core/article-html-wasm/`；TS 消费在 `packages/app/validation/` |

## 微信小程序

| 术语 | 人话 | 落点 |
| --- | --- | --- |
| **weapp / 小程序端** | 第三个平台端：原生 WXML/WXSS/TS，复用 H5 的协议与纯逻辑，UI 独立重写 | `apps/weapp/` |
| **mobile-host** | 小程序宿主适配包：`wx.request` 网络端口（超时/重试/取消）、wx storage 持久化、页面栈导航 | `packages/weapp/mobile-host/src/index.ts` |
| **runtime.js** | 小程序四页共享的 CommonJS 产物；公共协议与纯逻辑只打包一次，页面 require 复用 | `apps/weapp/src/runtime.ts` → `target/weapp/lib/runtime.js` |
| **环境注入** | 小程序 API 地址在构建期经 `--api-origin` 注入产物，无运行时环境变量；test 默认本地 mock，production 必须显式提供 | `ops weapp build --environment <test\|production>` |
| **Skyline** | 小程序新渲染引擎；本项目全局启用，G7 决策下小程序正文不渲染表格标签（rich-text 限制） | `apps/weapp/app.json` |

## CSS 踩坑

| 术语 | 人话 | 落点 |
| --- | --- | --- |
| **overflow 杀 sticky** | 祖先带 `overflow(-x): hidden` 会变成滚动容器，后代的 `position: sticky` 改吸它而不是视口——吸顶静默失效（声明还在、行为没了）。改用 `overflow-x: clip`：它不创建滚动容器，规范上不破坏 sticky，实测 Chrome 正常。防回归不靠肉眼，靠 `ops e2e` 行为断言，且每类断言须用"注入坏样式→变红"证明有效 | `packages/app/mobile-shared/src/ui/styles/shell.css`（`.mobile-shell` 用 clip）、`apps/blog/src/e2e/e2e.ts`（`assertStickyDocked`） |

## ops 与质量

| 术语 | 人话 | 落点 |
| --- | --- | --- |
| **门禁（quality gate）** | `ops quality check`：Rust 三件套 + ops 契约测试 + 前端质量 + weapp check + 架构边界扫描，任一红即失败 | `apps/blog/src/quality/quality-check.ts` |
| **架构边界扫描** | Cargo manifest 依赖禁令（data 禁 HTML 解析器与外部 HTTP/GitHub 客户端、product 禁直连 SQLite），违规即红；源码内容扫描已于 2026-10-04 退役 | `apps/blog/src/quality/architecture.ts` |
| **包边界门禁** | 按 `packages/<类别>/` 目录执行平台中立性检查（ts 禁宿主原语、weapp 禁 Web 全局等），并检查 package.json 依赖的声明与使用 | `apps/blog/src/quality/package-guard.ts`、`package-check.ts` |
| **golden 测试** | 把契约写成"标准答案文件"（如 `docs/api/routes.json`），测试对照文件与代码完全一致，防止两边漂移 | `src/backend/product/tests/api_routes.rs`、`src/frontend/tests/app/api/mobile.test.ts` |
| **数据语义（mock/test/prod）** | Data 进程的三种启动姿势：mock=内存无磁盘；test=临时库用完即删；prod=显式路径库文件（必须提供 `--database-path`），退出不删 | `src/backend/data/src/semantics.rs` |
| **fail-closed** | 出问题时宁可拒绝服务也不放行/降级。登录、凭证读取、启动检查都遵循 | `src/backend/product/src/auth/`、`apps/blog/src/admin/admin-auth.ts` |
| **端口（port）/适配器（adapter）** | 六角形架构词汇：port=抽象接口，adapter=具体实现（如文件系统、进程、网络的真实现）。好处是规则可脱离环境测试 | `packages/ts/port`、`packages/weapp/mobile-host` |
| **dry-run** | 只打印将要做什么、不实际执行。ops 的全局开关 | `packages/cli/cli-kit/src/parameters.ts` |

## 流程词

| 术语 | 人话 | 落点 |
| --- | --- | --- |
| **Spec** | 行为契约文档：定"系统必须怎样表现"，不带实现细节 | `docs/specs/` |
| **Plan** | 可选的跨职能工作记录：目标、取舍、依赖、证据和未完成范围；不等于全部交付 | `docs/plans/`（active/archive/_template） |
| **workstream** | 计划或任务中的一条独立工作线（前端/后端/基建…），需要时声明 owner、依赖和写集 | 具体任务记录 |
| **写集（write set）** | 某条工作流允许修改的文件范围。写集重叠的工作流不许并行，防止互相踩 | 具体任务记录 |
| **acceptance（验收）** | 对行为、证据或产品结果的确认阶段；是否需要人工确认由当前任务约定 | 当前 Spec、任务记录或交付说明 |
