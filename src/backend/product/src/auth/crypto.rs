use argon2::{
    Algorithm, Argon2, Params, Version,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier as _, SaltString},
};
use hmac::{Hmac, Mac};
use sha1::Sha1;

use super::{
    ARGON2ID_ALGORITHM, PasswordHashPolicy, PasswordVerifier, RandomSource, SecretBytes,
    SecretString, TotpCodeGenerator,
};

const ARGON2_VERSION: u32 = 19;
const ARGON2_SALT_BYTES: usize = 16;
pub const MAX_PASSWORD_BYTES: usize = 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CryptoAdapterError {
    InvalidPasswordHash,
    UnsupportedPasswordHash,
    PasswordTooLong,
    PasswordHashingFailed,
    TotpSecretTooShort,
    RandomUnavailable,
}

impl std::fmt::Display for CryptoAdapterError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::InvalidPasswordHash => "invalid password hash",
            Self::UnsupportedPasswordHash => "unsupported password hash policy",
            Self::PasswordTooLong => "password exceeds the accepted size",
            Self::PasswordHashingFailed => "password hashing failed",
            Self::TotpSecretTooShort => "TOTP secret is too short",
            Self::RandomUnavailable => "operating-system random source unavailable",
        })
    }
}

impl std::error::Error for CryptoAdapterError {}

#[derive(Debug, Clone, Copy, Default)]
pub struct Argon2idPasswordVerifier {
    policy: PasswordHashPolicy,
}

impl Argon2idPasswordVerifier {
    pub fn new(policy: PasswordHashPolicy) -> Self {
        Self { policy }
    }

    pub fn validate_phc(&self, encoded_hash: &SecretString) -> Result<(), CryptoAdapterError> {
        if encoded_hash.expose().len() > 512 {
            return Err(CryptoAdapterError::InvalidPasswordHash);
        }
        let parsed = PasswordHash::new(encoded_hash.expose())
            .map_err(|_| CryptoAdapterError::InvalidPasswordHash)?;
        if parsed.algorithm.as_str() != ARGON2ID_ALGORITHM || parsed.version != Some(ARGON2_VERSION)
        {
            return Err(CryptoAdapterError::UnsupportedPasswordHash);
        }
        let memory = parsed
            .params
            .get_decimal("m")
            .ok_or(CryptoAdapterError::InvalidPasswordHash)?;
        let iterations = parsed
            .params
            .get_decimal("t")
            .ok_or(CryptoAdapterError::InvalidPasswordHash)?;
        let parallelism = parsed
            .params
            .get_decimal("p")
            .ok_or(CryptoAdapterError::InvalidPasswordHash)?;
        let valid_salt = parsed
            .salt
            .is_some_and(|salt| (16..=64).contains(&salt.as_str().len()));
        let valid_output = parsed.hash.is_some_and(|hash| hash.as_bytes().len() == 32);
        if !self
            .policy
            .accepts(ARGON2ID_ALGORITHM, memory, iterations, parallelism)
            || !valid_salt
            || !valid_output
        {
            return Err(CryptoAdapterError::UnsupportedPasswordHash);
        }
        Ok(())
    }

    pub fn hash_password<R: RandomSource>(
        &self,
        password: &SecretString,
        random: &mut R,
    ) -> Result<SecretString, CryptoAdapterError> {
        validate_password_size(password)?;
        let mut salt = [0_u8; ARGON2_SALT_BYTES];
        random
            .fill(&mut salt)
            .map_err(|_| CryptoAdapterError::RandomUnavailable)?;
        let salt =
            SaltString::encode_b64(&salt).map_err(|_| CryptoAdapterError::PasswordHashingFailed)?;
        let params = Params::new(
            self.policy.memory_kib,
            self.policy.iterations,
            self.policy.parallelism,
            Some(32),
        )
        .map_err(|_| CryptoAdapterError::PasswordHashingFailed)?;
        let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
        let encoded = argon2
            .hash_password(password.expose().as_bytes(), &salt)
            .map_err(|_| CryptoAdapterError::PasswordHashingFailed)?
            .to_string();
        Ok(SecretString::new(encoded))
    }
}

impl PasswordVerifier for Argon2idPasswordVerifier {
    type Error = CryptoAdapterError;

    fn verify(
        &self,
        encoded_hash: &SecretString,
        candidate: &SecretString,
    ) -> Result<bool, Self::Error> {
        validate_password_size(candidate)?;
        self.validate_phc(encoded_hash)?;
        let parsed = PasswordHash::new(encoded_hash.expose())
            .map_err(|_| CryptoAdapterError::InvalidPasswordHash)?;
        Ok(Argon2::default()
            .verify_password(candidate.expose().as_bytes(), &parsed)
            .is_ok())
    }
}

