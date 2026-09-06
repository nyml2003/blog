//! Product → Data client：一次请求恰好一次 typed operation 调用。
//!
//! 依赖最小化：与 axum 复用同一 hyper 栈（`hyper::client::conn::http1`），
//! 不引入 `reqwest`（其 TLS/连接池依赖远超本地回环场景需要）。
//! 连接按需建立、用后即弃；keep-alive 复用与 P50 目标归后续公网部署 plan。

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use http_body_util::{BodyExt, Full};
use hyper::body::Bytes;
use hyper::header::{CONTENT_TYPE, HOST};
use hyper::http::request::Request;
use hyper_util::rt::TokioIo;
use serde_json::json;
use tokio::net::TcpStream;

use protocol::envelope::codes;
use protocol::{DataOperation, DataOutcome, Envelope, OperationFailure};

pub const OPERATIONS_PATH: &str = "/data/v1/operations";
pub const REQUEST_ID_HEADER: &str = "x-blog-request-id";
pub const BUDGET_HEADER: &str = "x-blog-budget-ms";
pub const QUERY_COUNT_HEADER: &str = "x-blog-data-query-count";
pub const ITEMS_HEADER: &str = "x-blog-data-items";

/// Data 侧拒绝（背压）或不可达时 Product 的对外失败形态。
#[derive(Debug, Clone)]
pub enum DataCallError {
    /// Data 任务通道满：`503 BACKPRESSURE`，Product 对外同样 503。
    Backpressure,
    /// 预算耗尽（Product 侧等待超时或 Data 返回 504）。
    DeadlineExceeded,
    /// Data 不可达 / 协议失败。
    Unavailable(String),
    /// Data 返回的领域失败（如 `NOT_FOUND`）。
    Failure(OperationFailure),
}

#[derive(Debug, Default)]
struct Metrics {
    calls: AtomicU64,
    backpressure: AtomicU64,
    deadline_exceeded: AtomicU64,
    unavailable: AtomicU64,
}

#[derive(Clone)]
pub struct DataClient {
    authority: String,
    metrics: Arc<Metrics>,
}

pub struct CallTrace {
    pub outcome: DataOutcome,
    /// Data 本次操作的查询数（来自 `x-blog-data-query-count`）。
    pub query_count: Option<u32>,
    /// Data 本次结果的条目数（来自 `x-blog-data-items`）。
    pub items: Option<u32>,
    pub elapsed: Duration,
}

impl DataClient {
    /// `addr` 形如 `http://127.0.0.1:8081`。
    pub fn new(addr: &str) -> Result<Self, String> {
        let authority = addr
            .strip_prefix("http://")
            .ok_or_else(|| format!("data addr must use http scheme, got '{addr}'"))?
            .trim_end_matches('/')
            .to_owned();
        if authority.is_empty() {
            return Err(format!("data addr has empty authority: '{addr}'"));
        }
        Ok(Self {
            authority,
            metrics: Arc::new(Metrics::default()),
        })
    }

    pub fn counters(&self) -> (u64, u64, u64, u64) {
        (
            self.metrics.calls.load(Ordering::Relaxed),
            self.metrics.backpressure.load(Ordering::Relaxed),
            self.metrics.deadline_exceeded.load(Ordering::Relaxed),
            self.metrics.unavailable.load(Ordering::Relaxed),
        )
    }

