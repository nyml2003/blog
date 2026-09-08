//! Server-local content workspace for the GitHub batch workflow.
//!
//! The workspace is deliberately independent from the public Data cache. A save changes only
//! this state; public visibility changes only after a remote `main` snapshot is synchronized.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::sync::{Mutex, MutexGuard};

use crate::content_contract::{
    ArticleMeta, ContentArticle, ContentSnapshot, TaxonomyFile, validate_publishable_snapshot,
    validate_snapshot,
};
use crate::github::{
    ContentRemote, RemoteBatch, RemoteBatchState, RemoteSubmitIntent, managed_branch,
    snapshot_digest,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkspaceStatus {
    Clean,
    Saved,
    Submitting,
    Discarding,
    Submitted,
    SubmittedWithChanges,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceView {
    pub version: u64,
    pub committed_version: Option<u64>,
    pub status: WorkspaceStatus,
    pub remote_batch: Option<RemoteBatch>,
    pub last_error: Option<String>,
    pub snapshot: ContentSnapshot,
}

#[derive(Debug, Clone)]
pub struct SubmitOperation {
    pub snapshot: ContentSnapshot,
    pub existing: Option<RemoteBatch>,
    pub intent: RemoteSubmitIntent,
}

#[derive(Debug, Clone)]
pub struct DiscardOperation {
    pub batch: Option<RemoteBatch>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArticleDraft {
    pub id: Option<i64>,
    pub title: String,
    pub summary: String,
    pub category_ids: Vec<i64>,
    pub tag_ids: Vec<i64>,
    pub content_html: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkspaceError {
    Invalid(String),
    InvalidArticleHtml(article_html_core::Inspection),
    VersionConflict { expected: u64, actual: u64 },
    Busy,
    NoChanges,
    ArticleNotFound(i64),
    Remote(String),
}

impl fmt::Display for WorkspaceError {
    fn fmt(&self, output: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Invalid(message) => write!(output, "invalid workspace content: {message}"),
            Self::InvalidArticleHtml(_) => {
                output.write_str("article HTML failed article-html/v1 validation")
            }
            Self::VersionConflict { expected, actual } => {
                write!(
                    output,
                    "workspace version conflict: expected {expected}, actual {actual}"
                )
            }
            Self::Busy => output.write_str("workspace is busy submitting a batch"),
            Self::NoChanges => output.write_str("workspace has no unsubmitted changes"),
            Self::ArticleNotFound(id) => write!(output, "article {id} is not in the workspace"),
            Self::Remote(message) => write!(output, "remote operation failed: {message}"),
        }
    }
}

impl std::error::Error for WorkspaceError {}

#[derive(Debug, Clone, PartialEq, Eq)]
struct WorkspaceState {
    version: u64,
    committed_version: Option<u64>,
    status: WorkspaceStatus,
    snapshot: ContentSnapshot,
    committed_snapshot: ContentSnapshot,
    batch_base_snapshot: ContentSnapshot,
    remote_batch: Option<RemoteBatch>,
    last_error: Option<String>,
    known_article_ids: BTreeSet<i64>,
    source_commit: Option<String>,
    pending_remote_operation: Option<protocol::ContentRemoteOperation>,
}

pub struct ContentWorkspace<R> {
    state: Mutex<WorkspaceState>,
    remote: Mutex<R>,
}

impl<R: ContentRemote> ContentWorkspace<R> {
    pub fn new(remote: R) -> Self {
        let snapshot = empty_snapshot();
        Self {
            state: Mutex::new(WorkspaceState {
                version: 0,
                committed_version: None,
                status: WorkspaceStatus::Clean,
                snapshot: snapshot.clone(),
                committed_snapshot: snapshot.clone(),
                batch_base_snapshot: snapshot,
                remote_batch: None,
                last_error: None,
                known_article_ids: BTreeSet::new(),
                source_commit: Some("fixture-main".to_owned()),
                pending_remote_operation: None,
            }),
            remote: Mutex::new(remote),
        }
    }

    pub fn from_snapshot(remote: R, snapshot: ContentSnapshot) -> Result<Self, WorkspaceError> {
        Self::from_snapshot_at(remote, snapshot, Some("fixture-main".to_owned()))
    }

    pub fn from_snapshot_at(
        remote: R,
        snapshot: ContentSnapshot,
        source_commit: Option<String>,
    ) -> Result<Self, WorkspaceError> {
        validate_snapshot(&snapshot).map_err(|error| WorkspaceError::Invalid(error.to_string()))?;
        let known_article_ids = snapshot
            .articles
            .iter()
            .map(|article| article.meta.id)
            .collect();
        Ok(Self {
            state: Mutex::new(WorkspaceState {
                version: 0,
                committed_version: None,
                status: WorkspaceStatus::Clean,
                snapshot: snapshot.clone(),
                committed_snapshot: snapshot.clone(),
                batch_base_snapshot: snapshot,
                remote_batch: None,
                last_error: None,
                known_article_ids,
                source_commit,
                pending_remote_operation: None,
            }),
            remote: Mutex::new(remote),
        })
    }

    pub fn from_persisted(
        remote: R,
        value: &protocol::ContentWorkflowState,
    ) -> Result<Self, WorkspaceError> {
        validate_persisted(value)?;
        let status = status_from_protocol(value.status);
        Ok(Self {
            state: Mutex::new(WorkspaceState {
                version: value.workspace_version,
                committed_version: value.committed_version,
                status,
                snapshot: value.snapshot.clone(),
                committed_snapshot: value.committed_snapshot.clone(),
                batch_base_snapshot: value.batch_base_snapshot.clone(),
                remote_batch: value.remote_batch.clone().map(remote_from_protocol),
                last_error: value.last_error.clone(),
                known_article_ids: value.known_article_ids.iter().copied().collect(),
                source_commit: value.source_commit.clone(),
                pending_remote_operation: value.pending_remote_operation.clone(),
            }),
            remote: Mutex::new(remote),
        })
    }

    pub fn persisted_state(
        &self,
        pending_taxonomy_review: Option<protocol::PendingTaxonomyReview>,
        sync: protocol::ContentSyncState,
    ) -> protocol::ContentWorkflowState {
        let state = self.state();
        protocol::ContentWorkflowState {
            workspace_version: state.version,
            committed_version: state.committed_version,
            status: status_to_protocol(state.status),
            snapshot: state.snapshot.clone(),
            committed_snapshot: state.committed_snapshot.clone(),
            batch_base_snapshot: state.batch_base_snapshot.clone(),
            remote_batch: state.remote_batch.clone().map(remote_to_protocol),
            last_error: state.last_error.clone(),
            known_article_ids: state.known_article_ids.iter().copied().collect(),
            pending_taxonomy_review,
            source_commit: state.source_commit.clone(),
            pending_remote_operation: state.pending_remote_operation.clone(),
            sync,
        }
    }

    pub fn restore_persisted(
        &self,
        value: &protocol::ContentWorkflowState,
    ) -> Result<(), WorkspaceError> {
        validate_persisted(value)?;
        let mut state = self.state();
        state.version = value.workspace_version;
        state.committed_version = value.committed_version;
        state.status = status_from_protocol(value.status);
        state.snapshot = value.snapshot.clone();
        state.committed_snapshot = value.committed_snapshot.clone();
        state.batch_base_snapshot = value.batch_base_snapshot.clone();
        state.remote_batch = value.remote_batch.clone().map(remote_from_protocol);
        state.last_error = value.last_error.clone();
        state.known_article_ids = value.known_article_ids.iter().copied().collect();
        state.source_commit = value.source_commit.clone();
        state.pending_remote_operation = value.pending_remote_operation.clone();
        Ok(())
    }

    pub fn view(&self) -> WorkspaceView {
        let state = self.state();
        WorkspaceView {
            version: state.version,
            committed_version: state.committed_version,
            status: state.status,
            remote_batch: state.remote_batch.clone(),
            last_error: state.last_error.clone(),
            snapshot: state.snapshot.clone(),
        }
    }

    pub fn read_remote_main(&self) -> Result<crate::github::RemoteMainSnapshot, WorkspaceError> {
        self.remote
            .lock()
            .map_err(|_| WorkspaceError::Remote("remote lock poisoned".to_owned()))?
            .read_main_snapshot()
            .map_err(|error| WorkspaceError::Remote(error.to_string()))
    }

    pub fn save_article(
        &self,
        expected_version: u64,
        draft: ArticleDraft,
    ) -> Result<WorkspaceView, WorkspaceError> {
        let inspection = article_html_core::inspect(&draft.content_html);
        if !inspection.valid {
            return Err(WorkspaceError::InvalidArticleHtml(inspection));
        }
        let mut state = self.state();
        self.check_version(&state, expected_version)?;
        self.check_writable(&state)?;
        let next_version = next_workspace_version(state.version)?;
        let previous = match draft.id {
            Some(id) => Some(
                state
                    .snapshot
                    .articles
                    .iter()
                    .find(|article| article.meta.id == id)
                    .ok_or(WorkspaceError::ArticleNotFound(id))?,
            ),
            None => None,
        };
        let id = match draft.id {
            Some(id) => id,
            None => next_article_id(&state.known_article_ids)?,
        };
        let stamp = protocol::clock::now_utc_rfc3339();
        if id <= 0 {
            return Err(WorkspaceError::Invalid(
                "article id must be positive".to_owned(),
            ));
        }
        let article = ContentArticle {
            meta: ArticleMeta {
                id,
                title: draft.title,
                summary: draft.summary,
                category_ids: draft.category_ids,
                tag_ids: draft.tag_ids,
                created_at: previous
                    .map(|article| article.meta.created_at.clone())
                    .unwrap_or_else(|| stamp.clone()),
                updated_at: stamp,
                published_at: previous.and_then(|article| article.meta.published_at.clone()),
            },
            content_html: draft.content_html,
        };
        let mut next = state.snapshot.clone();
        next.articles.retain(|item| item.meta.id != id);
        next.articles.push(article);
        next.articles.sort_by_key(|item| item.meta.id);
        validate_snapshot(&next).map_err(|error| WorkspaceError::Invalid(error.to_string()))?;
        state.snapshot = next;
        state.known_article_ids.insert(id);
        self.mark_saved(&mut state, next_version);
        Ok(view_from(&state))
    }

    pub fn replace_taxonomy(
        &self,
        expected_version: u64,
        taxonomy: TaxonomyFile,
    ) -> Result<WorkspaceView, WorkspaceError> {
        let mut state = self.state();
        self.check_version(&state, expected_version)?;
        self.check_writable(&state)?;
        let next_version = next_workspace_version(state.version)?;
        let mut next = state.snapshot.clone();
        next.taxonomy = taxonomy;
        validate_taxonomy_transition(&state.snapshot, &next, false)?;
        validate_snapshot(&next).map_err(|error| WorkspaceError::Invalid(error.to_string()))?;
        state.snapshot = next;
        self.mark_saved(&mut state, next_version);
        Ok(view_from(&state))
    }

    /// Atomically replace taxonomy and all affected article metadata after model review.
    pub fn apply_reviewed_snapshot(
        &self,
        expected_version: u64,
        snapshot: ContentSnapshot,
    ) -> Result<WorkspaceView, WorkspaceError> {
        let mut state = self.state();
        self.check_version(&state, expected_version)?;
        self.check_writable(&state)?;
        let next_version = next_workspace_version(state.version)?;
        validate_taxonomy_transition(&state.snapshot, &snapshot, true)?;
        validate_snapshot(&snapshot).map_err(|error| WorkspaceError::Invalid(error.to_string()))?;
        state
            .known_article_ids
            .extend(snapshot.articles.iter().map(|article| article.meta.id));
        state.snapshot = snapshot;
        self.mark_saved(&mut state, next_version);
        Ok(view_from(&state))
    }

    pub fn remove_article(
        &self,
        expected_version: u64,
        id: i64,
    ) -> Result<WorkspaceView, WorkspaceError> {
        let mut state = self.state();
        self.check_version(&state, expected_version)?;
        self.check_writable(&state)?;
        let next_version = next_workspace_version(state.version)?;
        let before = state.snapshot.articles.len();
        state.snapshot.articles.retain(|item| item.meta.id != id);
        if state.snapshot.articles.len() == before {
            return Err(WorkspaceError::ArticleNotFound(id));
        }
        validate_snapshot(&state.snapshot)
            .map_err(|error| WorkspaceError::Invalid(error.to_string()))?;
        state.known_article_ids.insert(id);
        self.mark_saved(&mut state, next_version);
        Ok(view_from(&state))
    }

    /// Phase 1: freeze and persist a deterministic remote intent before any GitHub call.
    pub fn begin_submit(&self, expected_version: u64) -> Result<SubmitOperation, WorkspaceError> {
        let mut state = self.state();
        self.check_version(&state, expected_version)?;
        if state
            .pending_remote_operation
            .as_ref()
            .is_some_and(|operation| operation.kind == protocol::ContentRemoteOperationKind::Submit)
        {
            state.status = WorkspaceStatus::Submitting;
            state.last_error = None;
            return self.submit_operation_from_state(&state);
        }
        if state.pending_remote_operation.is_some() || state.status == WorkspaceStatus::Submitting {
            return Err(WorkspaceError::Busy);
        }
        self.check_writable(&state)?;
        if state.snapshot == state.committed_snapshot {
            return Err(WorkspaceError::NoChanges);
        }
        validate_publishable_snapshot(&state.snapshot)
            .map_err(|error| WorkspaceError::Invalid(error.to_string()))?;
        let digest = snapshot_digest(&state.snapshot)
            .map_err(|error| WorkspaceError::Invalid(error.to_string()))?;
        let base_commit = state
            .remote_batch
            .as_ref()
            .map(|batch| batch.base_commit.clone())
            .or_else(|| state.source_commit.clone())
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                WorkspaceError::Invalid("workspace has no synchronized base commit".to_owned())
            })?;
        let branch = state
            .remote_batch
            .as_ref()
            .map(|batch| batch.branch.clone())
            .unwrap_or_else(|| managed_branch(state.version, &digest));
        if state.remote_batch.is_none() {
            state.batch_base_snapshot = state.committed_snapshot.clone();
        }
        state.status = WorkspaceStatus::Submitting;
        state.last_error = None;
        state.pending_remote_operation = Some(protocol::ContentRemoteOperation {
            kind: protocol::ContentRemoteOperationKind::Submit,
            workspace_version: state.version,
            branch,
            base_commit,
            target_digest: digest,
        });
        self.submit_operation_from_state(&state)
    }

    fn submit_operation_from_state(
        &self,
        state: &WorkspaceState,
    ) -> Result<SubmitOperation, WorkspaceError> {
        let pending = state.pending_remote_operation.as_ref().ok_or_else(|| {
            WorkspaceError::Invalid("submitting workspace is missing its durable intent".to_owned())
        })?;
        if pending.kind != protocol::ContentRemoteOperationKind::Submit
            || pending.workspace_version != state.version
        {
            return Err(WorkspaceError::Invalid(
                "persisted submit intent does not match the workspace".to_owned(),
            ));
        }
        Ok(SubmitOperation {
            snapshot: state.snapshot.clone(),
            existing: state.remote_batch.clone(),
            intent: RemoteSubmitIntent {
                branch: pending.branch.clone(),
                base_commit: pending.base_commit.clone(),
                target_digest: pending.target_digest.clone(),
            },
        })
    }

    pub fn execute_submit(
        &self,
        operation: &SubmitOperation,
    ) -> Result<crate::github::RemoteSubmission, WorkspaceError> {
        self.remote
            .lock()
            .map_err(|_| WorkspaceError::Remote("remote lock poisoned".to_owned()))?
            .submit_batch(
                &operation.snapshot,
                operation.existing.as_ref(),
                &operation.intent,
            )
            .map_err(|error| WorkspaceError::Remote(error.to_string()))
    }

    pub fn complete_submit(
        &self,
        submission: crate::github::RemoteSubmission,
    ) -> Result<WorkspaceView, WorkspaceError> {
        let mut state = self.state();
        if state.status != WorkspaceStatus::Submitting || state.pending_remote_operation.is_none() {
            return Err(WorkspaceError::Invalid(
                "workspace is not awaiting a remote submit result".to_owned(),
            ));
        }
        state.remote_batch = Some(submission.batch);
        state.committed_version = Some(state.version);
        state.committed_snapshot = state.snapshot.clone();
        state.status = WorkspaceStatus::Submitted;
        state.pending_remote_operation = None;
        state.last_error = None;
        Ok(view_from(&state))
    }

    pub fn begin_discard(&self, expected_version: u64) -> Result<DiscardOperation, WorkspaceError> {
        let mut state = self.state();
        self.check_version(&state, expected_version)?;
        if state
            .pending_remote_operation
            .as_ref()
            .is_some_and(|operation| {
                operation.kind == protocol::ContentRemoteOperationKind::Discard
            })
        {
            state.status = WorkspaceStatus::Discarding;
            state.last_error = None;
            return Ok(DiscardOperation {
                batch: state.remote_batch.clone(),
            });
        }
        if state.pending_remote_operation.is_some() {
            return Err(WorkspaceError::Busy);
        }
        if state.status == WorkspaceStatus::Discarding {
            if state.remote_batch.is_some() {
                return Err(WorkspaceError::Invalid(
                    "discarding a remote batch requires a durable discard intent".to_owned(),
                ));
            }
            return Ok(DiscardOperation { batch: None });
        }
        self.check_writable(&state)?;
        state.status = WorkspaceStatus::Discarding;
        state.last_error = None;
        state.pending_remote_operation =
            state
                .remote_batch
                .as_ref()
                .map(|batch| protocol::ContentRemoteOperation {
                    kind: protocol::ContentRemoteOperationKind::Discard,
                    workspace_version: state.version,
                    branch: batch.branch.clone(),
                    base_commit: batch.base_commit.clone(),
                    target_digest: String::new(),
                });
        Ok(DiscardOperation {
            batch: state.remote_batch.clone(),
        })
    }

    pub fn execute_discard(&self, operation: &DiscardOperation) -> Result<(), WorkspaceError> {
        if let Some(batch) = operation.batch.as_ref() {
            self.remote
                .lock()
                .map_err(|_| WorkspaceError::Remote("remote lock poisoned".to_owned()))?
                .close_batch(batch)
                .map_err(|error| WorkspaceError::Remote(error.to_string()))?;
        }
        Ok(())
    }

    pub fn complete_discard(&self) -> Result<WorkspaceView, WorkspaceError> {
        let mut state = self.state();
        if state.status != WorkspaceStatus::Discarding {
            return Err(WorkspaceError::Invalid(
                "workspace is not awaiting a remote discard result".to_owned(),
            ));
        }
        let mut next = state.clone();
        next.version = next_workspace_version(state.version)?;
        next.snapshot = next.batch_base_snapshot.clone();
        next.remote_batch = None;
        next.committed_version = None;
        next.committed_snapshot = next.snapshot.clone();
        next.batch_base_snapshot = next.snapshot.clone();
        next.status = WorkspaceStatus::Clean;
        next.pending_remote_operation = None;
        next.last_error = None;
        *state = next;
        Ok(view_from(&state))
    }

    pub fn fail_remote_operation(&self, message: String) {
        let mut state = self.state();
        state.status = WorkspaceStatus::Failed;
        state.last_error = Some(message);
        // Keep the durable operation: retry/restart must inspect the same branch and PR.
    }

    pub fn batch_state(&self) -> Result<Option<RemoteBatchState>, WorkspaceError> {
        let batch = self.state().remote_batch.clone();
        batch
            .map(|batch| {
                self.remote
                    .lock()
                    .map_err(|_| WorkspaceError::Remote("remote lock poisoned".to_owned()))?
                    .batch_state(&batch)
                    .map_err(|e| WorkspaceError::Remote(e.to_string()))
            })
            .transpose()
    }

    pub fn validate_sync_target(
        &self,
        commit: &str,
        published: &ContentSnapshot,
        batch_state: Option<RemoteBatchState>,
    ) -> Result<(), WorkspaceError> {
        let state = self.state();
        if let Some(batch) = &state.remote_batch {
            match batch_state {
                Some(RemoteBatchState::Merged) if commit != batch.base_commit => {}
                Some(RemoteBatchState::Merged) => {
                    return Err(WorkspaceError::Remote(
                        "merged pull request is not yet visible from main".to_owned(),
                    ));
                }
                Some(RemoteBatchState::Open) if commit == batch.base_commit => {}
                Some(RemoteBatchState::Open) => {
                    return Err(WorkspaceError::Remote(
                        "main changed while a managed pull request is still open".to_owned(),
                    ));
                }
                Some(RemoteBatchState::Closed) => {
                    return Err(WorkspaceError::Remote(
                        "managed pull request was closed outside the workflow".to_owned(),
                    ));
                }
                None => {
                    return Err(WorkspaceError::Remote(
                        "active batch state is unknown".to_owned(),
                    ));
                }
            }
        }
        let has_local_changes = state.snapshot != state.committed_snapshot;
        if state.remote_batch.is_none() && has_local_changes
            || state.remote_batch.is_some()
                && batch_state == Some(RemoteBatchState::Merged)
                && has_local_changes
        {
            let base = if state.remote_batch.is_some() {
                &state.committed_snapshot
            } else {
                &state.batch_base_snapshot
            };
            rebase_snapshot(base, &state.snapshot, published)?;
        }
        Ok(())
    }

    pub fn complete_sync(
        &self,
        commit: String,
        published: ContentSnapshot,
        batch_state: Option<RemoteBatchState>,
    ) -> Result<(), WorkspaceError> {
        validate_snapshot(&published)
            .map_err(|error| WorkspaceError::Invalid(error.to_string()))?;
        let mut state = self.state();
        let mut next = state.clone();
        let merged = next.remote_batch.is_some() && batch_state == Some(RemoteBatchState::Merged);
        if merged {
            let has_later_changes = next.snapshot != next.committed_snapshot;
            if has_later_changes {
                next.snapshot =
                    rebase_snapshot(&next.committed_snapshot, &next.snapshot, &published)?;
            } else {
                next.snapshot = published.clone();
            }
            next.remote_batch = None;
            next.committed_version = None;
            next.committed_snapshot = published.clone();
            next.batch_base_snapshot = published.clone();
            next.status = if has_later_changes {
                WorkspaceStatus::Saved
            } else {
                WorkspaceStatus::Clean
            };
            next.pending_remote_operation = None;
        } else if next.remote_batch.is_none() {
            let has_local_changes = next.snapshot != next.committed_snapshot;
            next.snapshot = if has_local_changes {
                rebase_snapshot(&next.batch_base_snapshot, &next.snapshot, &published)?
            } else {
                published.clone()
            };
            next.committed_snapshot = published.clone();
            next.batch_base_snapshot = published.clone();
            next.status = if has_local_changes {
                WorkspaceStatus::Saved
            } else {
                WorkspaceStatus::Clean
            };
        }
        next.known_article_ids
            .extend(published.articles.iter().map(|article| article.meta.id));
        next.source_commit = Some(commit);
        next.last_error = None;
        if next != *state {
            next.version = next_workspace_version(state.version)?;
            *state = next;
        }
        Ok(())
    }

    pub fn reconcile_stored_public(
        &self,
        stored: &protocol::StoredContentSnapshot,
    ) -> Result<(), WorkspaceError> {
        let state = self.state();
        let current = state.source_commit.clone();
        if current.as_deref() == Some(stored.commit.as_str()) {
            return Ok(());
        }
        let batch_state = if state.remote_batch.is_some() {
            if !snapshots_equal_ignoring_publication(&state.committed_snapshot, &stored.snapshot) {
                return Err(WorkspaceError::Remote(
                    "stored public snapshot does not prove that the active batch was merged"
                        .to_owned(),
                ));
            }
            Some(RemoteBatchState::Merged)
        } else {
            None
        };
        drop(state);
        self.complete_sync(stored.commit.clone(), stored.snapshot.clone(), batch_state)
    }

    /// Backwards-compatible one-shot helpers used only by pure unit tests.
    pub fn submit(&self, expected_version: u64) -> Result<WorkspaceView, WorkspaceError> {
        let operation = self.begin_submit(expected_version)?;
        match self.execute_submit(&operation) {
            Ok(result) => self.complete_submit(result),
            Err(error) => {
                self.fail_remote_operation(error.to_string());
                Err(error)
            }
        }
    }

    pub fn discard(&self, expected_version: u64) -> Result<WorkspaceView, WorkspaceError> {
        let operation = self.begin_discard(expected_version)?;
        match self.execute_discard(&operation) {
            Ok(()) => self.complete_discard(),
            Err(error) => {
                self.fail_remote_operation(error.to_string());
                Err(error)
            }
        }
    }

    fn check_version(
        &self,
        state: &WorkspaceState,
        expected_version: u64,
    ) -> Result<(), WorkspaceError> {
        if state.version != expected_version {
            return Err(WorkspaceError::VersionConflict {
                expected: expected_version,
                actual: state.version,
            });
        }
        Ok(())
    }

    fn check_writable(&self, state: &WorkspaceState) -> Result<(), WorkspaceError> {
        if state.pending_remote_operation.is_some()
            || matches!(
                state.status,
                WorkspaceStatus::Submitting | WorkspaceStatus::Discarding
            )
        {
            return Err(WorkspaceError::Busy);
        }
        Ok(())
    }

    fn mark_saved(&self, state: &mut WorkspaceState, next_version: u64) {
        state.version = next_version;
        state.status = if state.remote_batch.is_some() {
            WorkspaceStatus::SubmittedWithChanges
        } else {
            WorkspaceStatus::Saved
        };
        state.last_error = None;
    }

    fn state(&self) -> MutexGuard<'_, WorkspaceState> {
        self.state.lock().expect("content workspace lock poisoned")
    }
}

