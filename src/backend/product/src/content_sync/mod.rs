//! Single-flight synchronization state shared by startup and manual sync entry points.
//!
//! The coordinator owns no GitHub transport and no SQLite calls. Callers build and validate a
//! complete [`ContentSnapshot`] first, then apply it to Data through the future typed operation.
//! A failed run never replaces the last successful commit.

use std::sync::Mutex;

use crate::content_contract::{ContentSnapshot, validate_snapshot};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncStatus {
    Idle,
    Running {
        commit: String,
    },
    Succeeded {
        commit: String,
        article_count: usize,
    },
    Failed {
        commit: String,
        message: String,
        last_success_commit: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncSnapshot {
    pub commit: String,
    pub snapshot: ContentSnapshot,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncError {
    Busy { commit: String },
    Invalid(String),
    Apply(String),
}

#[derive(Debug)]
pub struct SyncCoordinator {
    status: Mutex<SyncStatus>,
    last_success_commit: Mutex<Option<String>>,
}

impl Default for SyncCoordinator {
    fn default() -> Self {
        Self {
            status: Mutex::new(SyncStatus::Idle),
            last_success_commit: Mutex::new(None),
        }
    }
}

impl SyncCoordinator {
    pub fn status(&self) -> SyncStatus {
        self.status
            .lock()
            .expect("sync status lock poisoned")
            .clone()
    }

    /// Validate and atomically publish one complete snapshot through the caller's Data apply.
    pub fn run<F>(&self, input: SyncSnapshot, apply: F) -> Result<SyncStatus, SyncError>
    where
        F: FnOnce(&ContentSnapshot) -> Result<(), String>,
    {
        {
            let mut status = self.status.lock().expect("sync status lock poisoned");
            if let SyncStatus::Running { commit } = &*status {
                return Err(SyncError::Busy {
                    commit: commit.clone(),
                });
            }
            *status = SyncStatus::Running {
                commit: input.commit.clone(),
            };
        }

        if let Err(error) = validate_snapshot(&input.snapshot) {
            return self.fail(input.commit, SyncError::Invalid(error.to_string()));
        }
        if let Err(error) = apply(&input.snapshot) {
            return self.fail(input.commit, SyncError::Apply(error));
        }
        let next = SyncStatus::Succeeded {
            commit: input.commit,
            article_count: input.snapshot.articles.len(),
        };
        *self
            .last_success_commit
            .lock()
            .expect("sync success lock poisoned") = match &next {
            SyncStatus::Succeeded { commit, .. } => Some(commit.clone()),
            _ => None,
        };
        *self.status.lock().expect("sync status lock poisoned") = next.clone();
        Ok(next)
    }

    fn fail(&self, commit: String, error: SyncError) -> Result<SyncStatus, SyncError> {
        let last_success_commit = self
            .last_success_commit
            .lock()
            .expect("sync success lock poisoned")
            .clone();
        let message = match &error {
            SyncError::Invalid(message) | SyncError::Apply(message) => message.clone(),
            SyncError::Busy { .. } => "sync is already running".to_owned(),
        };
        *self.status.lock().expect("sync status lock poisoned") = SyncStatus::Failed {
            commit,
            message,
            last_success_commit,
        };
        Err(error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content_contract::{TaxonomyFile, TaxonomyTerm, TaxonomyType};

    fn empty_snapshot() -> ContentSnapshot {
        ContentSnapshot {
            taxonomy: TaxonomyFile {
                article_types: vec![TaxonomyType {
                    id: 1,
                    name: "Rust".to_owned(),
                    created_at: "2026-01-01T00:00:00Z".to_owned(),
                    updated_at: "2026-01-01T00:00:00Z".to_owned(),
                }],
                terms: Vec::<TaxonomyTerm>::new(),
            },
            articles: Vec::new(),
        }
    }

    #[test]
    fn failed_apply_keeps_the_last_successful_commit() {
        let coordinator = SyncCoordinator::default();
        let first = coordinator
            .run(
                SyncSnapshot {
                    commit: "main-1".to_owned(),
                    snapshot: empty_snapshot(),
                },
                |_| Ok(()),
            )
            .unwrap();
        assert!(matches!(first, SyncStatus::Succeeded { .. }));
        let failed = coordinator.run(
            SyncSnapshot {
                commit: "main-2".to_owned(),
                snapshot: empty_snapshot(),
            },
            |_| Err("transaction rolled back".to_owned()),
        );
        assert!(matches!(failed, Err(SyncError::Apply(_))));
        assert_eq!(
            coordinator.status(),
            SyncStatus::Failed {
                commit: "main-2".to_owned(),
                message: "transaction rolled back".to_owned(),
                last_success_commit: Some("main-1".to_owned()),
            }
        );
    }

    #[test]
    fn invalid_snapshot_is_rejected_before_apply() {
        let coordinator = SyncCoordinator::default();
        let mut snapshot = empty_snapshot();
        snapshot.taxonomy.article_types[0].name.clear();
        let mut applied = false;
        let result = coordinator.run(
            SyncSnapshot {
                commit: "main-invalid".to_owned(),
                snapshot,
            },
            |_| {
                applied = true;
                Ok(())
            },
        );
        assert!(matches!(result, Err(SyncError::Invalid(_))));
        assert!(!applied);
    }

    #[test]
    fn a_second_sync_is_rejected_while_apply_is_running() {
        let coordinator = SyncCoordinator::default();
        let input = SyncSnapshot {
            commit: "main-1".to_owned(),
            snapshot: empty_snapshot(),
        };
        coordinator
            .run(input.clone(), |_| {
                let second =
                    coordinator.run(input.clone(), |_| panic!("second apply must not run"));
                assert_eq!(
                    second,
                    Err(SyncError::Busy {
                        commit: "main-1".to_owned()
                    })
                );
                Ok(())
            })
            .unwrap();
    }
}
