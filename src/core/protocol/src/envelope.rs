//! `{ code, message, data }` envelope（ARCH-DATA-API）与 Data 内部失败码。
//!
//! 同一个 envelope 形态同时用于：
//! - Product 的外部响应（`sceneCode` 契约，失败码如 `ARTICLE_NOT_FOUND`）；
//! - Data 的内部响应（失败码见 [`codes`]）；
//! - 背压场景：Data 任务通道满 → `503` + `BACKPRESSURE`（SPEC-OPS-RUNTIME-001-FAIL-008）。

use serde::{Deserialize, Serialize};

use crate::operation::DataOutcome;

/// Data 内部使用的稳定失败码集合（对外不直接暴露）。
pub mod codes {
    pub const OK: &str = "OK";
    /// Data 任务通道已满，请求被拒绝（HTTP 503）。
    pub const BACKPRESSURE: &str = "BACKPRESSURE";
    /// 请求体不是封闭的 `DataOperation` 集合成员（HTTP 400）。
    pub const UNKNOWN_OPERATION: &str = "UNKNOWN_OPERATION";
    /// operation 合法但 payload 不合法（HTTP 400）。
    pub const INVALID_PAYLOAD: &str = "INVALID_PAYLOAD";
    /// 目标资源不存在或不对外可见（HTTP 404）。
    pub const NOT_FOUND: &str = "NOT_FOUND";
    /// 请求预算耗尽（HTTP 504）。
    pub const DEADLINE_EXCEEDED: &str = "DEADLINE_EXCEEDED";
    /// 回程通道已关闭，操作被协作式取消（HTTP 499，非标准码）。
    pub const CANCELED: &str = "CANCELED";
    /// 未分类失败（HTTP 500）。
    pub const INTERNAL_ERROR: &str = "INTERNAL_ERROR";
    /// 摘要超过 160 个 Unicode 字符（HTTP 422）。
    pub const INVALID_SUMMARY: &str = "INVALID_SUMMARY";
    pub const INVALID_ARTICLE_HTML: &str = "INVALID_ARTICLE_HTML";
    pub const ARTICLE_CHANGED: &str = "ARTICLE_CHANGED";
    /// Product attempted to replace a stale persisted content workflow revision.
    pub const CONTENT_WORKFLOW_CHANGED: &str = "CONTENT_WORKFLOW_CHANGED";
    /// Product attempted to replace a content snapshot based on a stale source commit.
    pub const CONTENT_SNAPSHOT_CHANGED: &str = "CONTENT_SNAPSHOT_CHANGED";
    /// 文章状态机不合法迁移 `draft -> published -> draft`（HTTP 409）。
    pub const INVALID_STATE_TRANSITION: &str = "INVALID_STATE_TRANSITION";
    /// 名称唯一约束冲突（HTTP 409）。
    pub const DUPLICATE_NAME: &str = "DUPLICATE_NAME";
}

/// envelope：`{ "code": "...", "message": "...", "data": ... }`。
///
/// `data` 恒被序列化（成功为值，失败为 `null`），与 Go 参考实现的 JSON 输出一致。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Envelope<T> {
    pub code: String,
    pub message: String,
    pub data: Option<T>,
}

impl<T> Envelope<T> {
    /// 成功 envelope；`message` 与 Go 参考实现一致为空字符串。
    pub fn ok(data: T) -> Self {
        Self {
            code: codes::OK.to_owned(),
            message: String::new(),
            data: Some(data),
        }
    }

    /// 失败 envelope：`data` 为 `None`（序列化成 `null`）。
    pub fn failure(failure: &OperationFailure) -> Self {
        Self {
            code: failure.code.clone(),
            message: failure.message.clone(),
            data: None,
        }
    }
}

impl Envelope<DataOutcome> {
    /// 按 ARCH-DATA-API 语义把 envelope 失败码映射成 HTTP status。
    pub fn http_status(&self) -> u16 {
        http_status(&self.code)
    }
}

/// 失败码 → HTTP status（与失败码集合解耦，任意 `Envelope<T>` 都可用）。
pub fn http_status(code: &str) -> u16 {
    match code {
        codes::OK => 200,
        codes::BACKPRESSURE => 503,
        codes::DEADLINE_EXCEEDED => 504,
        codes::CANCELED => 499,
        codes::UNKNOWN_OPERATION | codes::INVALID_PAYLOAD => 400,
        codes::NOT_FOUND => 404,
        codes::INVALID_SUMMARY | codes::INVALID_ARTICLE_HTML => 422,
        codes::INVALID_STATE_TRANSITION
        | codes::DUPLICATE_NAME
        | codes::ARTICLE_CHANGED
        | codes::CONTENT_SNAPSHOT_CHANGED
        | codes::CONTENT_WORKFLOW_CHANGED => 409,
        _ => 500,
    }
}

/// worker → 业务侧的可序列化失败描述（穿通道时保留稳定失败码）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OperationFailure {
    pub code: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl OperationFailure {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            message: message.into(),
            data: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_compare_and_swap_conflicts_are_http_conflicts() {
        assert_eq!(http_status(codes::CONTENT_SNAPSHOT_CHANGED), 409);
        assert_eq!(http_status(codes::CONTENT_WORKFLOW_CHANGED), 409);
    }
}
