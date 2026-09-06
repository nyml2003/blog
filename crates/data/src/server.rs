//! Data Server 进程生命周期：启动（迁移 + seed → bind → accept）与关停顺序。
//!
//! 关停（SPEC-OPS-RUNTIME-001-FAIL-009 / PLAN「Rust 运行时与 I/O 架构」）：
//!
//! ```text
//! 常驻（等信号）→ SIGTERM/SIGINT → 停止 accept → 限期排空在途请求
//!   → drop lane 通道句柄 → worker 自然退出（限期 5s）
//!   → 关闭连接池 → 正常退出删除 test 临时库（异常退出保留供诊断）
//! ```

use std::future::IntoFuture;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::net::TcpListener;

use crate::cli::{Cli, EXIT_RUN_FAILURE};
use crate::executor;
use crate::http::{self, AppState};
use crate::semantics::{Semantics, TempDb};
use crate::store::Store;

/// 在途请求排空预算；与线程 join 预算合计 5s（Spec 关停限期）。
pub const DRAIN_BUDGET: Duration = Duration::from_secs(2);
/// worker 退出限期；超限执行兜底清理。
pub const THREAD_JOIN_BUDGET: Duration = Duration::from_secs(3);

/// 进程入口：解析、启动、关停、清理。返回进程退出码。
pub fn run(mut cli: Cli) -> std::process::ExitCode {
    let started = Instant::now();
    cli.database_path_from_env();

    // `prod` 只是枚举位：本期不提供运行链路（PLAN 非目标）。
    if !cli.semantics.runnable() {
        crate::data_error!(
            "semantics '{}' is reserved for a later batch; this build runs mock and test only",
            cli.semantics.as_str()
        );
        return std::process::ExitCode::from(crate::cli::EXIT_USAGE);
    }

    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            crate::data_error!("build tokio current_thread runtime failed: {error}");
            return std::process::ExitCode::from(EXIT_RUN_FAILURE);
        }
    };

    let boot = match runtime.block_on(boot(&cli)) {
        Ok(boot) => boot,
        Err(message) => {
            crate::data_error!("{message}");
            return std::process::ExitCode::from(EXIT_RUN_FAILURE);
        }
    };

    let state = runtime.block_on(serve(boot));

    let workers = executor::join_workers(state.executor.take_join_handles(), THREAD_JOIN_BUDGET);
    if workers.all_exited() {
        crate::data_info!(
            "workers exited {}/{} in {}ms",
            workers.exited,
            workers.total,
            workers.elapsed.as_millis()
        );
    } else {
        crate::data_error!(
            "worker join deadline exceeded after {}ms; forcing cleanup (exited {}/{})",
            workers.elapsed.as_millis(),
            workers.exited,
            workers.total
        );
    }
    // 兜底清理：正常路径删除 test 临时库；worker 未退出也照删（进程随即结束）。
    state.store.remove_storage();
    crate::data_info!(
        "shutdown complete elapsed_total_ms={} semantics={}",
        started.elapsed().as_millis(),
        state.semantics.as_str()
    );
    std::process::ExitCode::SUCCESS
}

struct Boot {
    listener: TcpListener,
    state: Arc<AppState>,
}

/// 迁移 + seed → 绑定监听（数据先于服务就绪，FAIL-002）。
async fn boot(cli: &Cli) -> Result<Boot, String> {
    crate::data_info!(
        "starting semantics={} listen={} pid={}",
        cli.semantics.as_str(),
        cli.listen,
        std::process::id()
    );

    let store = match cli.semantics {
        Semantics::Mock => {
            // mock 语义：不创建、不打开任何 SQLite 文件（MODE-002）。
            crate::data_info!(
                "sqlite disabled (mock semantics: no database file is created or opened)"
            );
            Store::mock()
        }
        Semantics::Test => {
            let temp = TempDb::resolve(cli.database_path.as_deref());
            crate::data_info!(
                "test db path={} pid={} injected={}",
                temp.path().display(),
                std::process::id(),
                cli.database_path.is_some()
            );
            Store::open_test(temp).await?
        }
        Semantics::Prod => unreachable!("prod is rejected before boot"),
    };
    if !store.uses_sqlite() {
        crate::data_info!("storage=memory");
    }

    let listener = TcpListener::bind(cli.listen)
        .await
        .map_err(|error| format!("bind {}: {error}", cli.listen))?;
    let bound_addr = listener
        .local_addr()
        .map_err(|error| format!("resolve bound address: {error}"))?;
    crate::data_info!(
        "listening addr={bound_addr} semantics={}",
        cli.semantics.as_str()
    );

    Ok(Boot {
        listener,
        state: Arc::new(AppState::new(store, bound_addr.to_string())),
    })
}

/// accept + 限期排空 + 释放通道句柄 + 关闭连接池。
///
/// 关停是**两段式**的：阶段 0 里 `server` 与信号并发等待（信号之前进程常驻），
/// 信号到达后才进入阶段 1-2 为排空计时——限期预算只作用于「信号之后」的收尾，
/// 既不会误杀正常运行的进程，也不会把在途请求排空拖过限期。
async fn serve(boot: Boot) -> Arc<AppState> {
    let Boot { listener, state } = boot;
    let app = http::router(Arc::clone(&state));

    // 单一信号源：graceful shutdown 与下面的等待共用，避免竞态与重复监听。
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
                crate::data_error!("server terminated with error: {error}");
            }
            server_finished = true;
        }
        _ = signal_changed(signal_rx.clone()) => {}
    }
    crate::data_info!("phase=1 stop accept (no new connections)");

    // 阶段 1-2：限期排空在途请求（预算从停止 accept 之后才起算）。
    let drained = if server_finished {
        true
    } else {
        tokio::select! {
            result = &mut server => {
                if let Err(error) = result {
                    crate::data_error!("server terminated with error: {error}");
                }
                true
            }
            _ = tokio::time::sleep(DRAIN_BUDGET) => false,
        }
    };
    if drained {
        crate::data_info!("phase=2 in-flight requests drained");
    } else {
        crate::data_error!(
            "phase=2 drain budget exceeded after {}ms; abandoning remaining connections",
            DRAIN_BUDGET.as_millis()
        );
    }
    crate::data_info!("phase=3 release lane channel handles");
    state.executor.release_handles();
    state.store.shutdown().await;
    state
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
        _ = sigterm.recv() => crate::data_info!("signal received signal=SIGTERM"),
        _ = sigint.recv() => crate::data_info!("signal received signal=SIGINT"),
    }
}

/// 供测试与运行文档核对：默认监听地址形态。
#[allow(dead_code)]
pub fn default_listen() -> SocketAddr {
    crate::cli::DEFAULT_LISTEN
        .parse()
        .expect("valid default listen")
}
