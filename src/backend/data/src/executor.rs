//! 同步线程池执行器：有界通道 + `try_send` 背压 + `oneshot` 回程 + 协作式取消。
//!
//! 结构（PLAN「Rust 运行时与 I/O 架构」）：
//!
//! ```text
//! axum handler (tokio current_thread)
//!   └─ Executor::submit ── try_send(Job) ──► crossbeam bounded channel (io: 64 / cpu: 4)
//!                                                │
//!                oneshot::Receiver ◄── reply ── worker thread (io: 8 / cpu: 1)
//! ```
//!
//! - 通道满：`try_send` 立即失败 → handler 返回 `503` + `BACKPRESSURE` envelope；
//! - 取消：回程 `oneshot` 被丢弃（客户端断开/预算耗尽）即取消信号，worker 在
//!   **批次间隙**检查，检测到后回到 `recv()`，不退出线程；
//! - 关停：drop 全部 send 句柄 → worker 自然排空并退出 → 限期 join，超限兜底清理。

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use crossbeam_channel::{Receiver, Sender, TrySendError, bounded};
use tokio::sync::oneshot;

use crate::store::{DataStore, Meter, OpCtx, dispatch};
use protocol::envelope::codes;
use protocol::{
    DataOperation, DataOutcome, Lane, LaneDiagnostics, OperationDiag, OperationFailure,
};

/// worker → 业务侧的执行结果（失败码穿通道保留）。
pub type JobOutcome = Result<DataOutcome, OperationFailure>;

/// 回程载荷：业务结果 + 单次操作诊断（供 HTTP 层写响应头与日志）。
pub struct JobResult {
    pub outcome: JobOutcome,
    pub diag: OperationDiag,
}

/// 一次投递的任务；`reply` 的关闭即是取消信号。
pub struct Job {
    pub request_id: String,
    pub operation: DataOperation,
    pub budget: Duration,
    pub reply: oneshot::Sender<JobResult>,
}

/// 取消信号视图：只暴露「是否已取消」，不让 store 依赖 tokio 类型。
pub struct CancelCheck<'a> {
    reply: &'a oneshot::Sender<JobResult>,
}

impl<'a> CancelCheck<'a> {
    pub fn new(reply: &'a oneshot::Sender<JobResult>) -> Self {
        Self { reply }
    }

    /// 回程通道已被丢弃（客户端断开或预算耗尽）。
    pub fn is_canceled(&self) -> bool {
        self.reply.is_closed()
    }
}

#[derive(Debug, Default)]
struct LaneCounters {
    accepted: AtomicU64,
    /// 已被 worker 取走（用于区分 queued 与 in_flight）。
    picked: AtomicU64,
    rejected: AtomicU64,
    completed: AtomicU64,
    canceled: AtomicU64,
}

impl LaneCounters {
    fn snapshot(&self, lane: Lane, capacity: usize) -> LaneDiagnostics {
        let accepted = self.accepted.load(Ordering::Relaxed);
        let picked = self.picked.load(Ordering::Relaxed);
        let completed = self.completed.load(Ordering::Relaxed);
        let canceled = self.canceled.load(Ordering::Relaxed);
        LaneDiagnostics {
            lane,
            capacity,
            threads: lane.threads(),
            queued: accepted.saturating_sub(picked) as usize,
            in_flight: picked.saturating_sub(completed + canceled),
            accepted,
            rejected: self.rejected.load(Ordering::Relaxed),
            completed,
            canceled,
        }
    }
}

/// 一个 lane 的投递端；`tx` 存在 `Option` 里，`release()` 取出并 drop 触发自然排空。
struct LaneHandle {
    lane: Lane,
    counters: Arc<LaneCounters>,
    tx: Mutex<Option<Sender<Job>>>,
}

