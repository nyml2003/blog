use std::{collections::HashMap, net::IpAddr};

pub const LOGIN_FAILURE_LIMIT: u8 = 5;
pub const LOGIN_FAILURE_WINDOW_SECONDS: u64 = 15 * 60;
pub const LOGIN_COOLDOWN_SECONDS: u64 = 15 * 60;
pub const LOGIN_IP_CAPACITY: usize = 10_000;
pub const MAX_CONCURRENT_AUTH_ATTEMPTS: usize = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RateLimitDecision {
    Allowed,
    Blocked { retry_after_seconds: u64 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReserveDecision {
    Reserved(AttemptReservation),
    Blocked { retry_after_seconds: u64 },
    Busy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureDecision {
    Invalid { failures: u8 },
    Blocked { retry_after_seconds: u64 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct AttemptReservation {
    ip: IpAddr,
    id: u64,
}

#[derive(Debug, Clone)]
struct FailureState {
    failures: u8,
    window_started_at: u64,
    blocked_until: Option<u64>,
    last_activity: u64,
    active_attempts: Vec<u64>,
}

#[derive(Debug)]
pub struct IpRateLimiter {
    states: HashMap<IpAddr, FailureState>,
    capacity: usize,
    max_active: usize,
    active: usize,
    next_attempt_id: u64,
}

impl Default for IpRateLimiter {
    fn default() -> Self {
        Self::new(LOGIN_IP_CAPACITY, MAX_CONCURRENT_AUTH_ATTEMPTS)
    }
}

impl IpRateLimiter {
    pub fn new(capacity: usize, max_active: usize) -> Self {
        assert!(capacity > 0, "rate-limit capacity must be positive");
        assert!(
            max_active > 0,
            "active authentication capacity must be positive"
        );
        Self {
            states: HashMap::new(),
            capacity,
            max_active,
            active: 0,
            next_attempt_id: 1,
        }
    }

    pub fn reserve_attempt(&mut self, ip: IpAddr, now: u64) -> ReserveDecision {
        self.cleanup(now);
        if let Some(until) = self.states.get(&ip).and_then(|state| state.blocked_until) {
            if now < until {
                return ReserveDecision::Blocked {
                    retry_after_seconds: until - now,
                };
            }
        }
        if self.active >= self.max_active {
            return ReserveDecision::Busy;
        }
        if !self.ensure_capacity(ip) {
            return ReserveDecision::Busy;
        }
        let id = self.next_attempt_id;
        self.next_attempt_id = self.next_attempt_id.wrapping_add(1).max(1);
        let state = self.states.entry(ip).or_insert_with(|| FailureState {
            failures: 0,
            window_started_at: now,
            blocked_until: None,
            last_activity: now,
            active_attempts: Vec::new(),
        });
        state.active_attempts.push(id);
        state.last_activity = now;
        self.active += 1;
        ReserveDecision::Reserved(AttemptReservation { ip, id })
    }

    /// Re-checks cooldown while the caller holds the limiter lock. The caller must keep that lock
    /// through factor reservation and session commit, then call `finalize_success`.
    pub fn success_allowed(
        &mut self,
        reservation: &AttemptReservation,
        now: u64,
    ) -> RateLimitDecision {
        let Some(state) = self.active_state(reservation) else {
            return RateLimitDecision::Blocked {
                retry_after_seconds: 1,
            };
        };
        match state.blocked_until {
            Some(until) if now < until => RateLimitDecision::Blocked {
                retry_after_seconds: until - now,
            },
            _ => RateLimitDecision::Allowed,
        }
    }

    pub fn finalize_success(&mut self, reservation: AttemptReservation) {
        if !self.release(&reservation) {
            return;
        }
        let remove = if let Some(state) = self.states.get_mut(&reservation.ip) {
            state.failures = 0;
            state.blocked_until = None;
            state.active_attempts.is_empty()
        } else {
            false
        };
        if remove {
            self.states.remove(&reservation.ip);
        }
    }

    pub fn finalize_failure(
        &mut self,
        reservation: AttemptReservation,
        now: u64,
    ) -> FailureDecision {
        if !self.release(&reservation) {
            return FailureDecision::Blocked {
                retry_after_seconds: 1,
            };
        }
        let state = self
            .states
            .get_mut(&reservation.ip)
            .expect("reservation state exists");
        state.last_activity = now;
        if let Some(until) = state.blocked_until {
            return FailureDecision::Blocked {
                retry_after_seconds: until.saturating_sub(now).max(1),
            };
        }
        if now.saturating_sub(state.window_started_at) >= LOGIN_FAILURE_WINDOW_SECONDS {
            state.failures = 0;
            state.window_started_at = now;
        }
        state.failures = state.failures.saturating_add(1);
        if state.failures >= LOGIN_FAILURE_LIMIT {
            state.blocked_until = Some(now.saturating_add(LOGIN_COOLDOWN_SECONDS));
            FailureDecision::Blocked {
                retry_after_seconds: LOGIN_COOLDOWN_SECONDS,
            }
        } else {
            FailureDecision::Invalid {
                failures: state.failures,
            }
        }
    }

    pub fn cancel(&mut self, reservation: AttemptReservation) {
        self.release(&reservation);
        self.remove_empty_clean_state(reservation.ip);
    }

    pub fn active_attempts(&self) -> usize {
        self.active
    }

    fn active_state(&mut self, reservation: &AttemptReservation) -> Option<&mut FailureState> {
        self.states
            .get_mut(&reservation.ip)
            .filter(|state| state.active_attempts.contains(&reservation.id))
    }

    fn release(&mut self, reservation: &AttemptReservation) -> bool {
        let Some(state) = self.states.get_mut(&reservation.ip) else {
            return false;
        };
        let Some(index) = state
            .active_attempts
            .iter()
            .position(|id| *id == reservation.id)
        else {
            return false;
        };
        state.active_attempts.swap_remove(index);
        self.active = self.active.saturating_sub(1);
        true
    }

    fn cleanup(&mut self, now: u64) {
        self.states.retain(|_, state| {
            if state.blocked_until.is_some_and(|until| now >= until) {
                state.failures = 0;
                state.window_started_at = now;
                state.blocked_until = None;
            }
            if !state.active_attempts.is_empty() {
                return true;
            }
            state.blocked_until.map_or(
                now.saturating_sub(state.window_started_at) < LOGIN_FAILURE_WINDOW_SECONDS,
                |until| now < until,
            )
        });
    }

    fn ensure_capacity(&mut self, incoming: IpAddr) -> bool {
        if self.states.contains_key(&incoming) || self.states.len() < self.capacity {
            return true;
        }
        let oldest = self
            .states
            .iter()
            .filter(|(_, state)| {
                state.active_attempts.is_empty()
                    && state.failures == 0
                    && state.blocked_until.is_none()
            })
            .min_by_key(|(_, state)| state.last_activity)
            .map(|(ip, _)| *ip);
        if let Some(ip) = oldest {
            self.states.remove(&ip);
        }
        self.states.len() < self.capacity
    }

    fn remove_empty_clean_state(&mut self, ip: IpAddr) {
        let remove = self.states.get(&ip).is_some_and(|state| {
            state.active_attempts.is_empty() && state.failures == 0 && state.blocked_until.is_none()
        });
        if remove {
            self.states.remove(&ip);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Barrier, Mutex};

    use super::*;

    fn reserved(limiter: &mut IpRateLimiter, ip: IpAddr, now: u64) -> AttemptReservation {
        let ReserveDecision::Reserved(reservation) = limiter.reserve_attempt(ip, now) else {
            panic!("attempt was not reserved");
        };
        reservation
    }

    #[test]
    fn fifth_failure_blocks_an_already_reserved_success() {
        let ip = "127.0.0.1".parse().unwrap();
        let mut limiter = IpRateLimiter::new(100, 2);
        for expected in 1..5 {
            let attempt = reserved(&mut limiter, ip, 10);
            assert_eq!(
                limiter.finalize_failure(attempt, 10),
                FailureDecision::Invalid { failures: expected }
            );
        }
        let fifth = reserved(&mut limiter, ip, 10);
        let correct_in_flight = reserved(&mut limiter, ip, 10);
        assert_eq!(
            limiter.finalize_failure(fifth, 10),
            FailureDecision::Blocked {
                retry_after_seconds: 900
            }
        );
        assert_eq!(
            limiter.success_allowed(&correct_in_flight, 10),
            RateLimitDecision::Blocked {
                retry_after_seconds: 900
            }
        );
        limiter.cancel(correct_in_flight);
    }

    #[test]
    fn concurrent_reservation_has_a_global_expensive_work_bound() {
        let limiter = Arc::new(Mutex::new(IpRateLimiter::new(100, 2)));
        let barrier = Arc::new(Barrier::new(4));
        let mut workers = Vec::new();
        for suffix in 1..=3 {
            let limiter = Arc::clone(&limiter);
            let barrier = Arc::clone(&barrier);
            workers.push(std::thread::spawn(move || {
                barrier.wait();
                limiter
                    .lock()
                    .unwrap()
                    .reserve_attempt(format!("127.0.0.{suffix}").parse().unwrap(), 0)
            }));
        }
        barrier.wait();
        let decisions: Vec<_> = workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .collect();
        assert_eq!(
            decisions
                .iter()
                .filter(|decision| matches!(decision, ReserveDecision::Reserved(_)))
                .count(),
            2
        );
        assert_eq!(
            decisions
                .iter()
                .filter(|decision| matches!(decision, ReserveDecision::Busy))
                .count(),
            1
        );
    }

    #[test]
    fn expired_cooldown_is_cleared_even_when_an_old_attempt_is_still_reserved() {
        let ip = "127.0.0.1".parse().unwrap();
        let mut limiter = IpRateLimiter::new(100, 2);
        for _ in 0..4 {
            let attempt = reserved(&mut limiter, ip, 0);
            limiter.finalize_failure(attempt, 0);
        }
        let fifth = reserved(&mut limiter, ip, 0);
        let old_attempt = reserved(&mut limiter, ip, 0);
        limiter.finalize_failure(fifth, 0);

        let other_ip = "127.0.0.2".parse().unwrap();
        let fresh = reserved(&mut limiter, other_ip, LOGIN_COOLDOWN_SECONDS);
        limiter.cancel(fresh);
        assert_eq!(
            limiter.success_allowed(&old_attempt, LOGIN_COOLDOWN_SECONDS),
            RateLimitDecision::Allowed
        );
        limiter.cancel(old_attempt);
    }

    #[test]
    fn capacity_churn_cannot_evict_a_blocked_source() {
        let blocked_ip = "127.0.0.1".parse().unwrap();
        let mut limiter = IpRateLimiter::new(1, 2);
        for _ in 0..LOGIN_FAILURE_LIMIT {
            let attempt = reserved(&mut limiter, blocked_ip, 0);
            limiter.finalize_failure(attempt, 0);
        }

        for suffix in 2..=20 {
            let incoming = format!("127.0.0.{suffix}").parse().unwrap();
            assert_eq!(limiter.reserve_attempt(incoming, 1), ReserveDecision::Busy);
        }
        assert_eq!(
            limiter.reserve_attempt(blocked_ip, 1),
            ReserveDecision::Blocked {
                retry_after_seconds: LOGIN_COOLDOWN_SECONDS - 1,
            }
        );
    }

    #[test]
    fn capacity_does_not_evict_a_recent_failure_record() {
        let mut limiter = IpRateLimiter::new(1, 2);
        let protected_ip = "127.0.0.1".parse().unwrap();
        let failed = reserved(&mut limiter, protected_ip, 0);
        assert_eq!(
            limiter.finalize_failure(failed, 0),
            FailureDecision::Invalid { failures: 1 }
        );
        assert_eq!(
            limiter.reserve_attempt("127.0.0.2".parse().unwrap(), 1),
            ReserveDecision::Busy
        );
        let next = reserved(&mut limiter, protected_ip, 1);
        assert_eq!(
            limiter.finalize_failure(next, 1),
            FailureDecision::Invalid { failures: 2 }
        );
    }
}