fn validate_taxonomy_transition(
    previous: &ContentSnapshot,
    next: &ContentSnapshot,
    allow_allocations: bool,
) -> Result<(), WorkspaceError> {
    let old = &previous.taxonomy;
    let new = &next.taxonomy;
    if new.next_category_id < old.next_category_id || new.next_tag_id < old.next_tag_id {
        return Err(WorkspaceError::Invalid(
            "taxonomy ID watermarks cannot move backwards".to_owned(),
        ));
    }
    if !allow_allocations
        && (new.next_category_id != old.next_category_id || new.next_tag_id != old.next_tag_id)
    {
        return Err(WorkspaceError::Invalid(
            "taxonomy save cannot allocate IDs; use analyzed changes".to_owned(),
        ));
    }
    let old_categories: BTreeSet<_> = old.categories.iter().map(|value| value.id).collect();
    if new.categories.iter().any(|value| {
        !old_categories.contains(&value.id)
            && (!allow_allocations || value.id < old.next_category_id)
    }) {
        return Err(WorkspaceError::Invalid(
            "taxonomy contains a client-assigned or retired category ID".to_owned(),
        ));
    }
    let old_tags: BTreeSet<_> = old.tags.iter().map(|value| value.id).collect();
    if new.tags.iter().any(|value| {
        !old_tags.contains(&value.id) && (!allow_allocations || value.id < old.next_tag_id)
    }) {
        return Err(WorkspaceError::Invalid(
            "taxonomy contains a client-assigned or retired tag ID".to_owned(),
        ));
    }
    Ok(())
}

