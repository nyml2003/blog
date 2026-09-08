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

impl std::fmt::Display for SyncError {
    fn fmt(&self, output: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Busy { commit } => write!(output, "sync is already running for {commit}"),
            Self::Invalid(message) => write!(output, "invalid sync snapshot: {message}"),
            Self::Apply(message) => write!(output, "sync apply failed: {message}"),
        }
    }
}

impl std::error::Error for SyncError {}

#[derive(Debug)]
pub struct SyncCoordinator {
    status: Mutex<SyncStatus>,
    last_success_commit: Mutex<Option<String>>,
    last_success_article_count: Mutex<usize>,
}

impl Default for SyncCoordinator {
    fn default() -> Self {
        Self {
            status: Mutex::new(SyncStatus::Idle),
            last_success_commit: Mutex::new(None),
            last_success_article_count: Mutex::new(0),
        }
    }
}

impl SyncCoordinator {
    pub fn from_persisted(value: &protocol::ContentSyncState) -> Self {
        let status = match (
            &value.target_commit,
            &value.last_error,
            &value.successful_commit,
        ) {
            (Some(commit), Some(message), last) => SyncStatus::Failed {
                commit: commit.clone(),
                message: message.clone(),
                last_success_commit: last.clone(),
            },
            (_, _, Some(commit)) => SyncStatus::Succeeded {
                commit: commit.clone(),
                article_count: usize::try_from(value.article_count).unwrap_or(usize::MAX),
            },
            _ => SyncStatus::Idle,
        };
        Self {
            status: Mutex::new(status),
            last_success_commit: Mutex::new(value.successful_commit.clone()),
            last_success_article_count: Mutex::new(
                usize::try_from(value.article_count).unwrap_or(usize::MAX),
            ),
        }
    }

    pub fn persisted(&self) -> protocol::ContentSyncState {
        match self.status() {
            SyncStatus::Idle => protocol::ContentSyncState::default(),
            SyncStatus::Running { commit } => protocol::ContentSyncState {
                target_commit: Some(commit),
                successful_commit: self
                    .last_success_commit
                    .lock()
                    .expect("sync success lock poisoned")
                    .clone(),
                article_count: u64::try_from(
                    *self
                        .last_success_article_count
                        .lock()
                        .expect("sync article count lock poisoned"),
                )
                .unwrap_or(u64::MAX),
                last_error: None,
            },
            SyncStatus::Succeeded {
                commit,
                article_count,
            } => protocol::ContentSyncState {
                target_commit: Some(commit.clone()),
                successful_commit: Some(commit),
                article_count: u64::try_from(article_count).unwrap_or(u64::MAX),
                last_error: None,
            },
            SyncStatus::Failed {
                commit,
                message,
                last_success_commit,
            } => protocol::ContentSyncState {
                target_commit: Some(commit),
                successful_commit: last_success_commit,
                article_count: u64::try_from(
                    *self
                        .last_success_article_count
                        .lock()
                        .expect("sync article count lock poisoned"),
                )
                .unwrap_or(u64::MAX),
                last_error: Some(message),
            },
        }
    }

    pub fn fail_remote(&self, message: String) {
        self.fail_target("unknown".to_owned(), message);
    }

    pub fn fail_target(&self, commit: String, message: String) {
        let last = self
            .last_success_commit
            .lock()
            .expect("sync success lock poisoned")
            .clone();
        *self.status.lock().expect("sync status lock poisoned") = SyncStatus::Failed {
            commit,
            message,
            last_success_commit: last,
        };
    }

    pub fn status(&self) -> SyncStatus {
        self.status
            .lock()
            .expect("sync status lock poisoned")
            .clone()
    }

    /// Validate and atomically publish one complete snapshot through the caller's Data apply.
    pub async fn run<F, Fut>(&self, input: SyncSnapshot, apply: F) -> Result<SyncStatus, SyncError>
    where
        F: FnOnce(&ContentSnapshot) -> Fut,
        Fut: std::future::Future<Output = Result<(), String>>,
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
        if let Err(error) = apply(&input.snapshot).await {
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
        *self
            .last_success_article_count
            .lock()
            .expect("sync article count lock poisoned") = input.snapshot.articles.len();
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
    use crate::content_contract::{TaxonomyCategory, TaxonomyFile};

    fn empty_snapshot() -> ContentSnapshot {
        ContentSnapshot {
            taxonomy: TaxonomyFile {
                version: 1,
                next_category_id: 2,
                next_tag_id: 1,
                categories: vec![TaxonomyCategory {
                    id: 1,
                    name: "Rust".to_owned(),
                    parent_id: None,
                    position: 10,
                }],
                tags: Vec::new(),
            },
            articles: Vec::new(),
        }
    }

    #[tokio::test]
    async fn failed_apply_keeps_the_last_successful_commit() {
        let coordinator = SyncCoordinator::default();
        let first = coordinator
            .run(
                SyncSnapshot {
                    commit: "main-1".to_owned(),
                    snapshot: empty_snapshot(),
                },
                |_| async { Ok(()) },
            )
            .await
            .unwrap();
        assert!(matches!(first, SyncStatus::Succeeded { .. }));
        let failed = coordinator
            .run(
                SyncSnapshot {
                    commit: "main-2".to_owned(),
                    snapshot: empty_snapshot(),
                },
                |_| async { Err("transaction rolled back".to_owned()) },
            )
            .await;
        assert!(matches!(failed, Err(SyncError::Apply(_))));
        assert_eq!(
            coordinator.status(),
            SyncStatus::Failed {
                commit: "main-2".to_owned(),
                message: "transaction rolled back".to_owned(),
                last_success_commit: Some("main-1".to_owned()),
            }
        );
        assert_eq!(coordinator.persisted().article_count, 0);
    }

    #[test]
    fn failed_status_round_trip_preserves_last_successful_count() {
        let persisted = protocol::ContentSyncState {
            target_commit: Some("main-2".into()),
            successful_commit: Some("main-1".into()),
            article_count: 17,
            last_error: Some("remote unavailable".into()),
        };
        let coordinator = SyncCoordinator::from_persisted(&persisted);
        assert_eq!(coordinator.persisted(), persisted);
    }

    #[tokio::test]
    async fn invalid_snapshot_is_rejected_before_apply() {
        let coordinator = SyncCoordinator::default();
        let mut snapshot = empty_snapshot();
        snapshot.taxonomy.categories[0].name.clear();
        let mut applied = false;
        let result = coordinator
            .run(
                SyncSnapshot {
                    commit: "main-invalid".to_owned(),
                    snapshot,
                },
                |_| async {
                    applied = true;
                    Ok(())
                },
            )
            .await;
        assert!(matches!(result, Err(SyncError::Invalid(_))));
        assert!(!applied);
    }

    #[tokio::test]
    async fn a_second_sync_is_rejected_while_apply_is_running() {
        let coordinator = SyncCoordinator::default();
        let input = SyncSnapshot {
            commit: "main-1".to_owned(),
            snapshot: empty_snapshot(),
        };
        coordinator
            .run(input.clone(), |_| async {
                let second = coordinator
                    .run(input.clone(), |_| async {
                        panic!("second apply must not run")
                    })
                    .await;
                assert_eq!(
                    second,
                    Err(SyncError::Busy {
                        commit: "main-1".to_owned()
                    })
                );
                Ok(())
            })
            .await
            .unwrap();
    }
}
