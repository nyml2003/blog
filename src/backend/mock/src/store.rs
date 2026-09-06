//! 跨请求状态：显式 session 隔离（`X-Blog-Mock-Session`）。
//!
//! 隔离策略（`WORKSTREAM-MOCK.md` 交付记录里有完整说明）：
//!
//! - **匿名空间**：没有（或空白）session header 的请求共享一个独立的
//!   [`DomainState`]，命名 session 永远看不到它，反之亦然；
//! - **命名 session**：任意非空白 header 值都是一个 session id，**按需创建**
//!   （`Policy::AcceptUnknown`：不校验白名单、不拒绝未知 id），创建即从场景种子
//!   初始化。选择「接受并初始化」而不是「拒绝」：前端只要把 `?mock-session=<id>`
//!   写进地址栏就能得到一个干净状态，不需要先调用任何「建 session」接口；
//! - **会话失效边界**：闲置超过 [`SESSION_TTL`] 的 session 被重置为种子状态
//!   （返回种子，而不是保留旧写入）；命名 session 数超过 [`MAX_SESSIONS`] 时
//!   淘汰最久未使用的那个。两者都可用同一断言观察：「写入 → 失效 → 读回种子」。
//!
//! 状态只存在于进程内存：进程退出即丢弃，每次 runtime 启动/测试运行重新初始化
//! （PLAN「Mock Product API 与前端自测」）。

use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde_json::json;

use crate::domain::DomainState;
use crate::scenario::Scenario;

/// session header 名（与 `web/common/client/mock-session.ts` 完全一致）。
pub const SESSION_HEADER: &str = "X-Blog-Mock-Session";

/// 命名 session 容量上限：超出后淘汰最久未使用的 session（防无界增长）。
pub const MAX_SESSIONS: usize = 32;

/// session 闲置失效时间；超时后重置为场景种子。
pub const SESSION_TTL: Duration = Duration::from_secs(30 * 60);

/// session 归属：从请求头解析。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionScope {
    /// 无 `X-Blog-Mock-Session`（或值为空白）→ 共享匿名空间。
    Anonymous,
    /// 显式 session id（已 trim）。
    Named(String),
}

/// 未知 session id 的处理策略：**接受并按需初始化**（不拒绝、不校验白名单）。
///
/// 以常量形式固化是为了让该策略可被引用与测试，而不是散落在实现里。
pub const UNKNOWN_SESSION_POLICY: &str = "accept-and-seed";

pub fn scope_from_header(value: Option<&str>) -> SessionScope {
    match value.map(str::trim) {
        Some(id) if !id.is_empty() => SessionScope::Named(id.to_owned()),
        _ => SessionScope::Anonymous,
    }
}

/// 请求计数（诊断端点与 server-error 短路顺序的证据）。
#[derive(Debug, Default)]
pub struct Counters {
    pub api_requests: AtomicU64,
    pub write_attempts: AtomicU64,
    pub faults_served: AtomicU64,
}

impl Counters {
    fn bump(counter: &AtomicU64) -> u64 {
        counter.fetch_add(1, Ordering::Relaxed) + 1
    }

    pub fn api_requests(&self) -> u64 {
        self.api_requests.load(Ordering::Relaxed)
    }

    pub fn write_attempts(&self) -> u64 {
        self.write_attempts.load(Ordering::Relaxed)
    }

    pub fn faults_served(&self) -> u64 {
        self.faults_served.load(Ordering::Relaxed)
    }
}

struct SessionEntry {
    id: String,
    state: DomainState,
}

/// 命名 session 表：`entries[0]` 是最近使用的，尾部是最久未使用的（LRU 淘汰目标）。
#[derive(Default)]
struct SessionTable {
    entries: Vec<SessionEntry>,
    evictions: u64,
    expirations: u64,
}

pub struct Store {
    scenario: Scenario,
    ttl: Duration,
    anonymous: Mutex<DomainState>,
    sessions: Mutex<SessionTable>,
    counters: Counters,
}

impl Store {
    pub fn new(scenario: Scenario) -> Self {
        Self::with_ttl(scenario, SESSION_TTL)
    }

    /// 测试用：缩短失效时间，让「会话失效边界」可以在毫秒级观察。
    pub fn with_ttl(scenario: Scenario, ttl: Duration) -> Self {
        Self {
            anonymous: Mutex::new(DomainState::new(scenario.seed())),
            sessions: Mutex::new(SessionTable::default()),
            scenario,
            ttl,
            counters: Counters::default(),
        }
    }