fn rebase_snapshot(
    base: &ContentSnapshot,
    local: &ContentSnapshot,
    published: &ContentSnapshot,
) -> Result<ContentSnapshot, WorkspaceError> {
    let taxonomy = if local.taxonomy == base.taxonomy {
        published.taxonomy.clone()
    } else if published.taxonomy == base.taxonomy || local.taxonomy == published.taxonomy {
        local.taxonomy.clone()
    } else {
        return Err(WorkspaceError::Remote(
            "local taxonomy changes conflict with newer main taxonomy".to_owned(),
        ));
    };

    let base_articles = articles_by_id(base);
    let local_articles = articles_by_id(local);
    let published_articles = articles_by_id(published);
    let ids = base_articles
        .keys()
        .chain(local_articles.keys())
        .chain(published_articles.keys())
        .copied()
        .collect::<BTreeSet<_>>();
    let mut articles = Vec::new();
    for id in ids {
        let base_article = base_articles.get(&id).copied();
        let local_article = local_articles.get(&id).copied();
        let published_article = published_articles.get(&id).copied();
        let mut selected = if articles_equal_ignoring_publication(local_article, base_article) {
            published_article.cloned()
        } else if articles_equal_ignoring_publication(published_article, base_article)
            || articles_equal_ignoring_publication(local_article, published_article)
        {
            local_article.cloned()
        } else {
            return Err(WorkspaceError::Remote(format!(
                "local article {id} conflicts with newer main content"
            )));
        };
        if let Some(article) = &mut selected {
            if let Some(remote) = published_article {
                article.meta.published_at = remote.meta.published_at.clone();
            }
            articles.push(article.clone());
        }
    }
    let snapshot = ContentSnapshot { taxonomy, articles };
    validate_snapshot(&snapshot).map_err(|error| {
        WorkspaceError::Remote(format!("rebased workspace is invalid: {error}"))
    })?;
    Ok(snapshot)
}

