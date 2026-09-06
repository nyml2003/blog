//! Content remote boundary.
//!
//! Product owns the workflow state, while this module owns the remote side effect. The
//! production GitHub transport will implement [`ContentRemote`]; tests use [`MockGithub`]
//! explicitly and never switch sources because a token happens to be present.

use std::fmt;

use crate::content_contract::ContentSnapshot;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteBatch {
    pub branch: String,
    pub pull_request: u64,
    pub commit: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteSubmission {
    pub batch: RemoteBatch,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteError {
    message: String,
}

impl RemoteError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for RemoteError {
    fn fmt(&self, output: &mut fmt::Formatter<'_>) -> fmt::Result {
        output.write_str(&self.message)
    }
}

impl std::error::Error for RemoteError {}

/// Explicit remote side-effect boundary. There is intentionally no merge method.
pub trait ContentRemote {
    fn submit_batch(
        &mut self,
        snapshot: &ContentSnapshot,
        existing: Option<&RemoteBatch>,
    ) -> Result<RemoteSubmission, RemoteError>;

    fn close_batch(&mut self, batch: &RemoteBatch) -> Result<(), RemoteError>;
}

/// Deterministic isolated remote used by Product tests and local development.
#[derive(Debug, Default)]
pub struct MockGithub {
    next_pull_request: u64,
    next_commit: u64,
    submissions: Vec<ContentSnapshot>,
    close_calls: usize,
}

impl MockGithub {
    pub fn submissions(&self) -> &[ContentSnapshot] {
        &self.submissions
    }

    pub fn close_calls(&self) -> usize {
        self.close_calls
    }
}

impl ContentRemote for MockGithub {
    fn submit_batch(
        &mut self,
        snapshot: &ContentSnapshot,
        existing: Option<&RemoteBatch>,
    ) -> Result<RemoteSubmission, RemoteError> {
        self.next_commit += 1;
        let batch = match existing {
            Some(existing) => RemoteBatch {
                branch: existing.branch.clone(),
                pull_request: existing.pull_request,
                commit: format!("mock-commit-{}", self.next_commit),
            },
            None => {
                self.next_pull_request += 1;
                RemoteBatch {
                    branch: format!("content/batch-{}", self.next_pull_request),
                    pull_request: self.next_pull_request,
                    commit: format!("mock-commit-{}", self.next_commit),
                }
            }
        };
        self.submissions.push(snapshot.clone());
        Ok(RemoteSubmission { batch })
    }

    fn close_batch(&mut self, _batch: &RemoteBatch) -> Result<(), RemoteError> {
        self.close_calls += 1;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_updates_the_same_batch_without_a_merge_api() {
        let mut remote = MockGithub::default();
        let snapshot = ContentSnapshot {
            taxonomy: crate::content_contract::TaxonomyFile {
                article_types: Vec::new(),
                terms: Vec::new(),
            },
            articles: Vec::new(),
        };
        let first = remote.submit_batch(&snapshot, None).unwrap().batch;
        let second = remote.submit_batch(&snapshot, Some(&first)).unwrap().batch;
        assert_eq!(first.branch, second.branch);
        assert_eq!(first.pull_request, second.pull_request);
        assert_ne!(first.commit, second.commit);
        assert_eq!(remote.submissions().len(), 2);
        assert_eq!(remote.close_calls(), 0);
    }
}