    /// 执行一次 typed operation；`budget` 即入口 deadline 的剩余量。
    pub async fn call(
        &self,
        request_id: &str,
        operation: &DataOperation,
        budget: Duration,
    ) -> Result<CallTrace, DataCallError> {
        let started = Instant::now();
        self.metrics.calls.fetch_add(1, Ordering::Relaxed);
        let payload = serde_json::to_vec(operation)
            .map_err(|error| DataCallError::Unavailable(format!("encode operation: {error}")))?;

        let stream = TcpStream::connect(self.authority.as_str())
            .await
            .map_err(|error| {
                self.metrics.unavailable.fetch_add(1, Ordering::Relaxed);
                DataCallError::Unavailable(format!("connect {}: {error}", self.authority))
            })?;
        let (mut sender, connection) = hyper::client::conn::http1::handshake(TokioIo::new(stream))
            .await
            .map_err(|error| {
                self.metrics.unavailable.fetch_add(1, Ordering::Relaxed);
                DataCallError::Unavailable(format!("http handshake: {error}"))
            })?;
        // current_thread runtime：connection 任务与请求处理同线程交替推进。
        tokio::spawn(async move {
            if let Err(error) = connection.await {
                eprintln!("[product] data connection ended: {error}");
            }
        });

        let request = Request::builder()
            .method("POST")
            .uri(OPERATIONS_PATH)
            .header(HOST, self.authority.as_str())
            .header(CONTENT_TYPE, "application/json")
            .header(REQUEST_ID_HEADER, request_id)
            .header(BUDGET_HEADER, budget.as_millis().to_string())
            .body(Full::new(Bytes::from(payload)))
            .map_err(|error| DataCallError::Unavailable(format!("build request: {error}")))?;

        let response = match tokio::time::timeout(budget, sender.send_request(request)).await {
            Ok(Ok(response)) => response,
            Ok(Err(error)) => {
                self.metrics.unavailable.fetch_add(1, Ordering::Relaxed);
                return Err(DataCallError::Unavailable(format!("send request: {error}")));
            }
            Err(_elapsed) => {
                self.metrics
                    .deadline_exceeded
                    .fetch_add(1, Ordering::Relaxed);
                return Err(DataCallError::DeadlineExceeded);
            }
        };
        let status = response.status().as_u16();
        let query_count = header_u32(response.headers(), QUERY_COUNT_HEADER);
        let items = header_u32(response.headers(), ITEMS_HEADER);
        let body = match tokio::time::timeout(budget, response.into_body().collect()).await {
            Ok(Ok(collected)) => collected.to_bytes(),
            Ok(Err(error)) => {
                self.metrics.unavailable.fetch_add(1, Ordering::Relaxed);
                return Err(DataCallError::Unavailable(format!(
                    "read response: {error}"
                )));
            }
            Err(_elapsed) => {
                self.metrics
                    .deadline_exceeded
                    .fetch_add(1, Ordering::Relaxed);
                return Err(DataCallError::DeadlineExceeded);
            }
        };

        let envelope: Envelope<DataOutcome> = serde_json::from_slice(&body).map_err(|error| {
            DataCallError::Unavailable(format!("decode data envelope: {error}"))
        })?;
        let elapsed = started.elapsed();

        match status {
            200 => {
                let outcome = envelope.data.ok_or_else(|| {
                    DataCallError::Unavailable("data envelope carries no payload".to_owned())
                })?;
                Ok(CallTrace {
                    outcome,
                    query_count,
                    items,
                    elapsed,
                })
            }
            // 失败 envelope：`data` 为 null，失败码与消息原样上抛。
            503 => {
                self.metrics.backpressure.fetch_add(1, Ordering::Relaxed);
                Err(DataCallError::Backpressure)
            }
            504 => {
                self.metrics
                    .deadline_exceeded
                    .fetch_add(1, Ordering::Relaxed);
                Err(DataCallError::DeadlineExceeded)
            }
            _ => Err(DataCallError::Failure(OperationFailure::new(
                &envelope.code,
                envelope.message,
            ))),
        }
    }

    /// Data 健康检查（不消耗业务操作调用）。
    pub async fn health(&self) -> Result<(), DataCallError> {
        let stream = TcpStream::connect(self.authority.as_str())
            .await
            .map_err(|error| DataCallError::Unavailable(format!("connect: {error}")))?;
        let (mut sender, connection) = hyper::client::conn::http1::handshake(TokioIo::new(stream))
            .await
            .map_err(|error| DataCallError::Unavailable(format!("http handshake: {error}")))?;
        tokio::spawn(async move {
            let _ = connection.await;
        });
        let request = Request::builder()
            .method("GET")
            .uri("/healthz")
            .header(HOST, self.authority.as_str())
            .body(Full::new(Bytes::new()))
            .map_err(|error| DataCallError::Unavailable(format!("build request: {error}")))?;
        let response = tokio::time::timeout(Duration::from_secs(2), sender.send_request(request))
            .await
            .map_err(|_| DataCallError::DeadlineExceeded)?
            .map_err(|error| DataCallError::Unavailable(format!("send request: {error}")))?;
        if response.status().is_success() {
            Ok(())
        } else {
            Err(DataCallError::Unavailable(format!(
                "data /healthz returned {}",
                response.status()
            )))
        }
    }

    /// 诊断输出（`/product/diagnostics`）。
    pub fn describe(&self) -> serde_json::Value {
        let (calls, backpressure, deadline, unavailable) = self.counters();
        json!({
            "authority": self.authority,
            "callsTotal": calls,
            "backpressureTotal": backpressure,
            "deadlineExceededTotal": deadline,
            "unavailableTotal": unavailable,
        })
    }
}

fn header_u32(headers: &hyper::HeaderMap, name: &str) -> Option<u32> {
    headers.get(name)?.to_str().ok()?.parse().ok()
}

/// 供日志使用：把失败形态映射成稳定字符串（Data 的领域失败码原样透传）。
impl DataCallError {
    pub fn code(&self) -> String {
        match self {
            DataCallError::Backpressure => codes::BACKPRESSURE.to_owned(),
            DataCallError::DeadlineExceeded => codes::DEADLINE_EXCEEDED.to_owned(),
            DataCallError::Unavailable(_) => codes::INTERNAL_ERROR.to_owned(),
            DataCallError::Failure(failure) => failure.code.clone(),
        }
    }
}
