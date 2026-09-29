//! 命名场景：有限集合，每个场景对所有路由的行为都是确定性的。
//!
//! 场景只由 CLI 选中（`--scenario`，缺省 [`DEFAULT_NAME`]）；不读环境变量、不读配置
//! 文件。集合与 ops 侧
//! `ops/src/commands/runtime/runtime-plan.ts` 的 `MOCK_SCENARIOS` 一一对应，顺序也一致。
//!
//! 行为定义（交付记录里有完整场景 × 端点表）：
//!
//! | 场景 | seed | 人为延迟 | 故障注入 |
//! | --- | --- | --- | --- |
//! | `default` | 完整夹具 | 无 | 无 |
//! | `empty` | 空集合 | 无 | 无 |
//! | `slow` | 完整夹具 | [`SLOW_DELAY_MS`]（`/api/*` 才延迟） | 无 |
//! | `server-error` | 完整夹具 | 无 | `500` envelope，**写操作不生效** |
//! | `malformed-response` | 完整夹具 | 无 | `200` + 截断 JSON body（写操作仍生效） |

use std::time::Duration;

/// 场景全集（顺序与 ops 的 `MOCK_SCENARIOS` 一致）。
pub const NAMES: &[&str] = &[
    "default",
    "empty",
    "slow",
    "server-error",
    "malformed-response",
];

/// `--scenario` 缺省值。
pub const DEFAULT_NAME: &str = "default";

/// 场景名称全集（供 CLI 用法错误与 `--help` 列出）。
pub fn names() -> &'static [&'static str] {
    NAMES
}

/// `slow` 场景的固定人为延迟（硬编码，可从 `--help` 读出）。
pub const SLOW_DELAY_MS: u64 = 2_000;

/// `malformed-response` 场景从合法 envelope 尾部截断的字节数。
///
/// 取值足够小，保证截断后仍是「看得出形状的 JSON 前缀」；同时固定不变，
/// 使前端观察到的解析失败在两次运行之间可复现。
pub const TRUNCATE_BYTES: usize = 24;

/// `empty` 场景的种子形态。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SeedKind {
    /// 完整夹具（9 篇 published + 3 篇 draft）。
    Full,
    /// 空集合（0 篇文章、0 类型、0 term、无推荐）。
    Empty,
}

/// 协议层故障。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fault {
    /// 每个业务端点都返回 `500` envelope（`INTERNAL_ERROR`），写操作不生效。
    ServerError,
    /// 每个业务端点都返回 `200` + 截断的 JSON body，写操作仍生效。
    MalformedResponse,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Scenario {
    #[default]
    Default,
    Empty,
    Slow,
    ServerError,
    MalformedResponse,
}

impl Scenario {
    /// 名称 → 场景；不做前缀匹配或模糊回退（Spec：未知场景名按用法错误处理）。
    pub fn from_name(name: &str) -> Option<Self> {
        match name {
            "default" => Some(Self::Default),
            "empty" => Some(Self::Empty),
            "slow" => Some(Self::Slow),
            "server-error" => Some(Self::ServerError),
            "malformed-response" => Some(Self::MalformedResponse),
            _ => None,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Empty => "empty",
            Self::Slow => "slow",
            Self::ServerError => "server-error",
            Self::MalformedResponse => "malformed-response",
        }
    }

    pub fn names() -> &'static [&'static str] {
        NAMES
    }

    /// 场景的种子形态：`empty` 之外都从完整夹具开始。
    pub fn seed(self) -> SeedKind {
        match self {
            Self::Empty => SeedKind::Empty,
            _ => SeedKind::Full,
        }
    }

    /// 每个 `/api/*` 请求前置的人为延迟；`/healthz` 与诊断端点不延迟（就绪探测不受影响）。
    pub fn delay(self) -> Duration {
        match self {
            Self::Slow => Duration::from_millis(SLOW_DELAY_MS),
            _ => Duration::ZERO,
        }
    }

    /// 场景注入的协议层故障。
    pub fn fault(self) -> Option<Fault> {
        match self {
            Self::ServerError => Some(Fault::ServerError),
            Self::MalformedResponse => Some(Fault::MalformedResponse),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_match_the_ops_side_collection_in_order() {
        // `ops/src/commands/runtime/runtime-plan.ts` 的 MOCK_SCENARIOS；两侧必须同步修订。
        assert_eq!(
            Scenario::names(),
            &[
                "default",
                "empty",
                "slow",
                "server-error",
                "malformed-response"
            ]
        );
        assert_eq!(Scenario::from_name("default"), Some(Scenario::Default));
        assert_eq!(Scenario::Default.name(), "default");
    }

    #[test]
    fn unknown_names_are_rejected_without_fuzzy_matching() {
        for name in ["", "Slow", "slow-", "server", "malformed", "chaos"] {
            assert_eq!(Scenario::from_name(name), None, "{name} must be rejected");
        }
    }

    #[test]
    fn only_slow_delays_and_only_faulty_scenarios_fault() {
        assert_eq!(Scenario::Default.delay(), Duration::ZERO);
        assert_eq!(Scenario::Empty.delay(), Duration::ZERO);
        assert_eq!(Scenario::Slow.delay(), Duration::from_millis(SLOW_DELAY_MS));
        assert_eq!(Scenario::ServerError.fault(), Some(Fault::ServerError));
        assert_eq!(
            Scenario::MalformedResponse.fault(),
            Some(Fault::MalformedResponse)
        );
        for scenario in [Scenario::Default, Scenario::Empty, Scenario::Slow] {
            assert_eq!(scenario.fault(), None, "{}", scenario.name());
        }
    }

    #[test]
    fn only_empty_seeds_an_empty_world() {
        assert_eq!(Scenario::Empty.seed(), SeedKind::Empty);
        for scenario in [
            Scenario::Default,
            Scenario::Slow,
            Scenario::ServerError,
            Scenario::MalformedResponse,
        ] {
            assert_eq!(scenario.seed(), SeedKind::Full, "{}", scenario.name());
        }
    }
}
