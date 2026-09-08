//! Product API 进程入口。
//!
//! - 不访问 SQLite（Product 无 SQLx 依赖，数据一律经 Data 的 typed operations）；
//! - `BLOG_WEB_DIR` / `--web-dir` 指向 `web/dist` 时同源挂载页面与静态资源（MODE-004）；
//! - Tokio `current_thread` + axum/hyper；
//! - 收到 SIGTERM/SIGINT：停止 accept → 限期排空在途请求 → 退出。

mod bff;
mod cli;
#[allow(dead_code)]
mod content_contract;
mod content_service;
mod content_sync;
#[allow(dead_code)]
mod content_workspace;
mod data_client;
#[allow(dead_code)]
mod github;
mod http;
mod logging;
mod model_review;
mod static_files;
#[allow(dead_code)]
mod taxonomy_changes;

use std::future::IntoFuture;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::net::TcpListener;

use crate::cli::{Cli, CliError, ContentSource, EXIT_RUN_FAILURE, EXIT_USAGE, ProductAction};
use crate::data_client::DataClient;
use crate::http::AppState;
use product::auth::{ProductionAuthRuntime, ProductionAuthState};

/// 在途请求排空预算（与 Spec 关停限期 5s 对齐，本批无后台线程需要等待）。
const DRAIN_BUDGET: Duration = Duration::from_secs(5);

fn main() -> ExitCode {
    let started = Instant::now();
    let cli = match Cli::parse(std::env::args().skip(1)) {
        Ok(cli) => cli,
        Err(CliError::Help(text)) => {
            println!("{text}");
            return ExitCode::SUCCESS;
        }
        Err(CliError::Usage(message)) => {
            crate::product_error!("usage: {message}");
            return ExitCode::from(EXIT_USAGE);
        }
    };
    if cli.action == ProductAction::InitializeContentRepository {
        return initialize_content_repository(&cli);
    }
    let data = match DataClient::new(&cli.data_addr) {
        Ok(data) => data,
        Err(message) => {
            crate::product_error!("invalid data address: {message}");
            return ExitCode::from(EXIT_USAGE);
        }
    };

    crate::product_info!(
        "starting listen={} data_addr={} web_dir={} pid={}",
        cli.listen,
        cli.data_addr,
        cli.web_dir
            .as_ref()
            .map(|path| path.display().to_string())
            .unwrap_or_else(|| "none".to_owned()),
        std::process::id()
    );

    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            crate::product_error!("build tokio current_thread runtime failed: {error}");
            return ExitCode::from(EXIT_RUN_FAILURE);
        }
    };

    runtime.block_on(run(cli, data, started))
}

async fn run(cli: Cli, data: DataClient, started: Instant) -> ExitCode {
    // Data 就绪先于 Product 对外就绪（FAIL-002 的进程内半边；跨进程顺序由 ops 保证）。
    // 本批只做就绪观察并记录，不做启动失败（不接管 ops 的编排职责）。
    readiness_probe(&data).await;
    let auth = Arc::new(ProductionAuthRuntime::from_environment());
    match auth.state() {
        ProductionAuthState::Configured(_) => {
            crate::product_info!("admin authentication configured");
        }
        ProductionAuthState::Unavailable(reasons) => {
            crate::product_error!("admin authentication unavailable reasons={reasons:?}");
        }
    }

    let model: Box<dyn model_review::TaxonomyModel> = match model_review::ClaudeCliModel::from_env()
    {
        Ok(model) => Box::new(model),
        Err(message) => {
            crate::product_error!("taxonomy model unavailable: {message}");
            Box::new(model_review::UnavailableModel::new(message))
        }
    };
    let github_source = cli.content_source == ContentSource::Github;
    let remote = match cli.content_source {
        ContentSource::Fixture => github::ConfiguredRemote::Fixture(github::MockGithub::default()),
        ContentSource::Github => {
            match (cli.content_repo.as_deref(), cli.content_token.as_deref()) {
                (Some(repo), Some(token)) => match github::GithubRemote::production(repo, token) {
                    Ok(remote) => github::ConfiguredRemote::Github(remote),
                    Err(error) => {
                        crate::product_error!(
                            "content source unavailable; serving last good cache: {error}"
                        );
                        github::ConfiguredRemote::Unavailable(github::UnavailableRemote::new(
                            "GitHub content source configuration is invalid",
                        ))
                    }
                },
                _ => {
                    crate::product_error!(
                        "content source unavailable; serving last good cache: GitHub credentials are incomplete"
                    );
                    github::ConfiguredRemote::Unavailable(github::UnavailableRemote::new(
                        "GitHub content source credentials are unavailable",
                    ))
                }
            }
        }
    };
    let content = match content_service::ContentService::load(data.clone(), remote, model).await {
        Ok(service) => service,
        Err(error) => {
            crate::product_error!("load startup content workflow: {error}");
            return ExitCode::from(EXIT_RUN_FAILURE);
        }
    };
    if github_source {
        if let Err(error) = content.synchronize().await {
            crate::product_error!("startup content sync failed; serving last good cache: {error}");
        }
    }
    let listener = match TcpListener::bind(cli.listen).await {
        Ok(listener) => listener,
        Err(error) => {
            crate::product_error!("bind {}: {error}", cli.listen);
            return ExitCode::from(EXIT_RUN_FAILURE);
        }
    };
    let bound_addr = match listener.local_addr() {
        Ok(addr) => addr,
        Err(error) => {
            crate::product_error!("resolve bound address: {error}");
            return ExitCode::from(EXIT_RUN_FAILURE);
        }
    };
    crate::product_info!("listening addr={bound_addr}");

    let static_files = cli.web_dir.as_ref().map(|root| {
        let files = static_files::StaticFiles::new(root.clone());
        crate::product_info!("static mounted web_dir={} ", files.root().display());
        files
    });
    let app = http::router(Arc::new(AppState {
        data,
        content,
        bound_addr: bound_addr.to_string(),
        web_dir: cli.web_dir,
        static_files,
        started,
        auth,
    }));
    // 排空限时必须在**收到信号之后**才起算：先在 server 与信号之间等待（信号之前进程常驻），
    // 再进入限期排空。若把 deadline 与 server 一起 `select!`，进程会在 DRAIN_BUDGET 后自行
    // `exit 0`，而 ops 会把长驻服务的自行退出视为 CHILD_EXITED 并停掉整个模式。
    // 单一信号源：graceful shutdown 与下面的等待共用同一个 watch，避免重复安装监听。
    let (signal_tx, signal_rx) = tokio::sync::watch::channel(false);
    tokio::spawn(async move {
        shutdown_signal().await;
        let _ = signal_tx.send(true);
    });
    let graceful = {
        let mut signal_rx = signal_rx.clone();
        async move {
            let _ = signal_rx.changed().await;
        }
    };
    let server = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(graceful)
    .into_future();
    tokio::pin!(server);

    let mut server_finished = false;
    tokio::select! {
        result = &mut server => {
            if let Err(error) = result {
                crate::product_error!("server terminated with error: {error}");
            }
            server_finished = true;
        }
        _ = signal_changed(signal_rx.clone()) => {}
    }
    crate::product_info!("phase=1 stop accept (no new connections)");

    let drained = if server_finished {
        true
    } else {
        tokio::select! {
            result = &mut server => {
                if let Err(error) = result {
                    crate::product_error!("server terminated with error: {error}");
                }
                true
            }
            _ = tokio::time::sleep(DRAIN_BUDGET) => false,
        }
    };
    if drained {
        crate::product_info!("phase=2 in-flight requests drained");
    } else {
        crate::product_error!(
            "phase=2 drain budget exceeded after {}ms; abandoning remaining connections",
            DRAIN_BUDGET.as_millis()
        );
    }
    crate::product_info!(
        "shutdown complete elapsed_total_ms={}",
        started.elapsed().as_millis()
    );
    ExitCode::SUCCESS
}