    pub fn scenario(&self) -> Scenario {
        self.scenario
    }

    pub fn counters(&self) -> &Counters {
        &self.counters
    }

    pub fn count_api_request(&self) -> u64 {
        Counters::bump(&self.counters.api_requests)
    }

    pub fn count_fault_served(&self) -> u64 {
        Counters::bump(&self.counters.faults_served)
    }

    pub fn count_write_attempt(&self) -> u64 {
        Counters::bump(&self.counters.write_attempts)
    }

    /// 只读访问：解析（必要时创建）session 后借用其状态。
    pub fn read<R>(&self, scope: &SessionScope, visitor: impl FnOnce(&DomainState) -> R) -> R {
        match scope {
            SessionScope::Anonymous => {
                let mut state = self.anonymous.lock().expect("anonymous state");
                state.touch();
                visitor(&state)
            }
            SessionScope::Named(id) => self.with_named(id, |state| visitor(state)),
        }
    }

    /// 写入访问：同一把锁覆盖「读改写」，保证同一 session 内的写对后续读可见。
    pub fn write<R>(
        &self,
        scope: &SessionScope,
        mutation: impl FnOnce(&mut DomainState) -> R,
    ) -> R {
        Counters::bump(&self.counters.write_attempts);
        match scope {
            SessionScope::Anonymous => {
                let mut state = self.anonymous.lock().expect("anonymous state");
                state.touch();
                mutation(&mut state)
            }
            SessionScope::Named(id) => self.with_named(id, mutation),
        }
    }

    /// 取（或初始化）一个命名 session 的可变状态；持锁期间不重入。
    fn with_named<R>(&self, id: &str, access: impl FnOnce(&mut DomainState) -> R) -> R {
        let mut table = self.sessions.lock().expect("session table");
        if let Some(index) = table.entries.iter().position(|entry| entry.id == id) {
            let mut entry = table.entries.remove(index);
            if entry.state.idle_for() > self.ttl {
                // 会话失效边界：闲置超时 → 丢弃全部写入，回到场景种子。
                table.expirations += 1;
                entry.state = DomainState::new(self.scenario.seed());
            }
            entry.state.touch();
            table.entries.insert(0, entry);
            return access(&mut table.entries[0].state);
        }
        if table.entries.len() >= MAX_SESSIONS {
            // LRU 淘汰：被淘汰的 session 下次出现时得到一个全新种子状态。
            table.entries.pop();
            table.evictions += 1;
        }
        table.entries.insert(
            0,
            SessionEntry {
                id: id.to_owned(),
                state: DomainState::new(self.scenario.seed()),
            },
        );
        access(&mut table.entries[0].state)
    }

