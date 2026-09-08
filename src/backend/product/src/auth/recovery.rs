use sha2::{Digest, Sha256};
use std::collections::HashSet;

use super::{RandomSource, SecretString};

pub const RECOVERY_CODE_COUNT: usize = 10;
pub const RECOVERY_CODE_BYTES: usize = 16;
const RECOVERY_COLLISION_ATTEMPTS: usize = 8;

pub struct RecoveryCode(SecretString);

impl RecoveryCode {
    pub fn parse(value: impl Into<String>) -> Option<Self> {
        Self::parse_secret(SecretString::new(value.into()))
    }

    pub fn parse_secret(value: SecretString) -> Option<Self> {
        let normalized = normalize(value.expose())?;
        Some(Self(SecretString::new(normalized)))
    }

    pub fn expose(&self) -> &str {
        self.0.expose()
    }

    pub fn digest(&self) -> RecoveryCodeDigest {
        RecoveryCodeDigest(Sha256::digest(self.0.expose().as_bytes()).into())
    }
}

impl std::fmt::Debug for RecoveryCode {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("RecoveryCode([REDACTED])")
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub struct RecoveryCodeDigest(pub [u8; 32]);

impl std::fmt::Debug for RecoveryCodeDigest {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("RecoveryCodeDigest([REDACTED])")
    }
}

#[derive(Debug)]
pub struct RecoveryCodeSet {
    digests: Vec<RecoveryCodeDigest>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryCodeSetError {
    TooMany,
    Duplicate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryGenerationError<E> {
    Random(E),
    CollisionLimit,
}

impl RecoveryCodeSet {
    pub fn generate<R: RandomSource>(
        random: &mut R,
    ) -> Result<(Self, Vec<RecoveryCode>), RecoveryGenerationError<R::Error>> {
        let mut codes = Vec::with_capacity(RECOVERY_CODE_COUNT);
        let mut digests = Vec::with_capacity(RECOVERY_CODE_COUNT);
        for _ in 0..RECOVERY_CODE_COUNT {
            let mut generated = None;
            for _ in 0..RECOVERY_COLLISION_ATTEMPTS {
                let mut bytes = [0_u8; RECOVERY_CODE_BYTES];
                random
                    .fill(&mut bytes)
                    .map_err(RecoveryGenerationError::Random)?;
                let code = RecoveryCode(SecretString::new(encode_base32(&bytes)));
                let digest = code.digest();
                if !digests
                    .iter()
                    .any(|stored| constant_time_digest_equal(stored, &digest))
                {
                    generated = Some((code, digest));
                    break;
                }
            }
            let Some((code, digest)) = generated else {
                return Err(RecoveryGenerationError::CollisionLimit);
            };
            digests.push(digest);
            codes.push(code);
        }
        Ok((Self { digests }, codes))
    }

    pub fn from_digests(digests: Vec<RecoveryCodeDigest>) -> Result<Self, RecoveryCodeSetError> {
        if digests.len() > RECOVERY_CODE_COUNT {
            return Err(RecoveryCodeSetError::TooMany);
        }
        let unique: HashSet<_> = digests.iter().map(|digest| digest.0).collect();
        if unique.len() != digests.len() {
            return Err(RecoveryCodeSetError::Duplicate);
        }
        Ok(Self { digests })
    }

    pub fn consume(&mut self, candidate: &RecoveryCodeDigest) -> bool {
        let mut matching_index = None;
        for (index, stored) in self.digests.iter().enumerate() {
            let matches = constant_time_digest_equal(stored, candidate);
            if matches && matching_index.is_none() {
                matching_index = Some(index);
            }
        }
        if let Some(index) = matching_index {
            self.digests.remove(index);
            true
        } else {
            false
        }
    }

    pub fn digests(&self) -> &[RecoveryCodeDigest] {
        &self.digests
    }
}

fn normalize(value: &str) -> Option<String> {
    let normalized: String = value
        .chars()
        .filter(|character| !matches!(character, '-' | ' '))
        .flat_map(char::to_uppercase)
        .collect();
    (normalized.len() == 26
        && normalized
            .bytes()
            .all(|byte| matches!(byte, b'A'..=b'Z' | b'2'..=b'7')))
    .then_some(normalized)
}

fn encode_base32(bytes: &[u8]) -> String {
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

fn constant_time_digest_equal(left: &RecoveryCodeDigest, right: &RecoveryCodeDigest) -> bool {
    let mut difference = 0_u8;
    for index in 0..32 {
        difference |= left.0[index] ^ right.0[index];
    }
    difference == 0
}

#[cfg(test)]
mod tests {
    use std::convert::Infallible;

    use super::*;

    struct CounterRandom(u8);

    impl RandomSource for CounterRandom {
        type Error = Infallible;

        fn fill(&mut self, destination: &mut [u8]) -> Result<(), Self::Error> {
            for byte in destination {
                *byte = self.0;
                self.0 = self.0.wrapping_add(1);
            }
            Ok(())
        }
    }

    struct ConstantRandom;

    impl RandomSource for ConstantRandom {
        type Error = Infallible;

        fn fill(&mut self, destination: &mut [u8]) -> Result<(), Self::Error> {
            destination.fill(7);
            Ok(())
        }
    }

    #[test]
    fn generates_ten_high_entropy_codes_and_stores_only_digests() {
        let (set, codes) = RecoveryCodeSet::generate(&mut CounterRandom(0)).unwrap();
        assert_eq!(codes.len(), 10);
        assert_eq!(set.digests().len(), 10);
        assert!(codes.iter().all(|code| code.expose().len() == 26));
        assert!(!format!("{set:?}").contains(codes[0].expose()));
    }

    #[test]
    fn a_code_can_be_consumed_only_once() {
        let (mut set, codes) = RecoveryCodeSet::generate(&mut CounterRandom(0)).unwrap();
        let digest = codes[0].digest();
        assert!(set.consume(&digest));
        assert!(!set.consume(&digest));
        assert_eq!(set.digests().len(), 9);
    }

    #[test]
    fn duplicate_persisted_digests_and_generation_collisions_are_rejected() {
        let digest = RecoveryCodeDigest([1; 32]);
        assert_eq!(
            RecoveryCodeSet::from_digests(vec![digest, digest]).unwrap_err(),
            RecoveryCodeSetError::Duplicate
        );
        assert_eq!(
            RecoveryCodeSet::generate(&mut ConstantRandom).unwrap_err(),
            RecoveryGenerationError::CollisionLimit
        );
    }
}