fn validate_password_size(password: &SecretString) -> Result<(), CryptoAdapterError> {
    if password.expose().len() > MAX_PASSWORD_BYTES {
        Err(CryptoAdapterError::PasswordTooLong)
    } else {
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct HmacSha1TotpGenerator;

impl TotpCodeGenerator for HmacSha1TotpGenerator {
    type Error = CryptoAdapterError;

    fn code_for_counter(&self, secret: &SecretBytes, counter: u64) -> Result<[u8; 6], Self::Error> {
        if secret.expose().len() < 20 {
            return Err(CryptoAdapterError::TotpSecretTooShort);
        }
        let mut mac = Hmac::<Sha1>::new_from_slice(secret.expose())
            .map_err(|_| CryptoAdapterError::TotpSecretTooShort)?;
        mac.update(&counter.to_be_bytes());
        let digest = mac.finalize().into_bytes();
        let offset = usize::from(digest[19] & 0x0f);
        let binary = (u32::from(digest[offset] & 0x7f) << 24)
            | (u32::from(digest[offset + 1]) << 16)
            | (u32::from(digest[offset + 2]) << 8)
            | u32::from(digest[offset + 3]);
        let mut value = binary % 1_000_000;
        let mut code = [b'0'; 6];
        for digit in code.iter_mut().rev() {
            *digit = b'0' + (value % 10) as u8;
            value /= 10;
        }
        Ok(code)
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct OsRandomSource;

impl RandomSource for OsRandomSource {
    type Error = CryptoAdapterError;

    fn fill(&mut self, destination: &mut [u8]) -> Result<(), Self::Error> {
        getrandom::fill(destination).map_err(|_| CryptoAdapterError::RandomUnavailable)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FixedRandom(u8);

    impl RandomSource for FixedRandom {
        type Error = std::convert::Infallible;

        fn fill(&mut self, destination: &mut [u8]) -> Result<(), Self::Error> {
            destination.fill(self.0);
            self.0 = self.0.wrapping_add(1);
            Ok(())
        }
    }

    #[test]
    fn generated_argon2id_hash_has_fixed_policy_and_verifies() {
        let verifier = Argon2idPasswordVerifier::default();
        let password = SecretString::new("correct horse battery staple");
        let hash = verifier
            .hash_password(&password, &mut FixedRandom(7))
            .unwrap();
        verifier.validate_phc(&hash).unwrap();
        assert!(verifier.verify(&hash, &password).unwrap());
        assert!(!verifier.verify(&hash, &SecretString::new("wrong")).unwrap());
    }

    #[test]
    fn rejects_wrong_algorithm_version_and_unbounded_parameters() {
        let verifier = Argon2idPasswordVerifier::default();
        let password = SecretString::new("password");
        let valid = verifier
            .hash_password(&password, &mut FixedRandom(9))
            .unwrap();
        let wrong_algorithm = SecretString::new(valid.expose().replacen("argon2id", "argon2i", 1));
        assert_eq!(
            verifier.validate_phc(&wrong_algorithm),
            Err(CryptoAdapterError::UnsupportedPasswordHash)
        );
        let wrong_version = SecretString::new(valid.expose().replacen("v=19", "v=16", 1));
        assert_eq!(
            verifier.validate_phc(&wrong_version),
            Err(CryptoAdapterError::UnsupportedPasswordHash)
        );
        let excessive = SecretString::new(valid.expose().replacen("m=65536", "m=524288", 1));
        assert_eq!(
            verifier.validate_phc(&excessive),
            Err(CryptoAdapterError::UnsupportedPasswordHash)
        );
    }

    #[test]
    fn hmac_sha1_matches_rfc_6238_sha1_vector_after_six_digit_truncation() {
        let generator = HmacSha1TotpGenerator;
        let secret = SecretBytes::new(b"12345678901234567890".to_vec());
        // RFC 6238 gives 94287082 at 59 seconds; the six-digit profile is 287082.
        assert_eq!(generator.code_for_counter(&secret, 1).unwrap(), *b"287082");
    }

    #[test]
    fn operating_system_random_source_fills_bytes() {
        let mut bytes = [0_u8; 32];
        OsRandomSource.fill(&mut bytes).unwrap();
        assert_ne!(bytes, [0_u8; 32]);
    }
}
