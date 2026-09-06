//! Data Server 的库面：进程生命周期、执行器、数据后端与 HTTP 面。
//!
//! 拆出 lib target 是为了让集成测试（`tests/`）能直接驱动执行器与数据后端，
//! 而不必通过子进程 + HTTP 观察每一条断言；binary 入口见 `src/main.rs`。
//!
//! 服务端时间字段与日期过滤终点来自 `protocol::{clock, dates}`（与 Mock 共享）。

pub mod cli;
pub mod executor;
pub mod fixture;
pub mod http;
pub mod logging;
pub mod semantics;
pub mod server;
pub mod store;
