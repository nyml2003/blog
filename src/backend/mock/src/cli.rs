//! Mock 进程参数（SPEC-OPS-RUNTIME-001：`--scenario` 只走 CLI）。
//!
//! 进程参数（服务 binary 契约，供 `ops runtime dev` 调用）：
//!
//! ```text
//! mock [--listen <IP:PORT>] [--scenario <NAME>] --admin-auth bypass
//! ```
//!
//! **Mock 不读取任何环境变量**：场景选择没有 env / 配置文件回退（ENV-002），
//! 监听地址只接受回环地址（本期不做公网监听）。
//!
//! 退出码与 ops 顶层码一致：`10` 用法错误（含未知场景名）、`20` 执行失败。

use std::net::SocketAddr;

use crate::scenario::{self, Scenario};

/// 用法/配置错误退出码（与 ops 顶层退出码一致）。
pub const EXIT_USAGE: u8 = 10;
/// 执行失败退出码。
pub const EXIT_RUN_FAILURE: u8 = 20;

pub const DEFAULT_LISTEN: &str = "127.0.0.1:9090";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdminAuthMode {
    Bypass,
}

impl AdminAuthMode {
    pub fn name(self) -> &'static str {
        match self {
            Self::Bypass => "bypass",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Cli {
    pub listen: SocketAddr,
    pub scenario: Scenario,
    pub admin_auth: AdminAuthMode,
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
        let mut scenario: Option<Scenario> = None;
        let mut admin_auth = None;
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
                "--scenario" => {
                    let value = args.next().ok_or_else(|| missing("--scenario"))?;
                    scenario = Some(Scenario::from_name(value.as_str()).ok_or_else(|| {
                        CliError::Usage(format!(
                            "unknown scenario '{value}' (valid: {})",
                            scenario::names().join(", ")
                        ))
                    })?);
                }
                "--admin-auth" => {
                    let value = args.next().ok_or_else(|| missing("--admin-auth"))?;
                    if value != "bypass" {
                        return Err(CliError::Usage(format!(
                            "--admin-auth expects the explicit dev-only value 'bypass', got '{value}'"
                        )));
                    }
                    admin_auth = Some(AdminAuthMode::Bypass);
                }
                other => {
                    return Err(CliError::Usage(format!(
                        "unknown option '{other}'; run `mock --help` for usage"
                    )));
                }
            }
        }

        let admin_auth = admin_auth.ok_or_else(|| {
            CliError::Usage("--admin-auth bypass is required for the Mock Product API".to_owned())
        })?;
        Ok(Self {
            listen: listen.unwrap_or_else(|| {
                DEFAULT_LISTEN
                    .parse()
                    .expect("default listen address is valid")
            }),
            scenario: scenario.unwrap_or_default(),
            admin_auth,
        })
    }
}

fn missing(name: &str) -> CliError {
    CliError::Usage(format!(
        "{name} requires a value; run `mock --help` for usage"
    ))
}

pub fn usage() -> String {
    format!(
        "mock — blog Mock Product API (dev only)\n\
         \n\
         USAGE:\n    \
         mock [OPTIONS]\n\
         \n\
         OPTIONS:\n    \
         --listen <IP:PORT>    Listen address (loopback only, default {DEFAULT_LISTEN})\n    \
         --scenario <NAME>     Named scenario (default {})\n    \
         --admin-auth bypass   Explicitly disable auth in the dev-only Mock (required)\n    \
         -h, --help            Print this help\n\
         \n\
         SCENARIOS:\n    \
         default            normal seeded data\n    \
         empty              empty collections on every read endpoint\n    \
         slow               {}ms artificial delay, then normal data\n    \
         server-error       HTTP 500 envelope on every /api endpoint\n    \
         malformed-response HTTP 200 with a truncated JSON body\n\
         \n\
         SESSION:\n    \
         X-Blog-Mock-Session  request header isolating cross-request state\n\
         \n\
         ENDPOINTS:\n    \
         GET /healthz\n    \
         GET /api/public/articles      sceneCode=public.article_list\n    \
         GET /api/public/t-shelf       sceneCode=public.t_shelf\n    \
         GET /mock/diagnostics         scenario + session + request counters",
        scenario::DEFAULT_NAME,
        scenario::SLOW_DELAY_MS
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn defaults_are_scenario_default_and_loopback_9090() {
        let cli = Cli::parse(args(&["--admin-auth", "bypass"])).expect("explicit bypass parse");
        assert_eq!(cli.scenario, Scenario::Default);
        assert_eq!(cli.listen.to_string(), DEFAULT_LISTEN);
    }

    #[test]
    fn accepts_every_named_scenario() {
        for name in scenario::names() {
            let cli = Cli::parse(args(&["--scenario", name, "--admin-auth", "bypass"]))
                .expect("known scenario");
            assert_eq!(cli.scenario.name(), *name);
        }
    }

    #[test]
    fn unknown_scenario_lists_valid_values() {
        let error = Cli::parse(args(&["--scenario", "chaos"])).expect_err("unknown scenario");
        let CliError::Usage(message) = error else {
            panic!("expected a usage error");
        };
        assert!(message.contains("unknown scenario 'chaos'"), "{message}");
        for name in scenario::names() {
            assert!(message.contains(name), "{message} must list {name}");
        }
    }

    #[test]
    fn scenario_is_never_read_from_the_environment() {
        // ENV-002 的进程内一半：解析器没有任何环境回退，缺省恒为 default。
        // （环境变量存在时的完整观察见 tests/lifecycle.rs：以 SCENARIO=empty 启动，
        //   启动日志仍然是 scenario=default。）
        let cli = Cli::parse(args(&["--admin-auth", "bypass"])).expect("explicit bypass parse");
        assert_eq!(cli.scenario, Scenario::Default);
    }

    #[test]
    fn rejects_non_loopback_and_unknown_options() {
        assert!(matches!(
            Cli::parse(args(&["--listen", "0.0.0.0:9090"])),
            Err(CliError::Usage(_))
        ));
        assert!(matches!(
            Cli::parse(args(&["--listen", "127.0.0.1:abc"])),
            Err(CliError::Usage(_))
        ));
        assert!(matches!(
            Cli::parse(args(&["--web-port", "5173"])),
            Err(CliError::Usage(_))
        ));
        assert!(matches!(
            Cli::parse(args(&["--scenario"])),
            Err(CliError::Usage(_))
        ));
        assert!(matches!(Cli::parse(args(&[])), Err(CliError::Usage(_))));
        assert!(matches!(
            Cli::parse(args(&["--admin-auth", "enabled"])),
            Err(CliError::Usage(_))
        ));
        assert!(matches!(
            Cli::parse(args(&["--help"])),
            Err(CliError::Help(_))
        ));
    }
}
