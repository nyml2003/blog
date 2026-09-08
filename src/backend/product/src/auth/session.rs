use std::collections::HashMap;

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest, Sha256};

use super::{RandomSource, SecretString};

pub const SESSION_TOKEN_BYTES: usize = 32;
pub const SESSION_TTL_SECONDS: u64 = 12 * 60 * 60;
pub const SESSION_CAPACITY: usize = 128;
const SESSION_PENDING_CAPACITY: usize = 2;

pub struct SessionToken(SecretString);

impl SessionToken {
    pub fn expose(&self) -> &str {
        self.0.expose()
    }
}

impl std::fmt::Debug for SessionToken {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("SessionToken([REDACTED])")
    }
}

pub struct PendingSession {
    token: SessionToken,
    digest: [u8; 32],
}

impl std::fmt::Debug for PendingSession {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("PendingSession([REDACTED])")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SessionAccess {
    pub issued_at: u64,
    pub last_seen: u64,
    pub expires_at: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SessionAuthentication {
    pub access: SessionAccess,
    pub refresh_max_age_seconds: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionError<E> {
    Random(E),
    EntropyCollision,
    InvalidPendingSession,
}

#[derive(Debug, Clone, Copy)]
enum SessionRecord {
    Pending(SessionAccess),
    Active(SessionAccess),
}

impl SessionRecord {
    fn access(self) -> SessionAccess {
        match self {
            Self::Pending(access) | Self::Active(access) => access,
        }
    }
}

#[derive(Debug)]
pub struct SessionStore {
    sessions: HashMap<[u8; 32], SessionRecord>,
    ttl_seconds: u64,
    capacity: usize,
}

impl Default for SessionStore {
    fn default() -> Self {
        Self::new(SESSION_TTL_SECONDS, SESSION_CAPACITY)
    }
}

impl SessionStore {
    pub fn new(ttl_seconds: u64, capacity: usize) -> Self {
        assert!(ttl_seconds > 0, "session TTL must be positive");
        assert!(capacity > 0, "session capacity must be positive");
        Self {
            sessions: HashMap::new(),
            ttl_seconds,
            capacity,
        }
    }

    /// Allocates and reserves a token before a one-time factor is consumed. Authentication ignores
    /// pending records, while commit cannot fail after the reservation has been created.
    pub fn prepare<R: RandomSource>(
        &mut self,
        now: u64,
        random: &mut R,
    ) -> Result<PendingSession, SessionError<R::Error>> {
        self.remove_expired(now);
        if self.pending_count() >= SESSION_PENDING_CAPACITY {
            return Err(SessionError::EntropyCollision);
        }
        for _ in 0..4 {
            let mut token_bytes = [0_u8; SESSION_TOKEN_BYTES];
            random
                .fill(&mut token_bytes)
                .map_err(SessionError::Random)?;
            let token = URL_SAFE_NO_PAD.encode(token_bytes);
            let digest = token_digest(&token);
            if self.sessions.contains_key(&digest) {
                continue;
            }
            let access = SessionAccess {
                issued_at: now,
                last_seen: now,
                expires_at: now.saturating_add(self.ttl_seconds),
            };
            self.sessions.insert(digest, SessionRecord::Pending(access));
            return Ok(PendingSession {
                token: SessionToken(SecretString::new(token)),
                digest,
            });
        }
        Err(SessionError::EntropyCollision)
    }

    pub fn commit<E>(&mut self, pending: PendingSession) -> Result<SessionToken, SessionError<E>> {
        let Some(SessionRecord::Pending(access)) = self.sessions.get(&pending.digest).copied()
        else {
            return Err(SessionError::InvalidPendingSession);
        };
        if self.active_count() >= self.capacity {
            self.evict_oldest_active();
        }
        self.sessions
            .insert(pending.digest, SessionRecord::Active(access));
        Ok(pending.token)
    }

    pub fn abort(&mut self, pending: PendingSession) {
        if matches!(
            self.sessions.get(&pending.digest),
            Some(SessionRecord::Pending(_))
        ) {
            self.sessions.remove(&pending.digest);
        }
    }

    pub fn issue<R: RandomSource>(
        &mut self,
        now: u64,
        random: &mut R,
    ) -> Result<SessionToken, SessionError<R::Error>> {
        let pending = self.prepare(now, random)?;
        self.commit(pending)
    }

    pub fn authenticate(&mut self, token: &str, now: u64) -> Option<SessionAuthentication> {
        if !well_formed_token(token) {
            return None;
        }
        let digest = token_digest(token);
        let expired = self.sessions.get(&digest).is_some_and(
            |record| matches!(record, SessionRecord::Active(access) if now >= access.expires_at),
        );
        if expired {
            self.sessions.remove(&digest);
            return None;
        }
        let Some(SessionRecord::Active(session)) = self.sessions.get_mut(&digest) else {
            return None;
        };
        session.last_seen = now;
        session.expires_at = now.saturating_add(self.ttl_seconds);
        Some(SessionAuthentication {
            access: *session,
            refresh_max_age_seconds: self.ttl_seconds,
        })
    }

    pub fn revoke(&mut self, token: &str) -> bool {
        well_formed_token(token) && self.sessions.remove(&token_digest(token)).is_some()
    }

    pub fn ttl_seconds(&self) -> u64 {
        self.ttl_seconds
    }

    pub fn len(&self) -> usize {
        self.active_count()
    }

    pub fn is_empty(&self) -> bool {
        self.active_count() == 0
    }

    fn remove_expired(&mut self, now: u64) {
        self.sessions
            .retain(|_, record| now < record.access().expires_at);
    }

    fn evict_oldest_active(&mut self) {
        let oldest = self
            .sessions
            .iter()
            .filter_map(|(digest, record)| match record {
                SessionRecord::Active(access) => Some((digest, access)),
                SessionRecord::Pending(_) => None,
            })
            .min_by_key(|(_, session)| (session.expires_at, session.last_seen, session.issued_at))
            .map(|(digest, _)| *digest);
        if let Some(digest) = oldest {
            self.sessions.remove(&digest);
        }
    }

    fn active_count(&self) -> usize {
        self.sessions
            .values()
            .filter(|record| matches!(record, SessionRecord::Active(_)))
            .count()
    }

    fn pending_count(&self) -> usize {
        self.sessions
            .values()
            .filter(|record| matches!(record, SessionRecord::Pending(_)))
            .count()
    }
}

pub(crate) fn well_formed_token(token: &str) -> bool {
    token.len() == 43
        && token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn token_digest(token: &str) -> [u8; 32] {
    Sha256::digest(token.as_bytes()).into()
}

#[cfg(test)]
mod tests {
    use std::convert::Infallible;

    use super::*;

    struct CounterRandom(u8);

    impl RandomSource for CounterRandom {
        type Error = Infallible;

        fn fill(&mut self, destination: &mut [u8]) -> Result<(), Self::Error> {
            destination.fill(self.0);
            self.0 = self.0.wrapping_add(1);
            Ok(())
        }
    }

    struct FailingRandom;

    impl RandomSource for FailingRandom {
        type Error = ();

        fn fill(&mut self, _: &mut [u8]) -> Result<(), Self::Error> {
            Err(())
        }
    }

    #[test]
    fn pending_token_is_invisible_until_commit_and_authentication_returns_refresh_ttl() {
        let mut store = SessionStore::default();
        let pending = store.prepare(10, &mut CounterRandom(1)).unwrap();
        assert!(store.authenticate(pending.token.expose(), 10).is_none());
        let token = store.commit::<Infallible>(pending).unwrap();
        let authenticated = store.authenticate(token.expose(), 20).unwrap();
        assert_eq!(authenticated.access.expires_at, 20 + SESSION_TTL_SECONDS);
        assert_eq!(authenticated.refresh_max_age_seconds, store.ttl_seconds());
        assert!(!format!("{store:?}").contains(token.expose()));
    }

    #[test]
    fn rng_failure_does_not_evict_an_existing_session() {
        let mut store = SessionStore::new(10, 1);
        let token = store.issue(0, &mut CounterRandom(1)).unwrap();
        assert!(matches!(
            store.prepare(1, &mut FailingRandom),
            Err(SessionError::Random(()))
        ));
        assert!(store.authenticate(token.expose(), 1).is_some());
    }

    #[test]
    fn abort_at_capacity_does_not_evict_an_existing_session() {
        let mut store = SessionStore::new(10, 1);
        let mut random = CounterRandom(1);
        let active = store.issue(0, &mut random).unwrap();
        let pending = store.prepare(1, &mut random).unwrap();
        store.abort(pending);
        assert_eq!(store.len(), 1);
        assert!(store.authenticate(active.expose(), 1).is_some());
    }

    #[test]
    fn abort_expiration_revoke_and_capacity_are_enforced() {
        let mut store = SessionStore::new(10, 2);
        let mut random = CounterRandom(1);
        let aborted = store.prepare(0, &mut random).unwrap();
        store.abort(aborted);
        let first = store.issue(0, &mut random).unwrap();
        let second = store.issue(1, &mut random).unwrap();
        let third = store.issue(2, &mut random).unwrap();
        assert_eq!(store.len(), 2);
        assert!(store.authenticate(first.expose(), 2).is_none());
        assert!(store.revoke(second.expose()));
        assert!(store.authenticate(third.expose(), 12).is_none());
    }
}
