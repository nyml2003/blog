//! Single-admin authentication core.
//!
//! HTTP routing and process configuration deliberately live outside this module. The core owns
//! credential decisions, replay protection, sessions, rate limiting, recovery-code semantics and
//! helpers that middleware can call without depending on Axum.

mod config;
mod cookie;
mod crypto;
mod engine;
mod log;
mod password;
mod persistence;
mod ports;
mod production;
mod rate_limit;
mod recovery;
mod secret;
mod session;
mod totp;

pub use config::{
    ADMIN_PASSWORD_HASH_ENV, ADMIN_RUNTIME_DIR_ENV, ADMIN_TOTP_SECRET_ENV, AuthAvailability,
    AuthConfig, AuthUnavailableReason, TRUSTED_PROXY_IPS_ENV, encode_base32_no_padding,
};
pub use cookie::{
    ADMIN_SESSION_COOKIE, VerifiedRequestOrigin, clear_session_cookie, extract_session_cookie,
    safe_admin_next, session_cookie,
};
pub use crypto::{
    Argon2idPasswordVerifier, CryptoAdapterError, HmacSha1TotpGenerator, MAX_PASSWORD_BYTES,
    OsRandomSource,
};
pub use engine::{AuthEngine, AuthError, LoginOutcome, LoginVerification};
pub use log::{AuthEvent, AuthEventKind, AuthOutcome, AuthReason};
pub use password::{ARGON2ID_ALGORITHM, PasswordHashPolicy};
pub use persistence::{
    FilesystemRecoveryCodeRepository, FilesystemTotpReplayRepository, PersistenceError,
    RECOVERY_CODES_FILE, TOTP_REPLAY_FILE,
};
pub use ports::{
    Clock, PasswordVerifier, RandomSource, RecoveryCodeRepository, SystemClock, TotpCodeGenerator,
    TotpReplayRepository,
};
pub use production::{ProductionAuthEngine, ProductionAuthRuntime, ProductionAuthState};
pub use rate_limit::{
    AttemptReservation, FailureDecision, IpRateLimiter, RateLimitDecision, ReserveDecision,
};
pub use recovery::{
    RecoveryCode, RecoveryCodeDigest, RecoveryCodeSet, RecoveryCodeSetError,
    RecoveryGenerationError,
};
pub use secret::{SecretBytes, SecretString};
pub use session::{
    PendingSession, SESSION_CAPACITY, SESSION_TOKEN_BYTES, SESSION_TTL_SECONDS, SessionAccess,
    SessionAuthentication, SessionError, SessionStore, SessionToken,
};
pub use totp::{
    InMemoryTotpReplayError, InMemoryTotpReplayRepository, TOTP_DIGITS, TOTP_MATCH_WINDOW_COUNTERS,
    TOTP_MAX_CLOCK_ROLLBACK_COUNTERS, TOTP_STEP_SECONDS, TotpVerifier,
};

pub const ADMIN_AUTH_REQUIRED: &str = "ADMIN_AUTH_REQUIRED";
pub const ADMIN_AUTH_INVALID: &str = "ADMIN_AUTH_INVALID";
pub const ADMIN_AUTH_RATE_LIMITED: &str = "ADMIN_AUTH_RATE_LIMITED";
pub const ADMIN_AUTH_UNAVAILABLE: &str = "ADMIN_AUTH_UNAVAILABLE";
