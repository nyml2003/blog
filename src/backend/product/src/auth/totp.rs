use std::{collections::HashSet, sync::Mutex};

use super::{SecretBytes, TotpCodeGenerator, TotpReplayRepository};

pub const TOTP_STEP_SECONDS: u64 = 30;
pub const TOTP_DIGITS: usize = 6;
pub const TOTP_MATCH_WINDOW_COUNTERS: u64 = 1;
pub const TOTP_MAX_CLOCK_ROLLBACK_COUNTERS: u64 = 1;

#[derive(Debug, Default)]
pub struct TotpVerifier;

impl TotpVerifier {
    pub fn matching_counters<G: TotpCodeGenerator>(
        &self,
        generator: &G,
        secret: &SecretBytes,
        candidate: &str,
        unix_seconds: u64,
    ) -> Result<Vec<u64>, G::Error> {
        let Some(candidate) = parse_six_digits(candidate) else {
            return Ok(Vec::new());
        };
        let current = unix_seconds / TOTP_STEP_SECONDS;
        let counters = [
            current.saturating_sub(1),
            current,
            current.saturating_add(1),
        ];
        let mut matches = [false; 3];

        // Always calculate and compare the complete +/-1 window. Keep every equivalent counter:
        // adjacent HOTP values can collide after truncation to six digits.
        for (index, counter) in counters.iter().copied().enumerate() {
            let expected = generator.code_for_counter(secret, counter)?;
            matches[index] = constant_time_equal(&candidate, &expected);
        }

        let mut matched = Vec::with_capacity(3);
        for index in [1_usize, 0, 2] {
            let counter = counters[index];
            if matches[index] && !matched.contains(&counter) {
                matched.push(counter);
            }
        }
        Ok(matched)
    }
}

#[derive(Debug, Default)]
pub struct InMemoryTotpReplayRepository {
    state: Mutex<InMemoryReplayState>,
}

#[derive(Debug, Default)]
struct InMemoryReplayState {
    high_water_counter: Option<u64>,
    used_counters: HashSet<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InMemoryTotpReplayError {
    CounterOutsideWindow,
    ClockRollback,
}

impl TotpReplayRepository for InMemoryTotpReplayRepository {
    type Error = InMemoryTotpReplayError;

    fn reserve_equivalent(
        &self,
        matched_counters: &[u64],
        current_counter: u64,
    ) -> Result<bool, Self::Error> {
        if matched_counters.is_empty() {
            return Ok(false);
        }
        let minimum = current_counter.saturating_sub(TOTP_MATCH_WINDOW_COUNTERS);
        let maximum = current_counter.saturating_add(TOTP_MATCH_WINDOW_COUNTERS);
        if matched_counters
            .iter()
            .any(|counter| *counter < minimum || *counter > maximum)
        {
            return Err(InMemoryTotpReplayError::CounterOutsideWindow);
        }
        let mut state = self.state.lock().expect("replay mutex poisoned");
        if state.high_water_counter.is_some_and(|high_water| {
            current_counter.saturating_add(TOTP_MAX_CLOCK_ROLLBACK_COUNTERS) < high_water
        }) {
            return Err(InMemoryTotpReplayError::ClockRollback);
        }
        let high_water = state
            .high_water_counter
            .map_or(current_counter, |value| value.max(current_counter));
        let retained_history =
            TOTP_MATCH_WINDOW_COUNTERS.saturating_add(TOTP_MAX_CLOCK_ROLLBACK_COUNTERS);
        let oldest_kept = high_water.saturating_sub(retained_history);
        state
            .used_counters
            .retain(|counter| *counter >= oldest_kept);
        if matched_counters
            .iter()
            .any(|counter| state.used_counters.contains(counter))
        {
            return Ok(false);
        }
        state.used_counters.extend(matched_counters.iter().copied());
        state.high_water_counter = Some(high_water);
        Ok(true)
    }
}

fn parse_six_digits(value: &str) -> Option<[u8; TOTP_DIGITS]> {
    let bytes = value.as_bytes();
    if bytes.len() != TOTP_DIGITS || bytes.iter().any(|byte| !byte.is_ascii_digit()) {
        return None;
    }
    let mut output = [0_u8; TOTP_DIGITS];
    output.copy_from_slice(bytes);
    Some(output)
}

fn constant_time_equal(left: &[u8; TOTP_DIGITS], right: &[u8; TOTP_DIGITS]) -> bool {
    let mut difference = 0_u8;
    for index in 0..TOTP_DIGITS {
        difference |= left[index] ^ right[index];
    }
    difference == 0
}

#[cfg(test)]
mod tests {
    use std::{convert::Infallible, sync::Mutex};

    use super::*;

    struct Generator {
        visited: Mutex<Vec<u64>>,
        collide: bool,
    }

    impl TotpCodeGenerator for Generator {
        type Error = Infallible;

        fn code_for_counter(
            &self,
            _secret: &SecretBytes,
            counter: u64,
        ) -> Result<[u8; 6], Self::Error> {
            self.visited.lock().unwrap().push(counter);
            let code = if self.collide {
                10
            } else {
                counter % 1_000_000
            };
            Ok(format!("{code:06}")
                .as_bytes()
                .try_into()
                .expect("six digits"))
        }
    }

    #[test]
    fn verifies_full_window_without_early_return() {
        let generator = Generator {
            visited: Mutex::new(Vec::new()),
            collide: false,
        };
        let secret = SecretBytes::new(vec![7; 20]);
        let matched = TotpVerifier
            .matching_counters(&generator, &secret, "000010", 10 * 30)
            .unwrap();
        assert_eq!(matched, vec![10]);
        assert_eq!(*generator.visited.lock().unwrap(), vec![9, 10, 11]);
    }

    #[test]
    fn adjacent_collisions_are_reserved_as_one_equivalent_set() {
        let generator = Generator {
            visited: Mutex::new(Vec::new()),
            collide: true,
        };
        let secret = SecretBytes::new(vec![7; 20]);
        let matched = TotpVerifier
            .matching_counters(&generator, &secret, "000010", 10 * 30)
            .unwrap();
        assert_eq!(matched, vec![10, 9, 11]);

        let replay = InMemoryTotpReplayRepository::default();
        assert!(replay.reserve_equivalent(&matched, 10).unwrap());
        assert!(!replay.reserve_equivalent(&[11, 12], 11).unwrap());
    }
}
