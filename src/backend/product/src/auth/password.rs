/// PHC algorithm accepted by the production password-verifier adapter.
pub const ARGON2ID_ALGORITHM: &str = "argon2id";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PasswordHashPolicy {
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
    pub max_memory_kib: u32,
    pub max_iterations: u32,
}

impl Default for PasswordHashPolicy {
    fn default() -> Self {
        Self {
            memory_kib: 65_536,
            iterations: 3,
            parallelism: 1,
            max_memory_kib: 262_144,
            max_iterations: 10,
        }
    }
}

impl PasswordHashPolicy {
    pub fn accepts(
        &self,
        algorithm: &str,
        memory_kib: u32,
        iterations: u32,
        parallelism: u32,
    ) -> bool {
        algorithm == ARGON2ID_ALGORITHM
            && memory_kib >= self.memory_kib
            && memory_kib <= self.max_memory_kib
            && iterations >= self.iterations
            && iterations <= self.max_iterations
            && parallelism == self.parallelism
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn policy_rejects_wrong_algorithm_weak_or_unbounded_hashes() {
        let policy = PasswordHashPolicy::default();
        assert!(policy.accepts("argon2id", 65_536, 3, 1));
        assert!(!policy.accepts("argon2i", 65_536, 3, 1));
        assert!(!policy.accepts("argon2id", 19_456, 3, 1));
        assert!(!policy.accepts("argon2id", 65_536, 11, 1));
    }
}