fn articles_by_id(snapshot: &ContentSnapshot) -> BTreeMap<i64, &ContentArticle> {
    snapshot
        .articles
        .iter()
        .map(|article| (article.meta.id, article))
        .collect()
}

fn articles_equal_ignoring_publication(
    left: Option<&ContentArticle>,
    right: Option<&ContentArticle>,
) -> bool {
    match (left, right) {
        (None, None) => true,
        (Some(left), Some(right)) => {
            let mut left = left.clone();
            let mut right = right.clone();
            left.meta.published_at = None;
            right.meta.published_at = None;
            left == right
        }
        _ => false,
    }
}

fn snapshots_equal_ignoring_publication(left: &ContentSnapshot, right: &ContentSnapshot) -> bool {
    left.taxonomy == right.taxonomy
        && articles_by_id(left).keys().eq(articles_by_id(right).keys())
        && left.articles.iter().all(|article| {
            articles_equal_ignoring_publication(
                Some(article),
                articles_by_id(right).get(&article.meta.id).copied(),
            )
        })
}

fn view_from(state: &WorkspaceState) -> WorkspaceView {
    WorkspaceView {
        version: state.version,
        committed_version: state.committed_version,
        status: state.status,
        remote_batch: state.remote_batch.clone(),
        last_error: state.last_error.clone(),
        snapshot: state.snapshot.clone(),
    }
}

