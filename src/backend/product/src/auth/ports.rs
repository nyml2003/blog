use std::time::SystemTime;

use super::{RecoveryCodeDigest, SecretBytes, SecretString};

pub trait Clock: Send + Sync {
    fn unix_seconds(&self) -> u64;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn unix_seconds(&self) -> u64 {
        SystemTime::UNIX_EPOCH
            .elapsed()
            .map_or(0, |duration| duration.as_secs())
    }
}

pub trait RandomSource: Send {
    type Error;

    fn fill(&mut self, destination: &mut [u8]) -> Result<(), Self::Error>;
}

/// The adapter must parse and bound an Argon2id PHC before verifying it.
pub trait PasswordVerifier: Send + Sync {
    type Error;

    fn verify(
        &self,
        encoded_hash: &SecretString,
        candidate: &SecretString,
    ) -> Result<bool, Self::Error>;
}

/// Generates an RFC 6238 code for one 30-second counter using HMAC-SHA1 and six digits.
pub trait TotpCodeGenerator: Send + Sync {
    type Error;

    fn code_for_counter(&self, secret: &SecretBytes, counter: u64) -> Result<[u8; 6], Self::Error>;
}

/// Implementations must verify and consume under one exclusive transaction.
///
/// The filesystem adapter owns the file lock, mode/owner validation, temporary-file fsync,
/// atomic rename and parent-directory fsync. A successful return of `true` means the digest has
/// already been durably removed.
pub trait RecoveryCodeRepository: Send + Sync {
    type Error;

    /// Always scans the complete persisted set. When `authorized` is true, a match must be
    /// durably removed in the same exclusive transaction before returning true. When it is false,
    /// the same scan is performed without modifying the set and false is returned.
    fn verify_and_consume(
        &self,
        digest: &RecoveryCodeDigest,
        authorized: bool,
    ) -> Result<bool, Self::Error>;
}

/// Atomically reserves every counter that produced the submitted code.
///
/// A durable adapter must load, prune, check and persist under one exclusive transaction. If any
/// equivalent counter was previously reserved, the entire candidate set is rejected. Returning
/// true means all candidates are durably reserved, so a new engine instance observes the replay.
pub trait TotpReplayRepository: Send + Sync {
    type Error;

    fn reserve_equivalent(
        &self,
        matched_counters: &[u64],
        current_counter: u64,
    ) -> Result<bool, Self::Error>;
}
