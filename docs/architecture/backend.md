---
kind: architecture
id: ARCH-BACKEND
status: current
owner: backend
last_reviewed: 2026-09-06
---

# Backend 架构

## 运行方式

后端使用 Rust。Cargo workspace（根在 `src/Cargo.toml`）包含 `src/core/protocol`（层间类型与共享投影）、`src/backend/product`（Product API）、`src/backend/data`（Data Server）、`src/backend/mock`（Mock Product API）、`src/core/article-html-core`（手写严格正文解析和 Profile）与 `src/core/article-html-wasm`（浏览器适配）。

Product 与 Data 是独立进程：Product 面向前端提供公开/管理 API 与 BFF，不访问 SQLite；Data 负责数据表、迁移、分页与批量关联。

- Product API：Tokio `current_thread` 单线程运行时 + axum/hyper；`integration` 模式下同源托管 `src/frontend/dist` 与 `/api`；
- Data Server：同步线程池（I/O 8 线程 + CPU 1 线程），业务侧经有界通道 `try_send` 投递（满则该请求 503），`oneshot` 回程；取消为协作式；SIGTERM/SIGINT 两段式关停；
- SQLx（`runtime-tokio` + `SqlitePool` + `sqlx::migrate!()`，运行期 `sqlx::query` API）是唯一数据库第三方库。

请求处理顺序：

```text
method -> route -> sceneCode -> Product handler -> Data typed operation -> domain rules -> SQLite
```

HTTP handler 不直接拼接 SQL。文章公开可见性、状态迁移和推荐候选范围由后端保证。

## 领域模块

- `src/core/protocol`：typed operations 请求/响应、wire 投影与 sceneCode 常量、诊断 schema；
- `src/backend/product`：路由、sceneCode 解析、envelope、静态挂载、Data client；
- `src/backend/data`：SQLite 存储、迁移、mock 内存夹具、线程池与通道；Data API 为按领域定义的 typed operations，不做表 CRUD；
- `src/backend/mock`：Mock Product API（`ops runtime dev` 专用：有限命名场景 + `X-Blog-Mock-Session` 显式会话隔离，固定 seed，启动即重置）。

数据语义：`mock`（内存夹具，不建不开 SQLite 文件）与 `test`（每次运行全新临时库 `target/test-dbs/<PID>.db`，自动迁移 + 稳定 seed，正常退出删除、异常退出保留）；`prod` 为后续扩展位。

## 当前状态规则

```text
draft -> published -> draft
```

草稿不出现在公开查询中。创建时间、更新时间和发布时间由后端维护。Product 在创建/更新/发布中调用共享 HTML core；无效草稿可保存，无效正文不可发布或覆盖已发布版本。发布固定两次 Data 调用（读取正文、按相同原文条件发布），同一请求沿用一个 deadline budget。HTML 检查当前是有输入资源上限的同步 CPU 工作，不属于 Data CPU worker；目标机压力测试如显示事件循环受阻，再引入 Product 有界 CPU 执行边界。

## 边界约束

Product 对每个公开请求调用 Data 的次数与结果条目数无关；Data 列表读取使用固定查询数量（批量 `IN`/`JOIN`），排序保持 `updated_at DESC, id DESC`。

## 当前限制

MVP 暂不实现认证、HTML 自动 sanitization/修复、全文搜索、多用户协作和实时个性化推荐；正文安全通过严格 Profile 拒绝实现，而不是静默改写。公网监听、TLS 与 B 端认证属后续独立计划（见 [FACT-RUNTIME-001](../FACTS.md)）。