fn next_article_id(ids: &BTreeSet<i64>) -> Result<i64, WorkspaceError> {
    ids.iter()
        .next_back()
        .copied()
        .unwrap_or(0)
        .checked_add(1)
        .ok_or_else(|| WorkspaceError::Invalid("article ID space exhausted".to_owned()))
}

fn next_workspace_version(version: u64) -> Result<u64, WorkspaceError> {
    version
        .checked_add(1)
        .ok_or_else(|| WorkspaceError::Invalid("workspace version space is exhausted".to_owned()))
}

fn empty_snapshot() -> ContentSnapshot {
    ContentSnapshot::default()
}

fn validate_persisted(value: &protocol::ContentWorkflowState) -> Result<(), WorkspaceError> {
    for snapshot in [
        &value.snapshot,
        &value.committed_snapshot,
        &value.batch_base_snapshot,
    ] {
        validate_snapshot(snapshot).map_err(|error| WorkspaceError::Invalid(error.to_string()))?;
    }
    let known: BTreeSet<_> = value.known_article_ids.iter().copied().collect();
    if known.len() != value.known_article_ids.len()
        || value
            .snapshot
            .articles
            .iter()
            .any(|article| !known.contains(&article.meta.id))
    {
        return Err(WorkspaceError::Invalid(
            "persisted known article IDs are inconsistent".to_owned(),
        ));
    }
    match value.pending_remote_operation.as_ref() {
        Some(operation) => {
            if operation.workspace_version != value.workspace_version {
                return Err(WorkspaceError::Invalid(
                    "persisted remote intent version does not match the workspace".to_owned(),
                ));
            }
            let expected_status = match operation.kind {
                protocol::ContentRemoteOperationKind::Submit => {
                    protocol::ContentWorkspaceStatus::Submitting
                }
                protocol::ContentRemoteOperationKind::Discard => {
                    if value.remote_batch.is_none() {
                        return Err(WorkspaceError::Invalid(
                            "persisted discard intent has no remote batch".to_owned(),
                        ));
                    }
                    protocol::ContentWorkspaceStatus::Discarding
                }
            };
            if value.status != expected_status
                && value.status != protocol::ContentWorkspaceStatus::Failed
            {
                return Err(WorkspaceError::Invalid(
                    "persisted remote intent is inconsistent with workspace status".to_owned(),
                ));
            }
        }
        None => {
            if value.status == protocol::ContentWorkspaceStatus::Submitting
                || value.status == protocol::ContentWorkspaceStatus::Discarding
                    && value.remote_batch.is_some()
            {
                return Err(WorkspaceError::Invalid(
                    "persisted remote operation is missing its durable intent".to_owned(),
                ));
            }
        }
    }
    Ok(())
}