impl LaneHandle {
    fn submit(&self, job: Job) -> Result<(), OperationFailure> {
        let guard = self.tx.lock().expect("lane tx mutex poisoned");
        let result = match guard.as_ref() {
            Some(tx) => tx.try_send(job),
            None => Err(TrySendError::Disconnected(job)),
        };
        drop(guard);
        match result {
            Ok(()) => {
                self.counters.accepted.fetch_add(1, Ordering::Relaxed);
                Ok(())
            }
            Err(TrySendError::Full(_)) => {
                self.counters.rejected.fetch_add(1, Ordering::Relaxed);
                let message = format!(
                    "lane '{}' queue is full (capacity {}); rejecting request",
                    self.lane.name(),
                    self.lane.capacity()
                );
                Err(OperationFailure::new(codes::BACKPRESSURE, message))
            }
            Err(TrySendError::Disconnected(_)) => {
                let message = format!("lane '{}' is shutting down", self.lane.name());
                Err(OperationFailure::new(codes::INTERNAL_ERROR, message))
            }
        }
    }

    fn snapshot(&self) -> LaneDiagnostics {
        self.counters.snapshot(self.lane, self.lane.capacity())
    }
}

/// Data 的同步执行层；在 tokio `current_thread` runtime 之外运行全部阻塞工作。
pub struct Executor {
    lanes: Vec<LaneHandle>,
    query_count_total: Arc<AtomicU64>,
    handles: Mutex<Vec<JoinHandle<()>>>,
}

impl Executor {
    /// 启动 I/O 8 线程 + CPU 1 线程，每 lane 一条有界通道。
    pub fn start(store: Arc<dyn DataStore>) -> Self {
        let query_count_total = Arc::new(AtomicU64::new(0));
        let mut lanes = Vec::new();
        let mut handles = Vec::new();
        for lane in [Lane::Io, Lane::Cpu] {
            let (tx, rx) = bounded::<Job>(lane.capacity());
            let counters = Arc::new(LaneCounters::default());
            lanes.push(LaneHandle {
                lane,
                counters: Arc::clone(&counters),
                tx: Mutex::new(Some(tx)),
            });
            for index in 0..lane.threads() {
                let receiver = rx.clone();
                let counters = Arc::clone(&counters);
                let store = Arc::clone(&store);
                let query_total = Arc::clone(&query_count_total);
                let worker = std::thread::Builder::new()
                    .name(format!("data-{}-{index}", lane.name()))
                    .spawn(move || worker_loop(lane, receiver, counters, store, query_total))
                    .expect("spawn data worker thread");
                handles.push(worker);
            }
            // `rx` 的原始句柄在此处离开作用域被 drop；
            // 只有 `release_handles()` drop 掉 `tx` 之后 worker 才会观察到断开并退出。
        }
        crate::data_info!(
            "executor started lanes=[io threads={} capacity={}] [cpu threads={} capacity={}]",
            Lane::Io.threads(),
            Lane::Io.capacity(),
            Lane::Cpu.threads(),
            Lane::Cpu.capacity()
        );
        Self {
            lanes,
            query_count_total,
            handles: Mutex::new(handles),
        }
    }

    /// 投递一次 typed operation；通道满即返回背压失败（调用方转 503）。
    pub fn submit(
        &self,
        request_id: String,
        operation: DataOperation,
        budget: Duration,
        reply: oneshot::Sender<JobResult>,
    ) -> Result<(), OperationFailure> {
        let lane = operation.lane();
        let operation_name = operation.name();
        let handle = self
            .lanes
            .iter()
            .find(|candidate| candidate.lane == lane)
            .expect("every lane has a handle");
        let job = Job {
            request_id: request_id.clone(),
            operation,
            budget,
            reply,
        };
        match handle.submit(job) {
            Ok(()) => Ok(()),
            Err(failure) => {
                crate::data_info!(
                    "op={} lane={} rejected reason={} request_id={}",
                    operation_name,
                    lane.name(),
                    failure.code,
                    request_id
                );
                Err(failure)
            }
        }
    }

    /// 当前 lane 诊断与累计查询计数。
    pub fn diagnostics(&self) -> (Vec<LaneDiagnostics>, u64) {
        let lanes = self.lanes.iter().map(LaneHandle::snapshot).collect();
        (lanes, self.query_count_total.load(Ordering::Relaxed))
    }

    /// 关停第一步：drop 全部 send 句柄。worker 排空队列后观察到断开并自然退出。
    /// 幂等：重复调用只记录一次。
    pub fn release_handles(&self) {
        for handle in &self.lanes {
            let mut guard = handle.tx.lock().expect("lane tx mutex poisoned");
            if guard.take().is_some() {
                crate::data_info!(
                    "released lane channel handle lane={} capacity={}",
                    handle.lane.name(),
                    handle.lane.capacity()
                );
            }
        }
    }

