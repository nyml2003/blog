//! Data 进程参数与环境变量注入。
//!
//! 进程参数（服务 binary 契约，供 ops runtime 调用）：
//!
//! ```text
//! data [--listen <IP:PORT>] [--data-semantics mock|test|prod] [--data-database-path <PATH>]
//! ```
//!
//! 环境变量注入（ops 计算，附录 A 已回写为契约）：
//! - `BLOG_DATABASE_PATH`：test 语义的 SQLite 路径（ops 注入 `target/test-dbs/<PID>`）。
//!
//! 优先级：显式参数 > 注入的环境变量 > 内置默认值。监听地址固定 `127.0.0.1`，
//! 本期不提供 `--host`/`--listen` 以外的地址形态。

use std::net::SocketAddr;
use std::path::PathBuf;

use crate::semantics::Semantics;

/// 用法/配置错误退出码（与 ops 顶层退出码一致，便于 CHILD_EXITED 诊断）。
pub const EXIT_USAGE: u8 = 10;
/// 执行失败退出码。
pub const EXIT_RUN_FAILURE: u8 = 20;

pub const DEFAULT_LISTEN: &str = "127.0.0.1:8081";
/// `BLOG_DATABASE_PATH`：test 语义的 SQLite 路径注入点（Spec「环境变量与配置注入」表）。
pub const DATABASE_PATH_ENV: &str = "BLOG_DATABASE_PATH";

#[derive(Debug, Clone)]
pub struct Cli {
    pub listen: SocketAddr,
    pub semantics: Semantics,
    pub database_path: Option<PathBuf>,
}

#[derive(Debug)]
pub enum CliError {
    /// `--help`：文本输出到 stdout，退出码 0。
    Help(String),
    /// 用法/配置错误：输出到 stderr，退出码 [`EXIT_USAGE`]。
    Usage(String),
}

impl Cli {
    pub fn parse<I>(args: I) -> Result<Self, CliError>
    where
        I: IntoIterator<Item = String>,
    {
        let mut listen: Option<SocketAddr> = None;
        let mut semantics: Option<Semantics> = None;
        let mut database_path: Option<PathBuf> = None;
        let mut args = args.into_iter().peekable();

        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--help" | "-h" => return Err(CliError::Help(usage())),
                "--listen" => {
                    let value = args.next().ok_or_else(|| missing("--listen"))?;
                    let parsed: SocketAddr = value.parse().map_err(|_| {
                        CliError::Usage(format!(
                            "--listen expects <IP:PORT> (for example {DEFAULT_LISTEN}), got '{value}'"
                        ))
                    })?;
                    if !parsed.ip().is_loopback() {
                        return Err(CliError::Usage(format!(
                            "--listen must stay on the loopback interface, got '{value}'"
                        )));
                    }
                    listen = Some(parsed);
                }
                "--data-semantics" => {
                    let value = args.next().ok_or_else(|| missing("--data-semantics"))?;
                    semantics = Some(Semantics::parse(&value).ok_or_else(|| {
                        CliError::Usage(format!(
                            "--data-semantics expects mock|test|prod, got '{value}'"
                        ))
                    })?);
                }
                "--data-database-path" => {
                    let value = args.next().ok_or_else(|| missing("--data-database-path"))?;
                    if value.is_empty() {
                        return Err(CliError::Usage(
                            "--data-database-path expects a non-empty path".to_owned(),
                        ));
                    }
                    database_path = Some(PathBuf::from(value));
                }
                other => {
                    return Err(CliError::Usage(format!(
                        "unknown option '{other}'; run `data --help` for usage"
                    )));
                }
            }
        }

        Ok(Self {
            listen: listen.unwrap_or_else(|| {
                DEFAULT_LISTEN
                    .parse()
                    .expect("default listen address is valid")
            }),
            semantics: semantics.unwrap_or_default(),
            database_path,
        })
    }

    /// test 语义的数据库路径：参数 > `BLOG_DATABASE_PATH` > `target/test-dbs/<PID>.db`。
    pub fn database_path_from_env(&mut self) {
        if self.database_path.is_some() {
            return;
        }
        if let Ok(value) = std::env::var(DATABASE_PATH_ENV) {
            if !value.trim().is_empty() {
                self.database_path = Some(PathBuf::from(value));
            }
        }
    }
}

fn missing(name: &str) -> CliError {
    CliError::Usage(format!(
        "{name} requires a value; run `data --help` for usage"
    ))
}

pub fn usage() -> String {
    format!(
        "data — blog data server\n\
         \n\
         USAGE:\n    \
         data [OPTIONS]\n\
         \n\
         OPTIONS:\n    \
         --listen <IP:PORT>             Listen address (loopback only, default {DEFAULT_LISTEN})\n    \
         --data-semantics <SEMANTICS>   mock | test | prod (default mock)\n    \
         --data-database-path <PATH>    SQLite path (prod requires an explicit path; test defaults to target/test-dbs/<PID>.db)\n    \
         -h, --help                     Print this help\n\
         \n\
         ENVIRONMENT:\n    \
         {DATABASE_PATH_ENV}   SQLite path for test/prod (explicit flag takes precedence)\n\
         \n\
         ENDPOINTS:\n    \
         GET  /healthz\n    \
         POST /data/v1/operations   typed operations (protocol::DataOperation)\n    \
         GET  /data/v1/diagnostics"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn defaults_are_mock_on_loopback_8081() {
        let cli = Cli::parse(args(&[])).unwrap();
        assert_eq!(cli.listen.to_string(), DEFAULT_LISTEN);
        assert_eq!(cli.semantics, Semantics::Mock);
        assert_eq!(cli.database_path, None);
    }

    #[test]
    fn accepts_test_semantics_with_database_path() {
        let cli = Cli::parse(args(&[
            "--data-semantics",
            "test",
            "--data-database-path",
            "/tmp/x/db.sqlite3",
            "--listen",
            "127.0.0.1:0",
        ]))
        .unwrap();
        assert_eq!(cli.semantics, Semantics::Test);
        assert_eq!(
            cli.database_path.as_deref(),
            Some(std::path::Path::new("/tmp/x/db.sqlite3"))
        );
        assert!(cli.listen.port() == 0);
    }

    #[test]
    fn rejects_unknown_semantics_options_and_non_loopback() {
        assert!(matches!(
            Cli::parse(args(&["--data-semantics", "memory"])),
            Err(CliError::Usage(_))
        ));
        assert!(matches!(
            Cli::parse(args(&["--port", "8081"])),
            Err(CliError::Usage(_))
        ));
        assert!(matches!(
            Cli::parse(args(&["--listen", "0.0.0.0:8081"])),
            Err(CliError::Usage(_))
        ));
        assert!(matches!(
            Cli::parse(args(&["--listen"])),
            Err(CliError::Usage(_))
        ));
        assert!(matches!(
            Cli::parse(args(&["--help"])),
            Err(CliError::Help(_))
        ));
    }
}