    /// 诊断载荷（`GET /mock/diagnostics` 的 `data`）。
    pub fn diagnostics(&self, listen: &str, uptime_ms: u128) -> serde_json::Value {
        let table = self.sessions.lock().expect("session table");
        json!({
            "service": "mock",
            "listen": listen,
            "scenario": self.scenario.name(),
            "unknownSessionPolicy": UNKNOWN_SESSION_POLICY,
            "session": {
                "header": SESSION_HEADER,
                "named": table.entries.iter().map(|entry| entry.id.clone()).collect::<Vec<_>>(),
                "namedCapacity": MAX_SESSIONS,
                "ttlMs": self.ttl.as_millis() as u64,
                "expirations": table.expirations,
                "evictions": table.evictions,
            },
            "requests": {
                "apiTotal": self.counters.api_requests(),
                "writesAttempted": self.counters.write_attempts(),
                "faultsServed": self.counters.faults_served(),
            },
            "articles": { "anonymous": self.anonymous.lock().expect("anonymous state").article_count() },
            "uptimeMs": uptime_ms as u64,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use protocol::{ArticleListQuery, ArticleWrite};

    fn create(store: &Store, scope: &SessionScope, title: &str) -> i64 {
        store.write(scope, |state| {
            state
                .article_create(&ArticleWrite {
                    title: title.to_owned(),
                    summary: "session test".to_owned(),
                    ..ArticleWrite::default()
                })
                .expect("create")
                .id
        })
    }

    fn admin_total(store: &Store, scope: &SessionScope) -> i64 {
        store.read(scope, |state| {
            state
                .article_list(&ArticleListQuery::default())
                .expect("list")
                .total
        })
    }

    #[test]
    fn blank_header_values_fall_back_to_anonymous() {
        assert_eq!(scope_from_header(None), SessionScope::Anonymous);
        assert_eq!(
            scope_from_header(Some("   ")),
            SessionScope::Anonymous,
            "whitespace-only is treated as absent"
        );
        assert_eq!(
            scope_from_header(Some(" t1 ")),
            SessionScope::Named("t1".to_owned()),
            "surrounding whitespace is trimmed"
        );
    }

    #[test]
    fn sessions_are_isolated_and_anonymous_is_a_third_space() {
        let store = Store::new(Scenario::Default);
        let anonymous = SessionScope::Anonymous;
        let first = SessionScope::Named("t1".to_owned());
        let second = SessionScope::Named("t2".to_owned());

        let seeded = admin_total(&store, &anonymous);
        assert_eq!(seeded, 12);

        let created = create(&store, &first, "session one");
        assert_eq!(admin_total(&store, &first), seeded + 1);
        // 其他 session 与匿名空间都不可见。
        assert_eq!(admin_total(&store, &second), seeded);
        assert_eq!(admin_total(&store, &anonymous), seeded);

        // 同一 session 的写对后续读可见（跨请求状态）。
        let again = create(&store, &first, "session one again");
        assert_ne!(again, created);
        assert_eq!(admin_total(&store, &first), seeded + 2);
        assert_eq!(store.counters().write_attempts(), 2);
    }

    #[test]
    fn unknown_session_ids_are_accepted_and_seeded() {
        let store = Store::new(Scenario::Default);
        let fresh = SessionScope::Named("brand-new-session".to_owned());
        assert_eq!(
            admin_total(&store, &fresh),
            12,
            "a never-seen session id starts from the scenario seed"
        );
        assert_eq!(
            store.diagnostics("127.0.0.1:9090", 0)["session"]["named"],
            json!(["brand-new-session"])
        );
    }

    #[test]
    fn expired_sessions_reset_to_the_seed() {
        let store = Store::with_ttl(Scenario::Default, Duration::from_millis(1));
        let scope = SessionScope::Named("short-lived".to_owned());
        create(&store, &scope, "doomed");
        assert_eq!(admin_total(&store, &scope), 13);
        std::thread::sleep(Duration::from_millis(30));
        assert_eq!(
            admin_total(&store, &scope),
            12,
            "an expired session must not keep its writes"
        );
        assert_eq!(
            store.diagnostics("127.0.0.1:9090", 0)["session"]["expirations"],
            1
        );
    }

    #[test]
    fn least_recently_used_session_is_evicted_beyond_capacity() {
        let store = Store::new(Scenario::Default);
        for index in 0..MAX_SESSIONS {
            let scope = SessionScope::Named(format!("s{index}"));
            create(&store, &scope, "filler");
        }
        let diagnostics = store.diagnostics("127.0.0.1:9090", 0);
        assert_eq!(diagnostics["session"]["namedCapacity"], MAX_SESSIONS);
        assert_eq!(diagnostics["session"]["evictions"], 0);

        // 再来一个新 session：容量满，淘汰最久未使用的 s0。
        let overflow = SessionScope::Named("overflow".to_owned());
        create(&store, &overflow, "one too many");
        let diagnostics = store.diagnostics("127.0.0.1:9090", 0);
        assert_eq!(diagnostics["session"]["evictions"], 1);
        let named = diagnostics["session"]["named"].as_array().unwrap();
        assert_eq!(named.len(), MAX_SESSIONS);
        assert!(!named.contains(&json!("s0")), "s0 was evicted: {named:?}");
        assert!(named.contains(&json!("overflow")));

        // s0 复活时回到种子状态（写入不残留）。
        assert_eq!(
            admin_total(&store, &SessionScope::Named("s0".to_owned())),
            12
        );
    }

    #[test]
    fn empty_scenario_starts_every_session_from_an_empty_world() {
        let store = Store::new(Scenario::Empty);
        let scope = SessionScope::Named("empty-world".to_owned());
        assert_eq!(admin_total(&store, &scope), 0);
        let created = create(&store, &scope, "created in an empty world");
        assert_eq!(created, 1, "ids start at 1 when the seed is empty");
        assert_eq!(admin_total(&store, &scope), 1);
        assert_eq!(admin_total(&store, &SessionScope::Anonymous), 0);
    }
}