    /// 关停第二步：取走全部 worker 线程句柄（一次性）。
    pub fn take_join_handles(&self) -> Vec<JoinHandle<()>> {
        let mut guard = self.handles.lock().expect("worker handles mutex poisoned");
        std::mem::take(&mut *guard)
    }
}

pub struct JoinReport {
    pub exited: usize,
    pub total: usize,
    pub elapsed: Duration,
}

impl JoinReport {
    pub fn all_exited(&self) -> bool {
        self.exited == self.total
    }
}

/// 关停第三步：限期等待 worker 退出；超时则停止等待（兜底清理由调用方执行）。
pub fn join_workers(handles: Vec<JoinHandle<()>>, deadline: Duration) -> JoinReport {
    let started = Instant::now();
    let total = handles.len();
    let (done_tx, done_rx) = std::sync::mpsc::channel::<()>();
    for handle in handles {
        let done_tx = done_tx.clone();
        // watcher 线程独立于 worker；join 超时后由进程退出统一回收。
        let _ = std::thread::Builder::new()
            .name("data-worker-join".to_owned())
            .spawn(move || {
                let _ = handle.join();
                let _ = done_tx.send(());
            });
    }
    drop(done_tx);

    let mut exited = 0usize;
    let mut remaining = deadline;
    while exited < total {
        if remaining.is_zero() {
            break;
        }
        match done_rx.recv_timeout(remaining) {
            Ok(()) => exited += 1,
            Err(_) => break,
        }
        remaining = deadline.saturating_sub(started.elapsed());
    }

    JoinReport {
        exited,
        total,
        elapsed: started.elapsed(),
    }
}