fn status_to_protocol(value: WorkspaceStatus) -> protocol::ContentWorkspaceStatus {
    match value {
        WorkspaceStatus::Clean => protocol::ContentWorkspaceStatus::Clean,
        WorkspaceStatus::Saved => protocol::ContentWorkspaceStatus::Saved,
        WorkspaceStatus::Submitting => protocol::ContentWorkspaceStatus::Submitting,
        WorkspaceStatus::Discarding => protocol::ContentWorkspaceStatus::Discarding,
        WorkspaceStatus::Submitted => protocol::ContentWorkspaceStatus::Submitted,
        WorkspaceStatus::SubmittedWithChanges => {
            protocol::ContentWorkspaceStatus::SubmittedWithChanges
        }
        WorkspaceStatus::Failed => protocol::ContentWorkspaceStatus::Failed,
    }
}

fn status_from_protocol(value: protocol::ContentWorkspaceStatus) -> WorkspaceStatus {
    match value {
        protocol::ContentWorkspaceStatus::Clean => WorkspaceStatus::Clean,
        protocol::ContentWorkspaceStatus::Saved => WorkspaceStatus::Saved,
        protocol::ContentWorkspaceStatus::Submitting => WorkspaceStatus::Submitting,
        protocol::ContentWorkspaceStatus::Discarding => WorkspaceStatus::Discarding,
        protocol::ContentWorkspaceStatus::Submitted => WorkspaceStatus::Submitted,
        protocol::ContentWorkspaceStatus::SubmittedWithChanges => {
            WorkspaceStatus::SubmittedWithChanges
        }
        protocol::ContentWorkspaceStatus::Failed => WorkspaceStatus::Failed,
    }
}

fn remote_to_protocol(value: RemoteBatch) -> protocol::ContentRemoteBatch {
    protocol::ContentRemoteBatch {
        branch: value.branch,
        pull_request: value.pull_request,
        commit: value.commit,
        base_commit: value.base_commit,
    }
}

