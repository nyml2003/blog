//! Mock Product API（`crates/mock`，WORKSTREAM-MOCK）。
//!
//! dev 模式（`ops runtime dev`）唯一的后端：独立 Rust HTTP server，不是前端进程内
//! 拦截器，也不是通用 Mock 平台。响应面对齐 `crates/product/src/http.rs` 的公开 +
//! 管理路由与 `sceneCode`，并遵循 ARCH-DATA-API 的 `{ code, message, data }` envelope
//! 与 camelCase 字段。
//!
//! 三个可观察维度（全部只由 CLI 决定，不读环境变量，SPEC-OPS-RUNTIME-001-ENV-002）：
//!
//! - **场景**：有限命名集合 `default`/`empty`/`slow`/`server-error`/`malformed-response`
//!   （[`scenario`]），每个场景对所有路由的行为都是确定性的；
//! - **session**：`X-Blog-Mock-Session` 请求头显式隔离跨请求状态（[`store`]），
//!   无 header 的请求归入匿名空间；进程重启即重新初始化；
//! - **seed**：固定数据集（[`seed`]），与 Data `test` 语义的 seed 完全一致（9 篇
//!   published + 3 篇 draft），使前端在真实与 Mock 之间切换时看到同一批 id。
//!
//! 与 Product 的两处刻意差异（见 `WORKSTREAM-MOCK.md` 交付记录）：诊断端点是
//! `/mock/diagnostics`（描述场景与 session，而不是 Product 的 Data 调用计数），且
//! Mock 不挂载静态目录、没有 Data 依赖（`/healthz` 只表达进程自身存活）。
//!
//! 对外契约投影、`sceneCode`/错误码常量与服务端时间/日期工具与 Product **共享同一份
//! 实现**（`protocol::{wire, scene, clock, dates}`），两侧不再各自持有副本。

pub mod logging;

pub mod bff;
pub mod cli;
pub mod domain;
pub mod http;
pub mod scenario;
pub mod seed;
pub mod server;
pub mod store;

pub use cli::{Cli, CliError, EXIT_RUN_FAILURE, EXIT_USAGE};
pub use server::run;