fn worker_loop(
    lane: Lane,
    receiver: Receiver<Job>,
    counters: Arc<LaneCounters>,
    store: Arc<dyn DataStore>,
    query_count_total: Arc<AtomicU64>,
) {
    crate::data_info!("worker ready lane={}", lane.name());
    loop {
        // 通道断开（所有 send 句柄已 drop）且队列已排空 → 线程退出。
        let Ok(job) = receiver.recv() else {
            break;
        };
        counters.picked.fetch_add(1, Ordering::Relaxed);
        let started = Instant::now();

        // 取消发生在投递与取走之间：不执行任何业务代码，直接回到 recv()。
        if job.reply.is_closed() {
            counters.canceled.fetch_add(1, Ordering::Relaxed);
            crate::data_info!(
                "op={} lane={} canceled=before_start request_id={}",
                job.operation.name(),
                lane.name(),
                job.request_id
            );
            continue;
        }

        let meter = Meter::new();
        let outcome = {
            let ctx = OpCtx {
                budget: job.budget,
                cancel: CancelCheck::new(&job.reply),
                meter: &meter,
                started,
            };
            dispatch(store.as_ref(), &job.operation, &ctx)
        };
        let canceled = job.reply.is_closed();
        let item_count = outcome
            .as_ref()
            .map(|value| value.item_count())
            .unwrap_or(0);
        let query_count = meter.get();
        let elapsed = started.elapsed();
        // 回程通道可能已关闭：发送失败即静默丢弃结果（客户端已不可达）。
        let _ = job.reply.send(JobResult {
            outcome,
            diag: OperationDiag {
                operation: job.operation.name().to_owned(),
                lane: Some(lane),
                item_count,
                query_count,
                elapsed_ms: elapsed.as_millis(),
                canceled,
            },
        });

        if canceled {
            counters.canceled.fetch_add(1, Ordering::Relaxed);
        } else {
            counters.completed.fetch_add(1, Ordering::Relaxed);
        }
        query_count_total.fetch_add(u64::from(query_count), Ordering::Relaxed);

        crate::data_info!(
            "op={} lane={} request_id={} items={} queries={} elapsed_ms={} canceled={}",
            job.operation.name(),
            lane.name(),
            job.request_id,
            item_count,
            query_count,
            elapsed.as_millis(),
            canceled
        );
    }
    crate::data_info!("worker stopped lane={}", lane.name());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    use protocol::{ArticleListQuery, DataOutcome};

    fn list_operation(page_size: u32) -> DataOperation {
        DataOperation::ArticleList(ArticleListQuery {
            page: Some(1),
            page_size: Some(page_size),
            published_only: true,
            ..ArticleListQuery::default()
        })
    }

    /// 测试辅助：显式 current_thread runtime，驱动回程 `oneshot` 等待。
    fn test_runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("test runtime")
    }

    #[test]
    fn fixed_query_count_regardless_of_item_count() {
        let store = Store::mock();
        let executor = Executor::start(store.handle());
        let runtime = test_runtime();

        let mut seen = Vec::new();
        for page_size in [1u32, 20, 100] {
            let (tx, rx) = oneshot::channel::<JobResult>();
            executor
                .submit(
                    format!("req-{page_size}"),
                    list_operation(page_size),
                    Duration::from_secs(5),
                    tx,
                )
                .expect("submitted");
            let result = runtime.block_on(rx).expect("reply received");
            assert_eq!(result.diag.query_count, 3, "fixed query count per list op");
            let DataOutcome::ArticleList(page) = result.outcome.expect("ok") else {
                panic!("unexpected outcome");
            };
            assert_eq!(
                page.items.len() as i64,
                page.total.min(i64::from(page_size))
            );
            seen.push((page_size, page.items.len()));
        }
        assert_eq!(seen, vec![(1, 1), (20, 20), (100, 45)]);

        let (lanes, query_total) = executor.diagnostics();
        let io = lanes.iter().find(|lane| lane.lane == Lane::Io).unwrap();
        assert_eq!(io.completed, 3);
        assert_eq!(io.rejected, 0);
        // 3 次请求 x 每次 3 条查询（count + page + 批量 terms），与条目数无关。
        assert_eq!(query_total, 9);

        executor.release_handles();
        let report = join_workers(executor.take_join_handles(), Duration::from_secs(2));
        assert!(
            report.all_exited(),
            "workers exit after channel handles drop"
        );
    }

    #[test]
    fn routes_operations_to_the_declared_lane() {
        let store = Store::mock();
        let executor = Executor::start(store.handle());
        let runtime = test_runtime();

        // CPU 操作落在 cpu lane（纯内存计算），业务读取落在 io lane。
        let (tx, rx) = oneshot::channel::<JobResult>();
        executor
            .submit(
                "digest".to_owned(),
                DataOperation::DiagnosticDigest(protocol::DiagnosticDigest {
                    input: "blog".to_owned(),
                    rounds: 8,
                }),
                Duration::from_secs(5),
                tx,
            )
            .expect("submitted");
        let result = runtime.block_on(rx).expect("reply received");
        assert_eq!(result.diag.lane, Some(Lane::Cpu));
        assert_eq!(result.diag.query_count, 0);
        executor.release_handles();
    }

    #[test]
    fn rejects_when_lane_queue_is_full() {
        let store = Store::mock();
        let executor = Executor::start(store.handle());

        // io lane：8 worker + 容量 64 = 最多 72 个任务在途/排队，第 73 个投递被拒。
        // 任务时长大于整个投递循环，保证通道在循环内被灌满。
        let operation = DataOperation::DiagnosticSlow(protocol::DiagnosticSlow {
            batches: 1,
            batch_ms: 40,
        });
        let mut rejected = 0u64;
        for index in 0..90u32 {
            let (tx, rx) = oneshot::channel::<JobResult>();
            match executor.submit(
                format!("slow-{index}"),
                operation.clone(),
                Duration::from_secs(5),
                tx,
            ) {
                Ok(()) => std::mem::forget(rx),
                Err(failure) => {
                    assert_eq!(failure.code, codes::BACKPRESSURE);
                    rejected += 1;
                }
            }
        }
        assert!(rejected > 0, "expected at least one backpressure rejection");
        let (lanes, _) = executor.diagnostics();
        let io = lanes.iter().find(|lane| lane.lane == Lane::Io).unwrap();
        assert_eq!(io.rejected, rejected);
        assert!(
            io.accepted <= 72,
            "accepted must not exceed workers + capacity, got {}",
            io.accepted
        );
        executor.release_handles();
    }
}
