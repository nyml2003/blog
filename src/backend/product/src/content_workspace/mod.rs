//! Server-local content workspace for the GitHub batch workflow.
//!
//! The workspace is deliberately independent from the public Data cache. A save changes only
//! this state; public visibility changes only after a remote `main` snapshot is synchronized.

use std::collections::BTreeSet;
use std::fmt;
use std::sync::{Mutex, MutexGuard};

use crate::content_contract::{
    ArticleMeta, ContentArticle, ContentSnapshot, TaxonomyFile, TaxonomyTerm, TaxonomyType,
    validate_snapshot,
};
use crate::github::{ContentRemote, RemoteBatch};

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArticleDraft {
    pub id: Option<i64>,
    pub title: String,
    pub summary: String,
    pub article_type_id: i64,
    pub term_ids: Vec<i64>,
    pub content_html: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkspaceError {
    Invalid(String),
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

#[derive(Debug)]
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
            }),
            remote: Mutex::new(remote),
        }
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

    pub fn save_article(
        &self,
        expected_version: u64,
        draft: ArticleDraft,
    ) -> Result<WorkspaceView, WorkspaceError> {
        let mut state = self.state();
        self.check_version(&state, expected_version)?;
        self.check_writable(&state)?;
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
                article_type_id: draft.article_type_id,
                term_ids: draft.term_ids,
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
        self.mark_saved(&mut state);
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
        let mut next = state.snapshot.clone();
        next.taxonomy = taxonomy;
        validate_snapshot(&next).map_err(|error| WorkspaceError::Invalid(error.to_string()))?;
        state.snapshot = next;
        self.mark_saved(&mut state);
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
        let before = state.snapshot.articles.len();
        state.snapshot.articles.retain(|item| item.meta.id != id);
        if state.snapshot.articles.len() == before {
            return Err(WorkspaceError::ArticleNotFound(id));
        }
        validate_snapshot(&state.snapshot)
            .map_err(|error| WorkspaceError::Invalid(error.to_string()))?;
        state.known_article_ids.insert(id);
        self.mark_saved(&mut state);
        Ok(view_from(&state))
    }

    pub fn submit(&self, expected_version: u64) -> Result<WorkspaceView, WorkspaceError> {
        let (snapshot, existing) = {
            let mut state = self.state();
            self.check_version(&state, expected_version)?;
            self.check_writable(&state)?;
            if state.snapshot == state.committed_snapshot {
                return Err(WorkspaceError::NoChanges);
            }
            validate_snapshot(&state.snapshot)
                .map_err(|error| WorkspaceError::Invalid(error.to_string()))?;
            if state.remote_batch.is_none() {
                state.batch_base_snapshot = state.committed_snapshot.clone();
            }
            state.status = WorkspaceStatus::Submitting;
            state.last_error = None;
            (state.snapshot.clone(), state.remote_batch.clone())
        };

        let result = match self.remote.lock() {
            Ok(mut remote) => remote.submit_batch(&snapshot, existing.as_ref()),
            Err(_) => Err(crate::github::RemoteError::new("remote lock poisoned")),
        };
        let mut state = self.state();
        match result {
            Ok(submission) => {
                state.remote_batch = Some(submission.batch);
                state.committed_version = Some(state.version);
                state.committed_snapshot = state.snapshot.clone();
                state.status = WorkspaceStatus::Submitted;
                state.last_error = None;
                Ok(view_from(&state))
            }
            Err(error) => {
                state.status = WorkspaceStatus::Failed;
                state.last_error = Some(error.to_string());
                Err(WorkspaceError::Remote(error.to_string()))
            }
        }
    }

    pub fn discard(&self, expected_version: u64) -> Result<WorkspaceView, WorkspaceError> {
        let existing = {
            let mut state = self.state();
            self.check_version(&state, expected_version)?;
            self.check_writable(&state)?;
            state.status = WorkspaceStatus::Discarding;
            state.remote_batch.clone()
        };
        if let Some(batch) = existing.as_ref() {
            let result = match self.remote.lock() {
                Ok(mut remote) => remote.close_batch(batch),
                Err(_) => Err(crate::github::RemoteError::new("remote lock poisoned")),
            };
            if let Err(error) = result {
                let mut state = self.state();
                state.status = WorkspaceStatus::Failed;
                state.last_error = Some(error.to_string());
                return Err(WorkspaceError::Remote(error.to_string()));
            }
        }
        let mut state = self.state();
        state.snapshot = state.batch_base_snapshot.clone();
        state.remote_batch = None;
        state.committed_version = None;
        state.committed_snapshot = state.snapshot.clone();
        state.batch_base_snapshot = state.snapshot.clone();
        state.status = WorkspaceStatus::Clean;
        state.last_error = None;
        state.version += 1;
        Ok(view_from(&state))
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
        if matches!(
            state.status,
            WorkspaceStatus::Submitting | WorkspaceStatus::Discarding
        ) {
            return Err(WorkspaceError::Busy);
        }
        Ok(())
    }

    fn mark_saved(&self, state: &mut WorkspaceState) {
        state.version += 1;
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

fn empty_snapshot() -> ContentSnapshot {
    ContentSnapshot {
        taxonomy: TaxonomyFile {
            article_types: Vec::<TaxonomyType>::new(),
            terms: Vec::<TaxonomyTerm>::new(),
        },
        articles: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::github::MockGithub;

    fn taxonomy() -> TaxonomyFile {
        TaxonomyFile {
            article_types: vec![TaxonomyType {
                id: 1,
                name: "Rust".to_owned(),
                created_at: "2026-01-01T00:00:00Z".to_owned(),
                updated_at: "2026-01-01T00:00:00Z".to_owned(),
            }],
            terms: vec![],
        }
    }

    fn draft(content_html: &str) -> ArticleDraft {
        ArticleDraft {
            id: None,
            title: "Article".to_owned(),
            summary: String::new(),
            article_type_id: 1,
            term_ids: vec![],
            content_html: content_html.to_owned(),
        }
    }

    #[test]
    fn invalid_save_leaves_the_previous_workspace_version_unchanged() {
        let workspace = ContentWorkspace::new(MockGithub::default());
        let version = workspace.replace_taxonomy(0, taxonomy()).unwrap().version;
        let saved = workspace
            .save_article(version, draft("<p>safe</p>"))
            .unwrap();
        let error = workspace
            .save_article(saved.version, draft("<script>bad()</script>"))
            .unwrap_err();
        assert!(matches!(error, WorkspaceError::Invalid(_)));
        let current = workspace.view();
        assert_eq!(current.version, saved.version);
        assert_eq!(current.snapshot.articles[0].content_html, "<p>safe</p>");
        assert!(workspace.remote.lock().unwrap().submissions().is_empty());
    }

    #[test]
    fn stale_pages_cannot_overwrite_saved_content_or_submit_it() {
        let workspace = ContentWorkspace::new(MockGithub::default());
        workspace.replace_taxonomy(0, taxonomy()).unwrap();
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
    fn removed_ids_are_not_reallocated_and_new_ids_cannot_be_supplied() {
        let workspace = ContentWorkspace::new(MockGithub::default());
        workspace.replace_taxonomy(0, taxonomy()).unwrap();
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
        fn submit_batch(
            &mut self,
            snapshot: &ContentSnapshot,
            existing: Option<&RemoteBatch>,
        ) -> Result<crate::github::RemoteSubmission, crate::github::RemoteError> {
            MockGithub::default().submit_batch(snapshot, existing)
        }

        fn close_batch(&mut self, _: &RemoteBatch) -> Result<(), crate::github::RemoteError> {
            Err(crate::github::RemoteError::new("close failed"))
        }
    }

    #[test]
    fn failed_close_preserves_saved_content_and_batch() {
        let workspace = ContentWorkspace::new(RefuseClose);
        workspace.replace_taxonomy(0, taxonomy()).unwrap();
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
    fn repeated_submit_updates_one_pull_request_and_never_merges() {
        let remote = MockGithub::default();
        let workspace = ContentWorkspace::new(remote);
        let version = workspace.replace_taxonomy(0, taxonomy()).unwrap().version;
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
    fn discard_closes_open_batch_before_clearing_workspace() {
        let remote = MockGithub::default();
        let workspace = ContentWorkspace::new(remote);
        let version = workspace.replace_taxonomy(0, taxonomy()).unwrap().version;
        let saved = workspace
            .save_article(version, draft("<p>safe</p>"))
            .unwrap();
        let submitted = workspace.submit(saved.version).unwrap();
        let cleared = workspace.discard(submitted.version).unwrap();
        assert_eq!(cleared.status, WorkspaceStatus::Clean);
        assert!(cleared.snapshot.articles.is_empty());
        assert_eq!(workspace.remote.lock().unwrap().close_calls(), 1);
    }
}