fn initialize_content_repository(cli: &Cli) -> ExitCode {
    let Some(repository) = cli.content_repo.as_deref() else {
        crate::product_error!("usage: BLOG_CONTENT_REPO is required for repository initialization");
        return ExitCode::from(EXIT_USAGE);
    };
    let Some(token) = cli.content_token.as_deref() else {
        crate::product_error!(
            "usage: BLOG_CONTENT_TOKEN is required for repository initialization"
        );
        return ExitCode::from(EXIT_USAGE);
    };
    let mut remote = match github::GithubRemote::production(repository, token) {
        Ok(remote) => remote,
        Err(error) => {
            crate::product_error!("content repository configuration invalid: {error}");
            return ExitCode::from(EXIT_USAGE);
        }
    };
    match remote.initialize_empty_main() {
        Ok(commit) => {
            crate::product_info!("content repository initialized main_commit={commit}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            crate::product_error!("content repository initialization failed: {error}");
            ExitCode::from(EXIT_RUN_FAILURE)
        }
    }
}

/// 观察 Data 健康状态：最多等待 `PROBE_BUDGET`，失败仅记录（不决定进程退出）。
async fn readiness_probe(data: &DataClient) {
    const PROBE_BUDGET: Duration = Duration::from_secs(2);
    const PROBE_INTERVAL: Duration = Duration::from_millis(100);
    let started = Instant::now();
    loop {
        match data.health().await {
            Ok(()) => {
                crate::product_info!(
                    "data readiness ok data_addr={} elapsed_ms={}",
                    data.describe()["authority"],
                    started.elapsed().as_millis()
                );
                return;
            }
            Err(error) => {
                if started.elapsed() >= PROBE_BUDGET {
                    crate::product_error!(
                        "data readiness not confirmed after {}ms ({}); continuing, ops owns the start order",
                        started.elapsed().as_millis(),
                        error.code()
                    );
                    return;
                }
                tokio::time::sleep(PROBE_INTERVAL).await;
            }
        }
    }
}

/// 等待关停信号位被置起（watch 的 `changed` 天然抗竞态）。
async fn signal_changed(mut signal_rx: tokio::sync::watch::Receiver<bool>) {
    let _ = signal_rx.changed().await;
}

async fn shutdown_signal() {
    use tokio::signal::unix::{SignalKind, signal};
    let mut sigterm = signal(SignalKind::terminate()).expect("install SIGTERM handler");
    let mut sigint = signal(SignalKind::interrupt()).expect("install SIGINT handler");
    tokio::select! {
        _ = sigterm.recv() => crate::product_info!("signal received signal=SIGTERM"),
        _ = sigint.recv() => crate::product_info!("signal received signal=SIGINT"),
    }
}
