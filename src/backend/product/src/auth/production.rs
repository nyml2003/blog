use std::{net::IpAddr, sync::Arc};

use super::{
    Argon2idPasswordVerifier, AuthAvailability, AuthConfig, AuthEngine, AuthUnavailableReason,
    FilesystemRecoveryCodeRepository, FilesystemTotpReplayRepository, HmacSha1TotpGenerator,
};

pub type ProductionAuthEngine = AuthEngine<
    Argon2idPasswordVerifier,
    HmacSha1TotpGenerator,
    FilesystemRecoveryCodeRepository,
    FilesystemTotpReplayRepository,
>;

pub enum ProductionAuthState {
    Configured(Arc<ProductionAuthEngine>),
    Unavailable(Vec<AuthUnavailableReason>),
}

impl std::fmt::Debug for ProductionAuthState {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Configured(_) => formatter.write_str("Configured([REDACTED])"),
            Self::Unavailable(reasons) => {
                formatter.debug_tuple("Unavailable").field(reasons).finish()
            }
        }
    }
}

#[derive(Debug)]
pub struct ProductionAuthRuntime {
    state: ProductionAuthState,
    trusted_proxy_ips: Vec<IpAddr>,
}

impl ProductionAuthRuntime {
    pub fn from_environment() -> Self {
        match AuthConfig::from_environment() {
            AuthAvailability::Configured(config) => Self::from_config(config),
            AuthAvailability::Unavailable(reasons) => Self {
                state: ProductionAuthState::Unavailable(reasons),
                trusted_proxy_ips: Vec::new(),
            },
        }
    }

    pub fn from_config(config: AuthConfig) -> Self {
        let trusted_proxy_ips = config.trusted_proxy_ips;
        let verifier = Argon2idPasswordVerifier::default();
        if verifier.validate_phc(&config.password_hash).is_err() {
            return Self::unavailable(
                AuthUnavailableReason::InvalidPasswordHash,
                trusted_proxy_ips,
            );
        }
        let recovery = match FilesystemRecoveryCodeRepository::open(&config.runtime_dir) {
            Ok(repository) => repository,
            Err(_) => {
                return Self::unavailable(
                    AuthUnavailableReason::InvalidPersistentState,
                    trusted_proxy_ips,
                );
            }
        };
        let replay = match FilesystemTotpReplayRepository::open(&config.runtime_dir) {
            Ok(repository) => repository,
            Err(_) => {
                return Self::unavailable(
                    AuthUnavailableReason::InvalidPersistentState,
                    trusted_proxy_ips,
                );
            }
        };
        let engine = AuthEngine::new(
            config.password_hash,
            config.totp_secret,
            verifier,
            HmacSha1TotpGenerator,
            recovery,
            replay,
        );
        Self {
            state: ProductionAuthState::Configured(Arc::new(engine)),
            trusted_proxy_ips,
        }
    }

    pub fn state(&self) -> &ProductionAuthState {
        &self.state
    }

    pub fn engine(&self) -> Option<&Arc<ProductionAuthEngine>> {
        match &self.state {
            ProductionAuthState::Configured(engine) => Some(engine),
            ProductionAuthState::Unavailable(_) => None,
        }
    }

    pub fn is_trusted_proxy(&self, ip: IpAddr) -> bool {
        self.trusted_proxy_ips.contains(&ip)
    }

    fn unavailable(reason: AuthUnavailableReason, trusted_proxy_ips: Vec<IpAddr>) -> Self {
        Self {
            state: ProductionAuthState::Unavailable(vec![reason]),
            trusted_proxy_ips,
        }
    }
}
