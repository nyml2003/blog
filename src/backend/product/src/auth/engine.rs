use std::{net::IpAddr, sync::Mutex};

use super::{
    AttemptReservation, FailureDecision, IpRateLimiter, MAX_PASSWORD_BYTES, PasswordVerifier,
    RandomSource, RateLimitDecision, RecoveryCode, RecoveryCodeDigest, RecoveryCodeRepository,
    ReserveDecision, SecretBytes, SecretString, SessionAuthentication, SessionError, SessionStore,
    SessionToken, TOTP_STEP_SECONDS, TotpCodeGenerator, TotpReplayRepository, TotpVerifier,
};

pub enum LoginVerification<'a> {
    Totp(&'a str),
    Recovery(&'a RecoveryCode),
}

#[derive(Debug)]
pub enum LoginOutcome {
    Authenticated(SessionToken),
    Invalid,
    RateLimited { retry_after_seconds: u64 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthError {
    PasswordVerification,
    TotpGeneration,
    TotpReplayPersistence,
    RecoveryPersistence,
    RandomGeneration,
    StatePoisoned,
}

enum FactorCandidate {
    Totp(Vec<u64>),
    Recovery(RecoveryCodeDigest),
}

pub struct AuthEngine<P, T, R, Q> {
    encoded_password: SecretString,
    totp_secret: SecretBytes,
    password_verifier: P,
    totp_generator: T,
    recovery_codes: R,
    replay: Q,
    sessions: Mutex<SessionStore>,
    limiter: Mutex<IpRateLimiter>,
}

impl<P, T, R, Q> AuthEngine<P, T, R, Q>
where
    P: PasswordVerifier,
    T: TotpCodeGenerator,
    R: RecoveryCodeRepository,
    Q: TotpReplayRepository,
{
    pub fn new(
        encoded_password: SecretString,
        totp_secret: SecretBytes,
        password_verifier: P,
        totp_generator: T,
        recovery_codes: R,
        replay: Q,
    ) -> Self {
        Self {
            encoded_password,
            totp_secret,
            password_verifier,
            totp_generator,
            recovery_codes,
            replay,
            sessions: Mutex::new(SessionStore::default()),
            limiter: Mutex::new(IpRateLimiter::default()),
        }
    }

    /// Performs one complete credential decision.
    ///
    /// The HTTP adapter must call this from a blocking worker. The limiter reserves a bounded
    /// expensive-verification slot before password work and re-checks cooldown at commit. Session
    /// entropy is reserved before either one-time factor is consumed.
    pub fn login<S: RandomSource>(
        &self,
        ip: IpAddr,
        password: &SecretString,
        verification: LoginVerification<'_>,
        now: u64,
        random: &mut S,
    ) -> Result<LoginOutcome, AuthError> {
        let reservation = match self
            .limiter
            .lock()
            .map_err(|_| AuthError::StatePoisoned)?
            .reserve_attempt(ip, now)
        {
            ReserveDecision::Reserved(reservation) => reservation,
            ReserveDecision::Blocked {
                retry_after_seconds,
            } => {
                return Ok(LoginOutcome::RateLimited {
                    retry_after_seconds,
                });
            }
            ReserveDecision::Busy => {
                return Ok(LoginOutcome::RateLimited {
                    retry_after_seconds: 1,
                });
            }
        };

        if password.expose().len() > MAX_PASSWORD_BYTES {
            return self.finish_invalid(reservation, now);
        }

        let password_matches = match self
            .password_verifier
            .verify(&self.encoded_password, password)
        {
            Ok(value) => value,
            Err(_) => {
                self.cancel(reservation)?;
                return Err(AuthError::PasswordVerification);
            }
        };

        let factor = match verification {
            LoginVerification::Totp(candidate) => {
                let counters = match TotpVerifier.matching_counters(
                    &self.totp_generator,
                    &self.totp_secret,
                    candidate,
                    now,
                ) {
                    Ok(counters) => counters,
                    Err(_) => {
                        self.cancel(reservation)?;
                        return Err(AuthError::TotpGeneration);
                    }
                };
                FactorCandidate::Totp(counters)
            }
            LoginVerification::Recovery(code) => FactorCandidate::Recovery(code.digest()),
        };

        if !password_matches {
            if let FactorCandidate::Recovery(digest) = &factor {
                if self
                    .recovery_codes
                    .verify_and_consume(digest, false)
                    .is_err()
                {
                    self.cancel(reservation)?;
                    return Err(AuthError::RecoveryPersistence);
                }
            }
            return self.finish_invalid(reservation, now);
        }
        if matches!(&factor, FactorCandidate::Totp(counters) if counters.is_empty()) {
            return self.finish_invalid(reservation, now);
        }

        let pending = match self
            .sessions
            .lock()
            .map_err(|_| AuthError::StatePoisoned)?
            .prepare(now, random)
        {
            Ok(pending) => pending,
            Err(
                SessionError::Random(_)
                | SessionError::EntropyCollision
                | SessionError::InvalidPendingSession,
            ) => {
                self.cancel(reservation)?;
                return Err(AuthError::RandomGeneration);
            }
        };

        // Keep this lock through factor reservation and session commit. This gives success/failure
        // one linearization point: a cooldown finalized first rejects this in-flight success.
        let mut limiter = self.limiter.lock().map_err(|_| AuthError::StatePoisoned)?;
        if let RateLimitDecision::Blocked {
            retry_after_seconds,
        } = limiter.success_allowed(&reservation, now)
        {
            limiter.cancel(reservation);
            drop(limiter);
            self.abort_pending(pending)?;
            return Ok(LoginOutcome::RateLimited {
                retry_after_seconds,
            });
        }

        let factor_reserved = match &factor {
            FactorCandidate::Totp(counters) => self
                .replay
                .reserve_equivalent(counters, now / TOTP_STEP_SECONDS)
                .map_err(|_| AuthError::TotpReplayPersistence),
            FactorCandidate::Recovery(digest) => self
                .recovery_codes
                .verify_and_consume(digest, true)
                .map_err(|_| AuthError::RecoveryPersistence),
        };
        let factor_reserved = match factor_reserved {
            Ok(value) => value,
            Err(error) => {
                limiter.cancel(reservation);
                drop(limiter);
                self.abort_pending(pending)?;
                return Err(error);
            }
        };
        if !factor_reserved {
            let outcome = failure_outcome(limiter.finalize_failure(reservation, now));
            drop(limiter);
            self.abort_pending(pending)?;
            return Ok(outcome);
        }

        let token = self
            .sessions
            .lock()
            .map_err(|_| AuthError::StatePoisoned)?
            .commit::<S::Error>(pending)
            .map_err(|_| AuthError::StatePoisoned)?;
        limiter.finalize_success(reservation);
        Ok(LoginOutcome::Authenticated(token))
    }

    pub fn authenticate_session(
        &self,
        token: &str,
        now: u64,
    ) -> Result<Option<SessionAuthentication>, AuthError> {
        Ok(self
            .sessions
            .lock()
            .map_err(|_| AuthError::StatePoisoned)?
            .authenticate(token, now))
    }

    pub fn session_ttl_seconds(&self) -> Result<u64, AuthError> {
        Ok(self
            .sessions
            .lock()
            .map_err(|_| AuthError::StatePoisoned)?
            .ttl_seconds())
    }

    pub fn logout(&self, token: &str) -> Result<(), AuthError> {
        self.sessions
            .lock()
            .map_err(|_| AuthError::StatePoisoned)?
            .revoke(token);
        Ok(())
    }

    fn finish_invalid(
        &self,
        reservation: AttemptReservation,
        now: u64,
    ) -> Result<LoginOutcome, AuthError> {
        let decision = self
            .limiter
            .lock()
            .map_err(|_| AuthError::StatePoisoned)?
            .finalize_failure(reservation, now);
        Ok(failure_outcome(decision))
    }

    fn cancel(&self, reservation: AttemptReservation) -> Result<(), AuthError> {
        self.limiter
            .lock()
            .map_err(|_| AuthError::StatePoisoned)?
            .cancel(reservation);
        Ok(())
    }

    fn abort_pending(&self, pending: super::PendingSession) -> Result<(), AuthError> {
        self.sessions
            .lock()
            .map_err(|_| AuthError::StatePoisoned)?
            .abort(pending);
        Ok(())
    }
}

fn failure_outcome(decision: FailureDecision) -> LoginOutcome {
    match decision {
        FailureDecision::Invalid { .. } => LoginOutcome::Invalid,
        FailureDecision::Blocked {
            retry_after_seconds,
        } => LoginOutcome::RateLimited {
            retry_after_seconds,
        },
    }
}

#[cfg(test)]
mod tests {
    use std::{
        convert::Infallible,
        sync::{Arc, Mutex},
    };

    use super::*;

    struct Password(bool);
    impl PasswordVerifier for Password {
        type Error = Infallible;
        fn verify(&self, _: &SecretString, _: &SecretString) -> Result<bool, Self::Error> {
            Ok(self.0)
        }
    }

    struct BrokenPassword;
    impl PasswordVerifier for BrokenPassword {
        type Error = ();
        fn verify(&self, _: &SecretString, _: &SecretString) -> Result<bool, Self::Error> {
            Err(())
        }
    }

    struct Totp;
    impl TotpCodeGenerator for Totp {
        type Error = Infallible;
        fn code_for_counter(&self, _: &SecretBytes, counter: u64) -> Result<[u8; 6], Self::Error> {
            Ok(format!("{:06}", counter).as_bytes().try_into().unwrap())
        }
    }

    #[derive(Default, Clone)]
    struct Recovery {
        state: Arc<Mutex<Vec<RecoveryCodeDigest>>>,
        calls: Arc<Mutex<Vec<bool>>>,
    }
    impl RecoveryCodeRepository for Recovery {
        type Error = Infallible;
        fn verify_and_consume(
            &self,
            digest: &RecoveryCodeDigest,
            authorized: bool,
        ) -> Result<bool, Self::Error> {
            self.calls.lock().unwrap().push(authorized);
            let mut codes = self.state.lock().unwrap();
            let Some(index) = codes.iter().position(|value| value == digest) else {
                return Ok(false);
            };
            if authorized {
                codes.remove(index);
                return Ok(true);
            }
            Ok(false)
        }
    }

    #[derive(Default, Clone)]
    struct PersistentReplay(Arc<Mutex<Vec<u64>>>);
    impl TotpReplayRepository for PersistentReplay {
        type Error = Infallible;
        fn reserve_equivalent(&self, counters: &[u64], _: u64) -> Result<bool, Self::Error> {
            let mut used = self.0.lock().unwrap();
            if counters.iter().any(|counter| used.contains(counter)) {
                return Ok(false);
            }
            used.extend_from_slice(counters);
            Ok(!counters.is_empty())
        }
    }

    struct Random(u8);
    impl RandomSource for Random {
        type Error = Infallible;
        fn fill(&mut self, bytes: &mut [u8]) -> Result<(), Self::Error> {
            bytes.fill(self.0);
            self.0 += 1;
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

    fn engine(
        password: bool,
        recovery: Recovery,
        replay: PersistentReplay,
    ) -> AuthEngine<Password, Totp, Recovery, PersistentReplay> {
        AuthEngine::new(
            SecretString::new("hash"),
            SecretBytes::new(vec![0; 20]),
            Password(password),
            Totp,
            recovery,
            replay,
        )
    }

    #[test]
    fn replay_repository_survives_engine_reconstruction() {
        let replay = PersistentReplay::default();
        let ip = "127.0.0.1".parse().unwrap();
        let password = SecretString::new("password");
        let first = engine(true, Recovery::default(), replay.clone());
        assert!(matches!(
            first
                .login(
                    ip,
                    &password,
                    LoginVerification::Totp("000010"),
                    300,
                    &mut Random(1)
                )
                .unwrap(),
            LoginOutcome::Authenticated(_)
        ));
        let restarted = engine(true, Recovery::default(), replay);
        assert!(matches!(
            restarted
                .login(
                    ip,
                    &password,
                    LoginVerification::Totp("000010"),
                    300,
                    &mut Random(2)
                )
                .unwrap(),
            LoginOutcome::Invalid
        ));
    }

    #[test]
    fn wrong_password_still_scans_recovery_without_consuming_it() {
        let code = RecoveryCode::parse("AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA").unwrap();
        let recovery = Recovery::default();
        recovery.state.lock().unwrap().push(code.digest());
        let auth = engine(false, recovery.clone(), PersistentReplay::default());
        let result = auth
            .login(
                "127.0.0.1".parse().unwrap(),
                &SecretString::new("wrong"),
                LoginVerification::Recovery(&code),
                0,
                &mut Random(1),
            )
            .unwrap();
        assert!(matches!(result, LoginOutcome::Invalid));
        assert_eq!(*recovery.calls.lock().unwrap(), vec![false]);
        assert_eq!(recovery.state.lock().unwrap().len(), 1);
    }

    #[test]
    fn rng_failure_happens_before_one_time_factor_consumption() {
        let code = RecoveryCode::parse("AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA").unwrap();
        let recovery = Recovery::default();
        recovery.state.lock().unwrap().push(code.digest());
        let auth = engine(true, recovery.clone(), PersistentReplay::default());
        assert_eq!(
            auth.login(
                "127.0.0.1".parse().unwrap(),
                &SecretString::new("right"),
                LoginVerification::Recovery(&code),
                0,
                &mut FailingRandom,
            )
            .unwrap_err(),
            AuthError::RandomGeneration
        );
        assert!(recovery.calls.lock().unwrap().is_empty());
        assert_eq!(recovery.state.lock().unwrap().len(), 1);
    }

    #[test]
    fn session_authentication_returns_refresh_metadata() {
        let auth = engine(true, Recovery::default(), PersistentReplay::default());
        let password = SecretString::new("password");
        let LoginOutcome::Authenticated(token) = auth
            .login(
                "127.0.0.1".parse().unwrap(),
                &password,
                LoginVerification::Totp("000010"),
                300,
                &mut Random(1),
            )
            .unwrap()
        else {
            panic!("login failed")
        };
        let session = auth
            .authenticate_session(token.expose(), 301)
            .unwrap()
            .unwrap();
        assert_eq!(
            session.refresh_max_age_seconds,
            super::super::SESSION_TTL_SECONDS
        );
        auth.logout(token.expose()).unwrap();
        assert!(
            auth.authenticate_session(token.expose(), 302)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn oversized_client_password_is_counted_as_invalid_and_the_fifth_attempt_blocks() {
        let auth = engine(true, Recovery::default(), PersistentReplay::default());
        let password = SecretString::new("x".repeat(MAX_PASSWORD_BYTES + 1));
        let ip = "127.0.0.1".parse().unwrap();
        for attempt in 1..=5 {
            let outcome = auth
                .login(
                    ip,
                    &password,
                    LoginVerification::Totp("000010"),
                    300,
                    &mut Random(attempt),
                )
                .unwrap();
            if attempt < 5 {
                assert!(matches!(outcome, LoginOutcome::Invalid));
            } else {
                assert!(matches!(
                    outcome,
                    LoginOutcome::RateLimited {
                        retry_after_seconds: super::super::rate_limit::LOGIN_COOLDOWN_SECONDS
                    }
                ));
            }
        }
    }

    #[test]
    fn password_adapter_errors_remain_unavailable_and_release_the_reservation() {
        let auth = AuthEngine::new(
            SecretString::new("hash"),
            SecretBytes::new(vec![0; 20]),
            BrokenPassword,
            Totp,
            Recovery::default(),
            PersistentReplay::default(),
        );
        for _ in 0..2 {
            assert_eq!(
                auth.login(
                    "127.0.0.1".parse().unwrap(),
                    &SecretString::new("candidate"),
                    LoginVerification::Totp("000010"),
                    300,
                    &mut Random(1),
                )
                .unwrap_err(),
                AuthError::PasswordVerification
            );
        }
    }
}
