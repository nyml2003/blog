//! 诊断 schema 雏形。
//!
//! 目标只有一个：让「N+1 边界」（PLAN 验收 6）与运行链路状态**可观察**——
//! lane 深度/在途数、被背压拒绝数、单次操作的查询计数与结果条目数。
//! 本期只提供 schema 与最小采集，不做指标后端、不做 P50/P90 验收。

use serde::{Deserialize, Serialize};

use crate::operation::Lane;

/// 单个 lane 的运行诊断。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LaneDiagnostics {
    pub lane: Lane,
    /// 有界通道容量（64 / 4）。
    pub capacity: usize,
    /// 当前排队中的任务数（通道 `len`）。
    pub queued: usize,
    /// 已被 worker 取走、尚未完成的任务数。
    pub in_flight: u64,
    /// worker 线程数。
    pub threads: usize,
    pub accepted: u64,
    /// 因通道满被 `try_send` 拒绝（即背压 503）的次数。
    pub rejected: u64,
    pub completed: u64,
    /// 回程通道关闭后被协作式取消的任务数。
    pub canceled: u64,
}

impl LaneDiagnostics {
    pub fn new(lane: Lane) -> Self {
        Self {
            lane,
            capacity: lane.capacity(),
            threads: lane.threads(),
            ..Self::default()
        }
    }
}

/// Data 存储后端诊断；`mock` 语义下 Data 不提供该对象。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DatabaseDiagnostics {
    /// SQLite 文件路径；`mock` 语义下恒为 `None`，因此不出现在诊断里。
    pub path: String,
    /// 已应用的迁移版本列表（`sqlx::migrate!()` 结果）。
    pub applied_migrations: Vec<i64>,
    /// 是否已加载稳定 seed。
    pub seeded: bool,
}

/// `GET /data/v1/diagnostics` 的响应体。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DataRuntimeDiagnostics {
    pub service: String,
    /// `mock` / `test` / `prod`。
    pub semantics: String,
    pub bound_addr: String,
    pub uptime_ms: u64,
    pub lanes: Vec<LaneDiagnostics>,
    /// Data→SQLite（或 mock 语义下的逻辑读取）累计计数。
    pub query_count_total: u64,
    pub database: Option<DatabaseDiagnostics>,
}

/// 单次 typed operation 的执行诊断（不进入对外 envelope，只进日志与测试断言）。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct OperationDiag {
    pub operation: String,
    pub lane: Option<Lane>,
    /// 结果条目数。
    pub item_count: usize,
    /// 本次操作发出的查询数（SQLite 或 mock 逻辑读取数）。
    pub query_count: u32,
    pub elapsed_ms: u128,
    /// 回程通道关闭导致的协作式取消。
    pub canceled: bool,
}
