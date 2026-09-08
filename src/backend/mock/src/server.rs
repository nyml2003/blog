//! Mock 进程生命周期：启动（全量状态重置 → bind → accept）与两段式关停。
//!
//! 与 `crates/product`/`crates/data` 同一形态（ops 对三类服务使用同一套启动、日志
//! 与关停协议）：
//!
//! ```text
//! 常驻（等信号）→ SIGTERM/SIGINT → phase=1 停止 accept → phase=2 限期排空在途请求
//! ```
//!
//! 排空限时必须在**收到信号之后**才起算：若把 deadline 与 server 一起 `select!`，
//! 进程会在预算后自行 `exit 0`，而 ops 把长驻服务的自行退出视为 `CHILD_EXITED`
//! 并停掉整个模式（Product 侧的回归测试 `tests/residency.rs` 记录了这个 bug）。

use std::future::IntoFuture;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::net::TcpListener;

use crate::cli::{Cli, EXIT_RUN_FAILURE};
use crate::http::{self, AppState};
use crate::store::Store;

/// 在途请求排空预算（与 Spec 关停限期 5s 对齐；Mock 无后台线程，只有 HTTP 在途请求）。
pub const DRAIN_BUDGET: Duration = Duration::from_secs(5);

/// 进程入口：解析后的 CLI → 启动 → 关停。返回进程退出码。
pub fn run(cli: Cli) -> ExitCode {
    let started = Instant::now();

    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            crate::mock_error!("build tokio current_thread runtime failed: {error}");
            return ExitCode::from(EXIT_RUN_FAILURE);
        }
    };

    runtime.block_on(serve(cli, started))
}

async fn serve(cli: Cli, started: Instant) -> ExitCode {
    // 启动即重置全部状态：每个 session（含匿名空间）都从场景种子开始，
    // 没有任何跨进程残留（PLAN：每次 runtime 启动/测试运行重新初始化）。
    let store = Arc::new(Store::new(cli.scenario));
    crate::mock_info!(
        "starting scenario={} admin_auth={} listen={} sessions=isolated pid={}",
        cli.scenario.name(),
        cli.admin_auth.name(),
        cli.listen,
        std::process::id()
    );

    let listener = match TcpListener::bind(cli.listen).await {
        Ok(listener) => listener,
        Err(error) => {
            crate::mock_error!("bind {}: {error}", cli.listen);
            return ExitCode::from(EXIT_RUN_FAILURE);
        }
    };
    let bound_addr = match listener.local_addr() {
        Ok(addr) => addr,
        Err(error) => {
            crate::mock_error!("resolve bound address: {error}");
            return ExitCode::from(EXIT_RUN_FAILURE);
        }
    };
    crate::mock_info!(
        "listening addr={bound_addr} scenario={} admin_auth={} session_header={}",
        cli.scenario.name(),
        cli.admin_auth.name(),
        crate::store::SESSION_HEADER
    );

    let app = http::router(Arc::new(AppState {
        store: Arc::clone(&store),
        bound_addr: bound_addr.to_string(),
        started,
    }));

    // 单一信号源：graceful shutdown 与下面的等待共用同一个 watch，避免竞态与重复监听。
    let (signal_tx, signal_rx) = tokio::sync::watch::channel(false);
    tokio::spawn(async move {
        shutdown_signal().await;
        let _ = signal_tx.send(true);
    });
    let graceful = signal_changed(signal_rx.clone());
    let server = axum::serve(listener, app)
        .with_graceful_shutdown(graceful)
        .into_future();
    tokio::pin!(server);

    // 阶段 0：常驻。信号到达（或 server 自行结束）即停止 accept。
    let mut server_finished = false;
    tokio::select! {
        result = &mut server => {
            if let Err(error) = result {
                crate::mock_error!("server terminated with error: {error}");
            }
            server_finished = true;
        }
        _ = signal_changed(signal_rx.clone()) => {}
    }
    crate::mock_info!("phase=1 stop accept (no new connections)");

    // 阶段 1-2：限期排空在途请求（预算从停止 accept 之后才起算）。
    let drained = if server_finished {
        true
    } else {
        tokio::select! {
            result = &mut server => {
                if let Err(error) = result {
                    crate::mock_error!("server terminated with error: {error}");
                }
                true
            }
            _ = tokio::time::sleep(DRAIN_BUDGET) => false,
        }
    };
    if drained {
        crate::mock_info!("phase=2 in-flight requests drained");
    } else {
        crate::mock_error!(
            "phase=2 drain budget exceeded after {}ms; abandoning remaining connections",
            DRAIN_BUDGET.as_millis()
        );
    }
    crate::mock_info!(
        "shutdown complete scenario={} requests={} writes={} faults={} elapsed_total_ms={}",
        store.scenario().name(),
        store.counters().api_requests(),
        store.counters().write_attempts(),
        store.counters().faults_served(),
        started.elapsed().as_millis()
    );
    ExitCode::SUCCESS
}

/// 等待关停信号位被置起（watch 的 `changed` 天然抗竞态）。
async fn signal_changed(mut signal_rx: tokio::sync::watch::Receiver<bool>) {
    let _ = signal_rx.changed().await;
}

/// SIGTERM / SIGINT；两者执行相同关停顺序。
async fn shutdown_signal() {
    use tokio::signal::unix::{SignalKind, signal};
    let mut sigterm = signal(SignalKind::terminate()).expect("install SIGTERM handler");
    let mut sigint = signal(SignalKind::interrupt()).expect("install SIGINT handler");
    tokio::select! {
        _ = sigterm.recv() => crate::mock_info!("signal received signal=SIGTERM"),
        _ = sigint.recv() => crate::mock_info!("signal received signal=SIGINT"),
    }
}