fn remote_from_protocol(value: protocol::ContentRemoteBatch) -> RemoteBatch {
    RemoteBatch {
        branch: value.branch,
        pull_request: value.pull_request,
        commit: value.commit,
        base_commit: value.base_commit,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content_contract::TaxonomyCategory;
    use crate::github::MockGithub;

    fn taxonomy() -> TaxonomyFile {
        TaxonomyFile {
            version: 1,
            next_category_id: 2,
            next_tag_id: 1,
            categories: vec![TaxonomyCategory {
                id: 1,
                name: "Rust".to_owned(),
                parent_id: None,
                position: 10,
            }],
            tags: vec![],
        }
    }

    fn draft(content_html: &str) -> ArticleDraft {
        ArticleDraft {
            id: None,
            title: "Article".to_owned(),
            summary: String::new(),
            category_ids: vec![1],
            tag_ids: vec![],
            content_html: content_html.to_owned(),
        }
    }

    fn initialize_taxonomy<R: ContentRemote>(workspace: &ContentWorkspace<R>) -> u64 {
        let snapshot = ContentSnapshot {
            taxonomy: taxonomy(),
            ..ContentSnapshot::default()
        };
        workspace
            .apply_reviewed_snapshot(0, snapshot)
            .unwrap()
            .version
    }

    #[test]
    fn direct_taxonomy_save_cannot_allocate_client_supplied_ids() {
        let workspace = ContentWorkspace::new(MockGithub::default());
        let error = workspace.replace_taxonomy(0, taxonomy()).unwrap_err();
        assert!(matches!(error, WorkspaceError::Invalid(_)));
        assert_eq!(workspace.view().version, 0);
    }

    #[test]
    fn invalid_save_leaves_the_previous_workspace_version_unchanged() {
        let workspace = ContentWorkspace::new(MockGithub::default());
        let version = initialize_taxonomy(&workspace);
        let saved = workspace
            .save_article(version, draft("<p>safe</p>"))
            .unwrap();
        let error = workspace
            .save_article(saved.version, draft("<script>bad()</script>"))
            .unwrap_err();
        assert!(matches!(error, WorkspaceError::InvalidArticleHtml(_)));
        let current = workspace.view();
        assert_eq!(current.version, saved.version);
        assert_eq!(current.snapshot.articles[0].content_html, "<p>safe</p>");
        assert!(workspace.remote.lock().unwrap().submissions().is_empty());
    }

    #[test]
    fn stale_pages_cannot_overwrite_saved_content_or_submit_it() {
        let workspace = ContentWorkspace::new(MockGithub::default());
        initialize_taxonomy(&workspace);
        let saved = workspace.save_article(1, draft("<p>saved</p>")).unwrap();
        assert!(matches!(
            workspace.save_article(1, draft("<p>stale</p>")),
            Err(WorkspaceError::VersionConflict { .. })
        ));
        assert!(matches!(
            workspace.submit(1),
            Err(WorkspaceError::VersionConflict { .. })
        ));
        assert_eq!(workspace.view(), saved);
        assert!(workspace.remote.lock().unwrap().submissions().is_empty());
    }

    #[test]
    fn unchanged_workspace_does_not_create_a_pull_request() {
        let workspace = ContentWorkspace::new(MockGithub::default());
        assert_eq!(workspace.submit(0), Err(WorkspaceError::NoChanges));
        assert!(workspace.remote.lock().unwrap().submissions().is_empty());
    }

    #[test]
    fn uncategorized_article_can_be_saved_but_cannot_be_submitted() {
        let workspace = ContentWorkspace::from_snapshot_at(
            MockGithub::default(),
            ContentSnapshot::default(),
            Some("main-1".to_owned()),
        )
        .unwrap();
        let mut uncategorized = draft("<p>waiting for taxonomy</p>");
        uncategorized.category_ids.clear();
        let saved = workspace.save_article(0, uncategorized).unwrap();
        let error = workspace.begin_submit(saved.version).unwrap_err();
        assert!(error.to_string().contains("at least one leaf category"));
        assert!(workspace.remote.lock().unwrap().submissions().is_empty());

        let reviewed = ContentSnapshot {
            taxonomy: taxonomy(),
            articles: saved
                .snapshot
                .articles
                .into_iter()
                .map(|mut article| {
                    article.meta.category_ids = vec![1];
                    article
                })
                .collect(),
        };
        let classified = workspace
            .apply_reviewed_snapshot(saved.version, reviewed)
            .unwrap();
        assert!(workspace.begin_submit(classified.version).is_ok());
        assert!(workspace.remote.lock().unwrap().submissions().is_empty());
    }

    #[test]
    fn removed_ids_are_not_reallocated_and_new_ids_cannot_be_supplied() {
        let workspace = ContentWorkspace::new(MockGithub::default());
        initialize_taxonomy(&workspace);
        workspace.save_article(1, draft("<p>first</p>")).unwrap();
        workspace.remove_article(2, 1).unwrap();
        let saved = workspace.save_article(3, draft("<p>second</p>")).unwrap();
        assert_eq!(saved.snapshot.articles[0].meta.id, 2);
        assert!(matches!(
            workspace.save_article(
                4,
                ArticleDraft {
                    id: Some(1),
                    ..draft("<p>unrelated</p>")
                }
            ),
            Err(WorkspaceError::ArticleNotFound(1))
        ));
    }

    struct RefuseClose;

    impl ContentRemote for RefuseClose {
        fn read_main_snapshot(
            &mut self,
        ) -> Result<crate::github::RemoteMainSnapshot, crate::github::RemoteError> {
            MockGithub::with_main("fixture-main", ContentSnapshot::default()).read_main_snapshot()
        }
        fn submit_batch(
            &mut self,
            snapshot: &ContentSnapshot,
            existing: Option<&RemoteBatch>,
            intent: &RemoteSubmitIntent,
        ) -> Result<crate::github::RemoteSubmission, crate::github::RemoteError> {
            MockGithub::default().submit_batch(snapshot, existing, intent)
        }

        fn batch_state(
            &mut self,
            _: &RemoteBatch,
        ) -> Result<RemoteBatchState, crate::github::RemoteError> {
            Ok(RemoteBatchState::Open)
        }

        fn close_batch(&mut self, _: &RemoteBatch) -> Result<(), crate::github::RemoteError> {
            Err(crate::github::RemoteError::new("close failed"))
        }
    }

    #[test]
    fn failed_close_preserves_saved_content_and_batch() {
        let workspace = ContentWorkspace::new(RefuseClose);
        initialize_taxonomy(&workspace);
        workspace.save_article(1, draft("<p>saved</p>")).unwrap();
        let submitted = workspace.submit(2).unwrap();
        assert!(matches!(
            workspace.discard(2),
            Err(WorkspaceError::Remote(_))
        ));
        let current = workspace.view();
        assert_eq!(current.snapshot, submitted.snapshot);
        assert_eq!(current.version, submitted.version);
        assert_eq!(current.remote_batch, submitted.remote_batch);
        assert_eq!(current.status, WorkspaceStatus::Failed);
    }

    #[test]
    fn failed_pending_submit_freezes_mutations_and_keeps_the_same_intent() {
        let workspace = ContentWorkspace::new(MockGithub::default());
        let version = initialize_taxonomy(&workspace);
        let saved = workspace
            .save_article(version, draft("<p>pending</p>"))
            .unwrap();
        let first = workspace.begin_submit(saved.version).unwrap();
        workspace.fail_remote_operation("unknown remote result".into());
        assert!(matches!(
            workspace.save_article(saved.version, draft("<p>blocked</p>")),
            Err(WorkspaceError::Busy)
        ));
        assert!(matches!(
            workspace.remove_article(saved.version, 1),
            Err(WorkspaceError::Busy)
        ));
        assert!(matches!(
            workspace.replace_taxonomy(saved.version, taxonomy()),
            Err(WorkspaceError::Busy)
        ));
        assert!(matches!(
            workspace.begin_discard(saved.version),
            Err(WorkspaceError::Busy)
        ));
        let retried = workspace.begin_submit(saved.version).unwrap();
        assert_eq!(retried.intent, first.intent);
        assert_eq!(retried.snapshot, first.snapshot);
    }

    #[test]
    fn persisted_remote_discard_requires_a_durable_intent() {
        let workspace = ContentWorkspace::new(MockGithub::default());
        let version = initialize_taxonomy(&workspace);
        let saved = workspace
            .save_article(version, draft("<p>submitted</p>"))
            .unwrap();
        let submitted = workspace.submit(saved.version).unwrap();
        let mut persisted = workspace.persisted_state(None, protocol::ContentSyncState::default());
        persisted.status = protocol::ContentWorkspaceStatus::Discarding;
        persisted.pending_remote_operation = None;
        let error = ContentWorkspace::from_persisted(MockGithub::default(), &persisted)
            .err()
            .expect("remote discard without intent must be rejected");
        assert!(error.to_string().contains("durable intent"));
        assert!(submitted.remote_batch.is_some());
    }

    #[test]
    fn repeated_submit_updates_one_pull_request_and_never_merges() {
        let remote = MockGithub::default();
        let workspace = ContentWorkspace::new(remote);
        let version = initialize_taxonomy(&workspace);
        let saved = workspace
            .save_article(version, draft("<p>safe</p>"))
            .unwrap();
        let first = workspace.submit(saved.version).unwrap();
        let batch = first.remote_batch.clone().unwrap();
        let next = workspace
            .save_article(
                first.version,
                ArticleDraft {
                    id: Some(1),
                    title: "Changed".to_owned(),
                    ..draft("<p>new</p>")
                },
            )
            .unwrap();
        let second = workspace.submit(next.version).unwrap();
        let updated = second.remote_batch.unwrap();
        assert_eq!(updated.branch, batch.branch);
        assert_eq!(updated.pull_request, batch.pull_request);
        assert_ne!(updated.commit, batch.commit);
        assert_eq!(workspace.remote.lock().unwrap().submissions().len(), 2);
        assert_eq!(workspace.remote.lock().unwrap().close_calls(), 0);
    }

    #[test]
    fn reviewed_taxonomy_and_article_migration_are_submitted_in_one_snapshot() {
        let workspace = ContentWorkspace::new(MockGithub::default());
        let version = initialize_taxonomy(&workspace);
        let saved = workspace
            .save_article(version, draft("<p>safe</p>"))
            .unwrap();
        let mut reviewed = saved.snapshot.clone();
        reviewed.taxonomy.next_category_id = 3;
        reviewed.taxonomy.categories.push(TaxonomyCategory {
            id: 2,
            name: "Systems".into(),
            parent_id: None,
            position: 20,
        });
        reviewed.articles[0].meta.category_ids = vec![2];
        let applied = workspace
            .apply_reviewed_snapshot(saved.version, reviewed.clone())
            .unwrap();
        workspace.submit(applied.version).unwrap();
        assert_eq!(workspace.remote.lock().unwrap().submissions(), &[reviewed]);
    }

    #[test]
    fn discard_closes_open_batch_before_clearing_workspace() {
        let remote = MockGithub::default();
        let workspace = ContentWorkspace::new(remote);
        let version = initialize_taxonomy(&workspace);
        let saved = workspace
            .save_article(version, draft("<p>safe</p>"))
            .unwrap();
        let submitted = workspace.submit(saved.version).unwrap();
        let cleared = workspace.discard(submitted.version).unwrap();
        assert_eq!(cleared.status, WorkspaceStatus::Clean);
        assert!(cleared.snapshot.articles.is_empty());
        assert_eq!(workspace.remote.lock().unwrap().close_calls(), 1);
    }

    #[test]
    fn sync_rebases_distinct_local_and_remote_articles_without_losing_either() {
        let base = ContentSnapshot {
            taxonomy: taxonomy(),
            articles: Vec::new(),
        };
        let workspace = ContentWorkspace::from_snapshot_at(
            MockGithub::default(),
            base.clone(),
            Some("main-1".into()),
        )
        .unwrap();
        workspace.save_article(0, draft("<p>local</p>")).unwrap();
        let mut published = base;
        published.articles.push(ContentArticle {
            meta: ArticleMeta {
                id: 2,
                title: "Remote".into(),
                summary: String::new(),
                category_ids: vec![1],
                tag_ids: Vec::new(),
                created_at: "2026-09-08T00:00:00Z".into(),
                updated_at: "2026-09-08T00:00:00Z".into(),
                published_at: Some("2026-09-08T00:00:00Z".into()),
            },
            content_html: "<p>remote</p>".into(),
        });
        workspace
            .validate_sync_target("main-2", &published, None)
            .unwrap();
        workspace
            .complete_sync("main-2".into(), published, None)
            .unwrap();
        let view = workspace.view();
        assert_eq!(view.status, WorkspaceStatus::Saved);
        assert_eq!(view.version, 2);
        assert_eq!(
            view.snapshot
                .articles
                .iter()
                .map(|article| (article.meta.id, article.meta.title.as_str()))
                .collect::<Vec<_>>(),
            vec![(1, "Article"), (2, "Remote")]
        );
        assert!(matches!(
            workspace.save_article(1, draft("<p>stale</p>")),
            Err(WorkspaceError::VersionConflict {
                expected: 1,
                actual: 2
            })
        ));
    }

    #[test]
    fn sync_conflict_keeps_the_old_base_and_prevents_silent_overwrite() {
        let base = ContentSnapshot {
            taxonomy: taxonomy(),
            articles: Vec::new(),
        };
        let workspace = ContentWorkspace::from_snapshot_at(
            MockGithub::default(),
            base.clone(),
            Some("main-1".into()),
        )
        .unwrap();
        let local = workspace.save_article(0, draft("<p>local</p>")).unwrap();
        let mut published = base;
        published.articles.push(ContentArticle {
            meta: ArticleMeta {
                id: 1,
                title: "Remote collision".into(),
                summary: String::new(),
                category_ids: vec![1],
                tag_ids: Vec::new(),
                created_at: "2026-09-08T00:00:00Z".into(),
                updated_at: "2026-09-08T00:00:00Z".into(),
                published_at: Some("2026-09-08T00:00:00Z".into()),
            },
            content_html: "<p>remote</p>".into(),
        });
        assert!(matches!(
            workspace.validate_sync_target("main-2", &published, None),
            Err(WorkspaceError::Remote(_))
        ));
        assert_eq!(workspace.view(), local);
        let submit = workspace.begin_submit(local.version).unwrap();
        assert_eq!(submit.intent.base_commit, "main-1");
    }

    #[test]
    fn merged_batch_keeps_changes_saved_after_the_submitted_snapshot() {
        let workspace = ContentWorkspace::new(MockGithub::default());
        let version = initialize_taxonomy(&workspace);
        let saved = workspace
            .save_article(version, draft("<p>submitted</p>"))
            .unwrap();
        let submitted = workspace.submit(saved.version).unwrap();
        let mut later_draft = draft("<p>submitted</p>");
        later_draft.id = Some(1);
        later_draft.summary = "saved after submit".into();
        let later = workspace
            .save_article(submitted.version, later_draft)
            .unwrap();
        assert_eq!(later.status, WorkspaceStatus::SubmittedWithChanges);
        let mut published = submitted.snapshot;
        published.articles[0].meta.published_at = Some("2026-09-08T00:00:00Z".into());
        assert!(matches!(
            workspace.validate_sync_target(
                "fixture-main",
                &published,
                Some(RemoteBatchState::Merged)
            ),
            Err(WorkspaceError::Remote(_))
        ));
        assert!(workspace.view().remote_batch.is_some());
        workspace
            .validate_sync_target("main-merged", &published, Some(RemoteBatchState::Merged))
            .unwrap();
        workspace
            .complete_sync(
                "main-merged".into(),
                published,
                Some(RemoteBatchState::Merged),
            )
            .unwrap();
        let view = workspace.view();
        assert_eq!(view.status, WorkspaceStatus::Saved);
        assert!(view.remote_batch.is_none());
        assert_eq!(view.snapshot.articles[0].meta.summary, "saved after submit");
    }

    #[test]
    fn workspace_version_exhaustion_is_explicit_and_atomic() {
        let base = ContentSnapshot {
            taxonomy: taxonomy(),
            articles: Vec::new(),
        };
        let original =
            ContentWorkspace::from_snapshot_at(MockGithub::default(), base, Some("main-1".into()))
                .unwrap();
        let mut persisted = original.persisted_state(None, protocol::ContentSyncState::default());
        persisted.workspace_version = u64::MAX;
        let workspace =
            ContentWorkspace::from_persisted(MockGithub::default(), &persisted).unwrap();
        let before = workspace.view();
        let error = workspace
            .save_article(u64::MAX, draft("<p>cannot save</p>"))
            .unwrap_err();
        assert!(matches!(error, WorkspaceError::Invalid(_)));
        assert_eq!(workspace.view(), before);
    }
}
