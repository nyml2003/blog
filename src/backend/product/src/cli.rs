//! Product 进程参数与注入配置（SPEC-OPS-RUNTIME-001 附录 A）。
//!
//! 进程参数（服务 binary 契约）：
//!
//! ```text
//! product [--listen <IP:PORT>] [--data-addr <URL>] [--web-dir <PATH>]
//! ```
//!
//! 环境变量注入（ops 计算并覆盖外层环境）：
//! - `BLOG_DATA_ADDR`：Data 实际绑定地址（如 `http://127.0.0.1:8081`）；
//! - `BLOG_WEB_DIR`：`web/dist` 绝对路径（`integration` 模式，下一批挂载）。
//!
//! 优先级：显式参数 > 注入的环境变量 > 内置默认值。

use std::path::PathBuf;

/// 用法/配置错误退出码（与 ops 顶层退出码一致）。
pub const EXIT_USAGE: u8 = 10;
/// 执行失败退出码。
pub const EXIT_RUN_FAILURE: u8 = 20;

pub const DEFAULT_LISTEN: &str = "127.0.0.1:8080";
pub const DEFAULT_DATA_ADDR: &str = "http://127.0.0.1:8081";
/// Data 实际地址 → Product（Spec「环境变量与配置注入」表 / 附录 A）。
pub const DATA_ADDR_ENV: &str = "BLOG_DATA_ADDR";
/// `web/dist` 路径 → Product（Spec「环境变量与配置注入」表 / 附录 A）。
pub const WEB_DIR_ENV: &str = "BLOG_WEB_DIR";

#[derive(Debug, Clone)]
pub struct Cli {
    pub listen: std::net::SocketAddr,
    pub data_addr: String,
    pub web_dir: Option<PathBuf>,
}

#[derive(Debug)]
pub enum CliError {
    Help(String),
    Usage(String),
}

impl Cli {
    pub fn parse<I>(args: I) -> Result<Self, CliError>
    where
        I: IntoIterator<Item = String>,
    {
        let mut listen: Option<std::net::SocketAddr> = None;
        let mut data_addr: Option<String> = None;
        let mut web_dir: Option<PathBuf> = None;
        let mut args = args.into_iter().peekable();

        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--help" | "-h" => return Err(CliError::Help(usage())),
                "--listen" => {
                    let value = args.next().ok_or_else(|| missing("--listen"))?;
                    let parsed: std::net::SocketAddr = value.parse().map_err(|_| {
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
                "--data-addr" => {
                    let value = args.next().ok_or_else(|| missing("--data-addr"))?;
                    data_addr = Some(normalize_data_addr(&value).ok_or_else(|| {
                        CliError::Usage(format!(
                            "--data-addr expects http://<IP:PORT> on loopback, got '{value}'"
                        ))
                    })?);
                }
                "--web-dir" => {
                    let value = args.next().ok_or_else(|| missing("--web-dir"))?;
                    if value.is_empty() {
                        return Err(CliError::Usage(
                            "--web-dir expects a non-empty directory path".to_owned(),
                        ));
                    }
                    web_dir = Some(PathBuf::from(value));
                }
                other => {
                    return Err(CliError::Usage(format!(
                        "unknown option '{other}'; run `product --help` for usage"
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
            data_addr: resolve_data_addr(data_addr, read_env(DATA_ADDR_ENV)),
            web_dir: web_dir.or_else(|| read_env(WEB_DIR_ENV).map(PathBuf::from)),
        })
    }
}

fn read_env(name: &str) -> Option<String> {
    match std::env::var(name) {
        Ok(value) if !value.trim().is_empty() => Some(value),
        _ => None,
    }
}

/// 注入优先级：显式参数 > ops 注入的环境变量 > 内置默认值。
fn resolve_data_addr(flag: Option<String>, injected: Option<String>) -> String {
    flag.or(injected)
        .unwrap_or_else(|| DEFAULT_DATA_ADDR.to_owned())
}

/// 接受 `http://127.0.0.1:8081` 或 `127.0.0.1:8081`；非回环/非 http 一律拒绝。
fn normalize_data_addr(value: &str) -> Option<String> {
    let authority = value.strip_prefix("http://")?;
    let host = authority.split(':').next()?;
    match host.parse::<std::net::IpAddr>() {
        Ok(ip) if ip.is_loopback() => Some(format!("http://{authority}")),
        _ => None,
    }
}

fn missing(name: &str) -> CliError {
    CliError::Usage(format!(
        "{name} requires a value; run `product --help` for usage"
    ))
}

pub fn usage() -> String {
    format!(
        "product — blog product API\n\
         \n\
         USAGE:\n    \
         product [OPTIONS]\n\
         \n\
         OPTIONS:\n    \
         --listen <IP:PORT>    Listen address (loopback only, default {DEFAULT_LISTEN})\n    \
         --data-addr <URL>     Data server address (default {DEFAULT_DATA_ADDR})\n    \
         --web-dir <PATH>      Static frontend dir (integration; not mounted in this batch)\n    \
         -h, --help            Print this help\n\
         \n\
         ENVIRONMENT:\n    \
         {DATA_ADDR_ENV}      Data server address injected by ops\n    \
         {WEB_DIR_ENV}        Static frontend dir injected by ops (integration)\n\
         \n\
         ENDPOINTS:\n    \
         GET /healthz\n    \
         GET /api/public/articles      sceneCode=public.article_list\n    \
         GET /api/public/t-shelf       sceneCode=public.t_shelf\n    \
         GET /product/diagnostics      injected config + Data call counters"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn data_addr_precedence_is_flag_injected_then_default() {
        // 未注入：默认值。
        assert_eq!(resolve_data_addr(None, None), DEFAULT_DATA_ADDR);
        // ops 注入优先于默认值。
        assert_eq!(
            resolve_data_addr(None, Some("http://127.0.0.1:18081".to_owned())),
            "http://127.0.0.1:18081"
        );
        // 显式参数优先于注入。
        assert_eq!(
            resolve_data_addr(
                Some("http://127.0.0.1:28081".to_owned()),
                Some("http://127.0.0.1:18081".to_owned())
            ),
            "http://127.0.0.1:28081"
        );
    }

    #[test]
    fn rejects_non_loopback_and_unknown_options() {
        assert!(matches!(
            Cli::parse(args(&["--data-addr", "http://10.0.0.1:8081"])),
            Err(CliError::Usage(_))
        ));
        assert!(matches!(
            Cli::parse(args(&["--listen", "0.0.0.0:8080"])),
            Err(CliError::Usage(_))
        ));
        assert!(matches!(
            Cli::parse(args(&["--data-port", "8081"])),
            Err(CliError::Usage(_))
        ));
        assert!(matches!(
            Cli::parse(args(&["--help"])),
            Err(CliError::Help(_))
        ));
    }
}
