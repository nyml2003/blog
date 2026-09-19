---
kind: architecture
id: ARCH-BACKEND
status: current
owner: backend
last_reviewed: 2026-09-19
---

# Backend 架构

## 运行方式

后端使用 Rust。Cargo workspace（根在 `src/Cargo.toml`）包含 `src/core/protocol`（层间类型与纯形状投影）、`src/backend/product`（Product API）、`src/backend/data`（Data Server）、`src/backend/mock`（Mock Product API）、`src/core/article-html-core`（手写严格正文解析和 Profile）与 `src/core/article-html-wasm`（浏览器适配）。

Product 与 Data 是独立进程：Product 面向前端提供公开/管理 API 与 BFF，不访问 SQLite；Data 负责数据表、迁移、分页与批量关联。

- Product API：Tokio `current_thread` 单线程运行时 + axum/hyper；`integration` 模式下同源托管 `src/frontend/dist` 与 `/api`；
- Data Server：同步线程池（I/O 8 线程 + CPU 1 线程），业务侧经有界通道 `try_send` 投递（满则该请求 503），`oneshot` 回程；取消为协作式；SIGTERM/SIGINT 两段式关停；
- SQLx（`runtime-tokio` + `SqlitePool` + `sqlx::migrate!()`，运行期 `sqlx::query` API）是唯一数据库第三方库。

请求处理顺序：

```text
method -> route -> sceneCode -> Product HTTP adapter -> Product BFF -> Data typed operation -> domain rules -> SQLite
```

HTTP handler 不直接拼接 SQL。文章公开可见性、状态迁移和推荐候选范围由后端保证。

## 领域模块

- `src/core/protocol`：typed operations 请求/响应、DTO、纯字段映射、sceneCode 常量与诊断 schema；protocol 不决定分组、排序、截断、推荐范围或兜底；
- `src/backend/product/src/http.rs`：路由、参数适配、BFF/Data 调用、envelope 与结构化日志；
- `src/backend/product/src/auth/`：单管理员认证（Argon2id 密码、TOTP、一次性恢复码、IP 限速、内存会话 12h 滑动过期与安全 cookie）；`admin_auth_gate` 中间件同时保护管理 API 与管理页面，未认证 fail-closed；凭证由 `ops admin credentials init` 生成（见 SPEC-ADMIN-AUTH-001）；
- `src/backend/product/src/bff/`：跨 Data 操作编排和公开读模型决策。当前 Mobile 分类货架、兼容 Mobile 货架与公开 T 型货架的分组、筛选、截断、推荐范围和兜底均在此层；
- `src/backend/data`：SQLite 存储、迁移、mock 内存夹具、业务校验、线程池与通道；Data API 为按领域定义的 typed operations，不做表 CRUD；依赖当前 term 集合的筛选维度校验由 Data 执行；
- `src/backend/mock`：Mock Product API（`ops runtime dev` 专用：有限命名场景 + `X-Blog-Mock-Session` 显式会话隔离，固定 seed，启动即重置）。Mock 自己实现与 Product 等价的 BFF 和依赖会话数据的校验，不借 protocol 承载业务规则。

数据语义：`mock`（内存夹具，不建不开 SQLite 文件）与 `test`（每次运行全新临时库 `target/test-dbs/<PID>.db`，自动迁移 + 稳定 seed，正常退出删除、异常退出保留）；`prod` 语义已在 Data 实现但 `ops runtime` 尚未放行（`--data` 仅接受 mock/test），约定如下——路径优先级为显式参数 > `BLOG_DATABASE_PATH` > **无默认值**（prod 缺路径即拒绝启动，生产数据位置不允许静默默认）；不加载 seed，仅自动迁移；开发持久库放仓库外（如 `~/.local/state/blog/`），服务器部署位 `/var/lib/blog/blog.db`（见 ARCH-INFRASTRUCTURE）。仓库保持零状态：任何语义都不在仓库内留下数据文件。

## 当前状态规则

```text
draft -> published -> draft
```

草稿不出现在公开查询中。创建时间、更新时间和发布时间由后端维护。Product 在创建/更新/发布中调用共享 HTML core；无效正文不能保存草稿、不能发布，也不能覆盖已发布版本。发布固定两次 Data 调用（读取正文、按相同原文条件发布），同一请求沿用一个 deadline budget。HTML 检查当前是有输入资源上限的同步 CPU 工作，不属于 Data CPU worker；目标机压力测试如显示事件循环受阻，再引入 Product 有界 CPU 执行边界。

## 边界约束

Product 对每个公开请求调用 Data 的次数与结果条目数无关；单一读取场景使用一次 typed operation，聚合场景使用由 BFF 预先声明的固定操作序列。Data 列表读取使用固定查询数量（批量 `IN`/`JOIN`），排序保持 `updated_at DESC, id DESC`。

## 当前限制

管理端单人认证已实现（Session + TOTP + 恢复码 + 限速，见 SPEC-ADMIN-AUTH-001）。暂不实现 HTML 自动 sanitization/修复、全文搜索、多用户协作和实时个性化推荐；正文安全通过严格 Profile 拒绝实现，而不是静默改写。公网监听与 TLS 不属于当前应用交付范围；资源基线和部署约束见 [FACT-RUNTIME-001](../FACTS.md)，具体公网部署方案需另行明确。
