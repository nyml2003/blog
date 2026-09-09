//! Data 的 HTTP 面：`/healthz`、`/data/v1/operations`、`/data/v1/diagnostics`。
//!
//! 背压即契约：`try_send` 失败 → `503` + ARCH-DATA-API envelope。
//! 请求预算经 `X-Blog-Budget-Ms` 头沿链路传播；超时后丢弃回程通道即触发协作式取消。

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::Router;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use tokio::sync::oneshot;

use crate::executor::{Executor, JobResult};
use crate::semantics::Semantics;
use crate::store::Store;
use protocol::envelope::codes;
use protocol::{
    DataOperation, DataOutcome, DataRuntimeDiagnostics, Envelope, OPERATION_NAMES, OperationFailure,
};

use protocol::envelope::http_status;

/// 入口默认预算（Product 传入的 `X-Blog-Budget-Ms` 优先）。
pub const DEFAULT_BUDGET: Duration = Duration::from_secs(5);
const MAX_BUDGET: Duration = Duration::from_secs(60);
pub const REQUEST_ID_HEADER: &str = "x-blog-request-id";
pub const BUDGET_HEADER: &str = "x-blog-budget-ms";
pub const QUERY_COUNT_HEADER: &str = "x-blog-data-query-count";
pub const ITEMS_HEADER: &str = "x-blog-data-items";

pub struct AppState {
    pub executor: Executor,
    pub store: Store,
    pub semantics: Semantics,
    pub bound_addr: String,
    pub started: Instant,
}

impl AppState {
    pub fn new(store: Store, bound_addr: String) -> Self {
        let semantics = store.semantics();
        let executor = Executor::start(store.handle());
        Self {
            executor,
            store,
            semantics,
            bound_addr,
            started: Instant::now(),
        }
    }
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/data/v1/operations", post(operations))
        .route("/data/v1/diagnostics", get(diagnostics))
        .layer(DefaultBodyLimit::max(1024 * 1024))
        .with_state(state)
}

async fn healthz() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        "ok\n",
    )
}

async fn operations(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Response {
    let started = Instant::now();
    let request_id = headers
        .get(REQUEST_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    let budget = requested_budget(&headers).unwrap_or(DEFAULT_BUDGET);

    let operation = match parse_operation(&body) {
        Ok(operation) => operation,
        Err(failure) => {
            crate::data_info!(
                "op=? lane=? request_id={request_id} rejected reason={}",
                failure.code
            );
            return envelope_response(&Envelope::<DataOutcome>::failure(&failure), &[]);
        }
    };

    let (reply_tx, reply_rx) = oneshot::channel::<JobResult>();
    if let Err(failure) =
        state
            .executor
            .submit(request_id.clone(), operation.clone(), budget, reply_tx)
    {
        return envelope_response(&Envelope::<DataOutcome>::failure(&failure), &[]);
    }

    // 预算耗尽时丢弃 `reply_rx`：这就是取消信号（回程通道关闭）。
    match tokio::time::timeout(budget, reply_rx).await {
        Ok(Ok(result)) => {
            let status = match &result.outcome {
                Ok(_) => codes::OK,
                Err(failure) => failure.code.as_str(),
            };
            let headers = vec![
                (QUERY_COUNT_HEADER, result.diag.query_count.to_string()),
                (ITEMS_HEADER, result.diag.item_count.to_string()),
            ];
            crate::data_info!(
                "http op={} status={} items={} queries={} elapsed_ms={} request_id={}",
                operation.name(),
                status,
                result.diag.item_count,
                result.diag.query_count,
                started.elapsed().as_millis(),
                request_id
            );
            match result.outcome {
                Ok(outcome) => envelope_response(&Envelope::ok(outcome), &headers),
                Err(failure) => {
                    envelope_response(&Envelope::<DataOutcome>::failure(&failure), &headers)
                }
            }
        }
        Ok(Err(_reply_dropped)) => {
            crate::data_error!(
                "op={} lane={} request_id={} worker dropped the reply channel",
                operation.name(),
                operation.lane().name(),
                request_id
            );
            envelope_response(
                &Envelope::<DataOutcome>::failure(&OperationFailure::new(
                    codes::INTERNAL_ERROR,
                    "data worker dropped the reply channel",
                )),
                &[],
            )
        }
        Err(_elapsed) => {
            // reply_rx 在此被 drop → worker 在批次间隙观察到取消。
            crate::data_info!(
                "op={} lane={} request_id={} deadline_exceeded budget_ms={} elapsed_ms={}",
                operation.name(),
                operation.lane().name(),
                request_id,
                budget.as_millis(),
                started.elapsed().as_millis()
            );
            envelope_response(
                &Envelope::<DataOutcome>::failure(&OperationFailure::new(
                    codes::DEADLINE_EXCEEDED,
                    format!(
                        "operation '{}' exceeded its {}ms budget",
                        operation.name(),
                        budget.as_millis()
                    ),
                )),
                &[],
            )
        }
    }
}

async fn diagnostics(State(state): State<Arc<AppState>>) -> Response {
    let (lanes, query_count_total) = state.executor.diagnostics();
    let snapshot = DataRuntimeDiagnostics {
        service: "data".to_owned(),
        semantics: state.semantics.as_str().to_owned(),
        bound_addr: state.bound_addr.clone(),
        uptime_ms: state.started.elapsed().as_millis() as u64,
        lanes,
        query_count_total,
        database: state.store.describe(),
    };
    envelope_response(&Envelope::ok(snapshot), &[])
}

fn requested_budget(headers: &HeaderMap) -> Option<Duration> {
    let raw = headers
        .get(BUDGET_HEADER)?
        .to_str()
        .ok()?
        .parse::<u64>()
        .ok()?;
    Some(
        Duration::from_millis(raw)
            .min(MAX_BUDGET)
            .max(Duration::from_millis(1)),
    )
}

/// 区分 `UNKNOWN_OPERATION` 与 `INVALID_PAYLOAD`，两者都返回 400 + envelope。
fn parse_operation(body: &[u8]) -> Result<DataOperation, OperationFailure> {
    let value: serde_json::Value = serde_json::from_slice(body).map_err(|error| {
        OperationFailure::new(
            codes::INVALID_PAYLOAD,
            format!("request body is not valid JSON: {error}"),
        )
    })?;
    let name = value
        .get("operation")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_owned();
    if !OPERATION_NAMES.contains(&name.as_str()) {
        return Err(OperationFailure::new(
            codes::UNKNOWN_OPERATION,
            format!("unknown operation '{name}'; supported operations: {OPERATION_NAMES:?}"),
        ));
    }
    serde_json::from_value(value).map_err(|error| {
        OperationFailure::new(
            codes::INVALID_PAYLOAD,
            format!("invalid payload for operation '{name}': {error}"),
        )
    })
}

/// 统一出口：ARCH-DATA-API envelope + 附加诊断头。
fn envelope_response<T: serde::ser::Serialize>(
    envelope: &Envelope<T>,
    extra: &[(&str, String)],
) -> Response {
    let status = StatusCode::from_u16(http_status(&envelope.code))
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let body = match serde_json::to_vec(envelope) {
        Ok(body) => body,
        Err(error) => {
            crate::data_error!("encode envelope failed: {error}");
            Vec::new()
        }
    };
    let mut builder = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json");
    for (name, value) in extra {
        builder = builder.header(*name, value);
    }
    builder
        .body(axum::body::Body::from(body))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}
