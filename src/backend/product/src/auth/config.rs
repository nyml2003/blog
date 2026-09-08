use std::{net::IpAddr, path::PathBuf, str::FromStr};

use super::{SecretBytes, SecretString};

pub const ADMIN_PASSWORD_HASH_ENV: &str = "BLOG_ADMIN_PASSWORD_HASH";
pub const ADMIN_TOTP_SECRET_ENV: &str = "BLOG_ADMIN_TOTP_SECRET";
pub const ADMIN_RUNTIME_DIR_ENV: &str = "BLOG_ADMIN_RUNTIME_DIR";
pub const TRUSTED_PROXY_IPS_ENV: &str = "BLOG_TRUSTED_PROXY_IPS";

#[derive(Debug)]
pub struct AuthConfig {
    pub password_hash: SecretString,
    pub totp_secret: SecretBytes,
    pub runtime_dir: PathBuf,
    pub trusted_proxy_ips: Vec<IpAddr>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthUnavailableReason {
    MissingPasswordHash,
    MissingTotpSecret,
    MissingRuntimeDirectory,
    InvalidTotpSecret,
    InvalidProxySetting,
    InvalidPasswordHash,
    InvalidPersistentState,
}

#[derive(Debug)]
pub enum AuthAvailability {
    Configured(AuthConfig),
    Unavailable(Vec<AuthUnavailableReason>),
}

impl AuthConfig {
    pub fn from_environment() -> AuthAvailability {
        Self::from_lookup(|name| std::env::var(name).ok())
    }

    pub fn from_lookup(mut lookup: impl FnMut(&str) -> Option<String>) -> AuthAvailability {
        let password_hash = non_empty(lookup(ADMIN_PASSWORD_HASH_ENV));
        let encoded_totp = non_empty(lookup(ADMIN_TOTP_SECRET_ENV));
        let runtime_dir = non_empty(lookup(ADMIN_RUNTIME_DIR_ENV));
        let proxy_value = non_empty(lookup(TRUSTED_PROXY_IPS_ENV));
        let mut reasons = Vec::new();

        if password_hash.is_none() {
            reasons.push(AuthUnavailableReason::MissingPasswordHash);
        }
        if encoded_totp.is_none() {
            reasons.push(AuthUnavailableReason::MissingTotpSecret);
        }
        if runtime_dir.is_none() {
            reasons.push(AuthUnavailableReason::MissingRuntimeDirectory);
        }

        let totp_secret = encoded_totp.as_deref().and_then(decode_base32_no_padding);
        if encoded_totp.is_some() && totp_secret.is_none() {
            reasons.push(AuthUnavailableReason::InvalidTotpSecret);
        }

        let trusted_proxy_ips = match proxy_value.as_deref() {
            None => Some(Vec::new()),
            Some(value) => value
                .split(',')
                .map(|part| part.trim().parse::<IpAddr>())
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| ())
                .map_err(|_| {
                    reasons.push(AuthUnavailableReason::InvalidProxySetting);
                })
                .ok(),
        };

        if !reasons.is_empty() {
            return AuthAvailability::Unavailable(reasons);
        }

        AuthAvailability::Configured(AuthConfig {
            password_hash: SecretString::new(password_hash.expect("checked above")),
            totp_secret: SecretBytes::new(totp_secret.expect("checked above")),
            runtime_dir: PathBuf::from(runtime_dir.expect("checked above")),
            trusted_proxy_ips: trusted_proxy_ips.expect("checked above"),
        })
    }
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_owned())
    })
}

fn decode_base32_no_padding(value: &str) -> Option<Vec<u8>> {
    let value = value.trim().to_ascii_uppercase();
    if value.len() < 32
        || value
            .bytes()
            .any(|byte| !matches!(byte, b'A'..=b'Z' | b'2'..=b'7'))
    {
        return None;
    }

    let mut bits = 0_u32;
    let mut bit_count = 0_u8;
    let mut output = Vec::with_capacity(value.len() * 5 / 8);
    for byte in value.bytes() {
        let digit = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'2'..=b'7' => byte - b'2' + 26,
            _ => return None,
        };
        bits = (bits << 5) | u32::from(digit);
        bit_count += 5;
        if bit_count >= 8 {
            bit_count -= 8;
            output.push((bits >> bit_count) as u8);
            bits &= (1_u32 << bit_count) - 1;
        }
    }

    (output.len() >= 20).then_some(output)
}

pub fn encode_base32_no_padding(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut accumulator = 0_u32;
    let mut bit_count = 0_u8;
    let mut output = String::with_capacity((bytes.len() * 8).div_ceil(5));
    for byte in bytes {
        accumulator = (accumulator << 8) | u32::from(*byte);
        bit_count += 8;
        while bit_count >= 5 {
            bit_count -= 5;
            output.push(ALPHABET[((accumulator >> bit_count) & 0x1f) as usize] as char);
            accumulator &= (1_u32 << bit_count) - 1;
        }
    }
    if bit_count > 0 {
        output.push(ALPHABET[((accumulator << (5 - bit_count)) & 0x1f) as usize] as char);
    }
    output
}

impl FromStr for AuthUnavailableReason {
    type Err = ();

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "missing_password_hash" => Ok(Self::MissingPasswordHash),
            "missing_totp_secret" => Ok(Self::MissingTotpSecret),
            "missing_runtime_directory" => Ok(Self::MissingRuntimeDirectory),
            "invalid_totp_secret" => Ok(Self::InvalidTotpSecret),
            "invalid_proxy_setting" => Ok(Self::InvalidProxySetting),
            "invalid_password_hash" => Ok(Self::InvalidPasswordHash),
            "invalid_persistent_state" => Ok(Self::InvalidPersistentState),
            _ => Err(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    #[test]
    fn missing_values_fail_closed_without_secret_values_in_debug() {
        let result = AuthConfig::from_lookup(|_| None);
        let AuthAvailability::Unavailable(reasons) = result else {
            panic!("missing credentials must be unavailable");
        };
        assert_eq!(reasons.len(), 3);
    }

    #[test]
    fn complete_values_are_decoded_and_redacted() {
        let values = HashMap::from([
            (ADMIN_PASSWORD_HASH_ENV, "$argon2id$example".to_owned()),
            (
                ADMIN_TOTP_SECRET_ENV,
                "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP".to_owned(),
            ),
            (ADMIN_RUNTIME_DIR_ENV, "/runtime/auth".to_owned()),
            (TRUSTED_PROXY_IPS_ENV, "127.0.0.1,::1".to_owned()),
        ]);
        let result = AuthConfig::from_lookup(|name| values.get(name).cloned());
        let AuthAvailability::Configured(config) = result else {
            panic!("complete configuration must be available");
        };
        let debug = format!("{config:?}");
        assert!(!debug.contains("argon2id"));
        assert!(!debug.contains("JBSWY"));
        assert_eq!(config.trusted_proxy_ips.len(), 2);
    }
}
