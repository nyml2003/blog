//! Product-owned content workflow orchestration.
//!
//! HTTP adapters delegate version checks, model calls, persistence and remote submission here.

use std::fmt;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::content_contract::{ContentArticle, ContentSnapshot, TaxonomyFile};
use crate::content_sync::{SyncCoordinator, SyncSnapshot, SyncStatus};
use crate::content_workspace::{ArticleDraft, ContentWorkspace, WorkspaceError, WorkspaceView};
use crate::data_client::{DataCallError, DataClient};
use crate::github::ContentRemote;
use crate::model_review::{
    ModelRequest, ReviewRequest, TAXONOMY_PROMPT_VERSION, TaxonomyModel, generate, review,
};
use crate::taxonomy_changes::{AppliedTaxonomyChanges, CHANGE_SCHEMA_VERSION, TaxonomyChangeSet};

const DATA_BUDGET: Duration = Duration::from_secs(5);

#[derive(Debug)]
pub enum ContentServiceError {
    Workspace(WorkspaceError),
    Data(DataCallError),
    Invalid(String),
    Model(String),
    NoPendingReview,
    PendingReviewRequired,
    FailClosed(String),
}

impl fmt::Display for ContentServiceError {
    fn fmt(&self, output: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Workspace(error) => error.fmt(output),
            Self::Data(error) => write!(output, "content persistence failed: {error:?}"),
            Self::Invalid(message) => write!(output, "invalid content workflow: {message}"),
            Self::Model(message) => write!(output, "taxonomy model failed: {message}"),
            Self::NoPendingReview => output.write_str("no analyzed taxonomy changes are pending"),
            Self::PendingReviewRequired => {
                output.write_str("taxonomy analysis must be reviewed before submit")
            }
            Self::FailClosed(message) => {
                write!(
                    output,
                    "content writes are disabled after persistence failure: {message}"
                )
            }
        }
    }
}

impl std::error::Error for ContentServiceError {}

impl From<WorkspaceError> for ContentServiceError {
    fn from(value: WorkspaceError) -> Self {
        Self::Workspace(value)
    }
}

#[derive(Debug, Clone)]
struct PendingAnalysis {
    workspace_version: u64,
    article_ids: Vec<i64>,
    changes: TaxonomyChangeSet,
    applied: AppliedTaxonomyChanges,
}

pub struct ContentService<R> {
    data: DataClient,
    workspace: Arc<ContentWorkspace<R>>,
    model: Arc<Mutex<Box<dyn TaxonomyModel>>>,
    pending: Mutex<Option<PendingAnalysis>>,
    storage_revision: Mutex<Option<u64>>,
    fail_closed: Mutex<Option<String>>,
    writes: tokio::sync::Mutex<()>,
    sync_gate: tokio::sync::Mutex<()>,
    sync: SyncCoordinator,
}

impl<R: ContentRemote> ContentService<R> {
    pub async fn load(
        data: DataClient,
        remote: R,
        model: Box<dyn TaxonomyModel>,
    ) -> Result<Self, ContentServiceError> {
        let stored = call_workflow_get(&data).await?;
        let public_snapshot = call_snapshot_get(&data).await?;
        let (workspace, pending, storage_revision, sync_state) = match stored {
            Some(stored) => {
                let workspace = ContentWorkspace::from_persisted(remote, &stored.state)?;
                let pending = stored
                    .state
                    .pending_taxonomy_review
                    .as_ref()
                    .map(|pending| pending_from_protocol(pending, &workspace.view().snapshot))
                    .transpose()?;
                let sync = match public_snapshot.as_ref() {
                    Some(value)
                        if stored.state.sync.successful_commit.as_deref()
                            != Some(value.commit.as_str()) =>
                    {
                        protocol::ContentSyncState {
                            target_commit: Some(value.commit.clone()),
                            successful_commit: Some(value.commit.clone()),
                            article_count: u64::try_from(value.snapshot.articles.len())
                                .unwrap_or(u64::MAX),
                            last_error: None,
                        }
                    }
                    _ => stored.state.sync.clone(),
                };
                (workspace, pending, Some(stored.revision), sync)
            }
            None => {
                let (snapshot, source_commit, sync_state) = match public_snapshot.clone() {
                    Some(value) => {
                        let sync = protocol::ContentSyncState {
                            target_commit: Some(value.commit.clone()),
                            successful_commit: Some(value.commit.clone()),
                            article_count: u64::try_from(value.snapshot.articles.len())
                                .unwrap_or(u64::MAX),
                            last_error: None,
                        };
                        (value.snapshot, Some(value.commit), sync)
                    }
                    None => (
                        ContentSnapshot::default(),
                        None,
                        protocol::ContentSyncState::default(),
                    ),
                };
                let workspace =
                    ContentWorkspace::from_snapshot_at(remote, snapshot, source_commit)?;
                (workspace, None, None, sync_state)
            }
        };
        let service = Self {
            data,
            workspace: Arc::new(workspace),
            model: Arc::new(Mutex::new(model)),
            pending: Mutex::new(pending),
            storage_revision: Mutex::new(storage_revision),
            fail_closed: Mutex::new(None),
            writes: tokio::sync::Mutex::new(()),
            sync_gate: tokio::sync::Mutex::new(()),
            sync: SyncCoordinator::from_persisted(&sync_state),
        };
        if let Some(stored) = public_snapshot.as_ref() {
            if let Err(error) = service.workspace.reconcile_stored_public(stored) {
                service.workspace.fail_remote_operation(error.to_string());
                service
                    .sync
                    .fail_target(stored.commit.clone(), error.to_string());
                service.persist_failure_state().await;
            }
        }
        if service
            .storage_revision
            .lock()
            .expect("workflow revision lock poisoned")
            .is_none()
        {
            service.persist_current().await?;
        }
        if let Err(error) = service.recover_remote_operation().await {
            service.workspace.fail_remote_operation(error.to_string());
            service.persist_failure_state().await;
        }
        Ok(service)
    }

    pub fn view(&self) -> WorkspaceView {
        self.workspace.view()
    }

    pub fn preview(&self) -> (u64, ContentSnapshot, Option<AppliedTaxonomyChanges>) {
        let view = self.workspace.view();
        let pending = self
            .pending
            .lock()
            .expect("pending taxonomy lock poisoned")
            .clone()
            .filter(|pending| pending.workspace_version == view.version);
        let applied = pending.map(|pending| pending.applied);
        (view.version, view.snapshot, applied)
    }

    pub async fn save_taxonomy(
        &self,
        expected_version: u64,
        taxonomy: TaxonomyFile,
    ) -> Result<WorkspaceView, ContentServiceError> {
        let _write = self.writes.lock().await;
        self.ensure_writable()?;
        let checkpoint = self.checkpoint();
        self.clear_pending();
        let view = self
            .workspace
            .replace_taxonomy(expected_version, taxonomy)?;
        self.persist_or_restore(checkpoint).await?;
        Ok(view)
    }

    pub async fn save_article(
        &self,
        expected_version: u64,
        article: ArticleDraft,
    ) -> Result<(WorkspaceView, ContentArticle), ContentServiceError> {
        let _write = self.writes.lock().await;
        self.ensure_writable()?;
        let checkpoint = self.checkpoint();
        let requested_id = article.id;
        self.clear_pending();
        let view = self.workspace.save_article(expected_version, article)?;
        let saved = view
            .snapshot
            .articles
            .iter()
            .find(|candidate| match requested_id {
                Some(id) => candidate.meta.id == id,
                None => !checkpoint
                    .snapshot
                    .articles
                    .iter()
                    .any(|previous| previous.meta.id == candidate.meta.id),
            })
            .cloned()
            .ok_or_else(|| {
                ContentServiceError::Invalid(
                    "saved article is missing from the workspace result".to_owned(),
                )
            })?;
        self.persist_or_restore(checkpoint).await?;
        Ok((view, saved))
    }

    pub async fn remove_article(
        &self,
        expected_version: u64,
        article_id: i64,
    ) -> Result<WorkspaceView, ContentServiceError> {
        let _write = self.writes.lock().await;
        self.ensure_writable()?;
        let checkpoint = self.checkpoint();
        self.clear_pending();
        let view = self
            .workspace
            .remove_article(expected_version, article_id)?;
        self.persist_or_restore(checkpoint).await?;
        Ok(view)
    }

    pub async fn analyze(
        &self,
        expected_version: u64,
        article_ids: Vec<i64>,
    ) -> Result<WorkspaceView, ContentServiceError> {
        let _write = self.writes.lock().await;
        self.ensure_writable()?;
        let view = self.workspace.view();
        if view.version != expected_version {
            return Err(WorkspaceError::VersionConflict {
                expected: expected_version,
                actual: view.version,
            }
            .into());
        }
        if article_ids.is_empty() {
            return Err(ContentServiceError::Invalid(
                "articleIds must contain at least one article".to_owned(),
            ));
        }
        if article_ids.iter().any(|id| {
            !view
                .snapshot
                .articles
                .iter()
                .any(|article| article.meta.id == *id)
        }) {
            return Err(ContentServiceError::Invalid(
                "articleIds contains an unknown article".to_owned(),
            ));
        }
        let checkpoint = self.checkpoint();
        self.clear_pending();
        self.persist_or_restore(checkpoint).await?;
        let cleared_checkpoint = self.checkpoint();

        let request = ModelRequest {
            snapshot: view.snapshot,
            article_ids: article_ids.clone(),
        };
        let model = Arc::clone(&self.model);
        let generated = tokio::task::spawn_blocking(move || {
            let mut model = model
                .lock()
                .map_err(|_| "taxonomy model lock poisoned".to_owned())?;
            generate(model.as_mut(), &request).map_err(|error| error.to_string())
        })
        .await
        .map_err(|error| ContentServiceError::Model(format!("model task failed: {error}")))?
        .map_err(ContentServiceError::Model)?;
        let pending = PendingAnalysis {
            workspace_version: expected_version,
            article_ids,
            changes: generated.0,
            applied: generated.1,
        };
        *self.pending.lock().expect("pending taxonomy lock poisoned") = Some(pending);
        self.persist_or_restore(cleared_checkpoint).await?;
        Ok(self.workspace.view())
    }

    pub async fn review(
        &self,
        expected_version: u64,
    ) -> Result<WorkspaceView, ContentServiceError> {
        let _write = self.writes.lock().await;
        self.ensure_writable()?;
        let pending = self
            .pending
            .lock()
            .expect("pending taxonomy lock poisoned")
            .clone()
            .ok_or(ContentServiceError::NoPendingReview)?;
        if pending.workspace_version != expected_version {
            return Err(WorkspaceError::VersionConflict {
                expected: expected_version,
                actual: pending.workspace_version,
            }
            .into());
        }
        let checkpoint = self.checkpoint();
        let request = ReviewRequest {
            original: self.workspace.view().snapshot,
            proposed: pending.changes,
            applied: pending.applied,
            article_ids: pending.article_ids,
        };
        let model = Arc::clone(&self.model);
        let applied = tokio::task::spawn_blocking(move || {
            let mut model = model
                .lock()
                .map_err(|_| "taxonomy model lock poisoned".to_owned())?;
            review(model.as_mut(), &request).map_err(|error| error.to_string())
        })
        .await
        .map_err(|error| ContentServiceError::Model(format!("model task failed: {error}")))?
        .map_err(ContentServiceError::Model)?;
        let view = self
            .workspace
            .apply_reviewed_snapshot(expected_version, applied.snapshot)?;
        self.clear_pending();
        self.persist_or_restore(checkpoint).await?;
        Ok(view)
    }

    pub async fn submit(
        &self,
        expected_version: u64,
    ) -> Result<WorkspaceView, ContentServiceError> {
        let _write = self.writes.lock().await;
        self.ensure_writable()?;
        if self
            .pending
            .lock()
            .expect("pending taxonomy lock poisoned")
            .is_some()
        {
            return Err(ContentServiceError::PendingReviewRequired);
        }
        let checkpoint = self.checkpoint();
        let operation = self.workspace.begin_submit(expected_version)?;
        self.persist_or_restore(checkpoint).await?;
        let workspace = Arc::clone(&self.workspace);
        let remote_operation = operation.clone();
        let result =
            tokio::task::spawn_blocking(move || workspace.execute_submit(&remote_operation))
                .await
                .map_err(|error| {
                    ContentServiceError::Workspace(WorkspaceError::Remote(format!(
                        "remote submit task failed: {error}"
                    )))
                })?;
        let submission = match result {
            Ok(value) => value,
            Err(error) => {
                self.workspace.fail_remote_operation(error.to_string());
                self.persist_failure_state().await;
                return Err(error.into());
            }
        };
        let view = self.workspace.complete_submit(submission)?;
        self.persist_after_remote().await?;
        Ok(view)
    }

    pub async fn synchronize(&self) -> Result<SyncStatus, ContentServiceError> {
        let _sync = self.sync_gate.try_lock().map_err(|_| {
            ContentServiceError::Invalid("content synchronization is already running".to_owned())
        })?;
        let _write = self
            .writes
            .try_lock()
            .map_err(|_| ContentServiceError::Invalid("content workflow is busy".to_owned()))?;
        let expected_previous_commit = match call_snapshot_get(&self.data).await {
            Ok(snapshot) => snapshot.map(|snapshot| snapshot.commit),
            Err(error) => {
                self.sync.fail_remote(error.to_string());
                self.persist_failure_state().await;
                return Err(error);
            }
        };
        let workspace = Arc::clone(&self.workspace);
        let remote = match tokio::task::spawn_blocking(move || {
            let mut remote = workspace.read_remote_main()?;
            let batch_state = workspace.batch_state()?;
            if batch_state == Some(crate::github::RemoteBatchState::Merged) {
                remote = workspace.read_remote_main()?;
            }
            Ok::<_, WorkspaceError>((remote, batch_state))
        })
        .await
        {
            Ok(Ok(value)) => value,
            Ok(Err(error)) => {
                self.sync.fail_remote(error.to_string());
                self.persist_failure_state().await;
                return Err(error.into());
            }
            Err(error) => {
                let message = format!("remote read task failed: {error}");
                self.sync.fail_remote(message.clone());
                self.persist_failure_state().await;
                return Err(ContentServiceError::Workspace(WorkspaceError::Remote(
                    message,
                )));
            }
        };
        let (remote, batch_state) = remote;
        if let Err(error) =
            self.workspace
                .validate_sync_target(&remote.commit, &remote.snapshot, batch_state)
        {
            self.workspace.fail_remote_operation(error.to_string());
            self.sync
                .fail_target(remote.commit.clone(), error.to_string());
            self.persist_failure_state().await;
            return Err(error.into());
        }
        let input = SyncSnapshot {
            commit: remote.commit,
            snapshot: remote.snapshot,
        };
        let data = self.data.clone();
        let published_commit = input.commit.clone();
        let published_snapshot = input.snapshot.clone();
        let apply_failure = Arc::new(Mutex::new(None));
        let apply_failure_from_call = Arc::clone(&apply_failure);
        let result = self
            .sync
            .run(input.clone(), move |snapshot| {
                let data = data.clone();
                let commit = input.commit.clone();
                let snapshot = snapshot.clone();
                let expected_previous_commit = expected_previous_commit.clone();
                let apply_failure = Arc::clone(&apply_failure_from_call);
                async move {
                    let operation = protocol::DataOperation::ContentSnapshotReplace(
                        protocol::ContentSnapshotReplace {
                            expected_previous_commit,
                            commit,
                            snapshot,
                        },
                    );
                    match data.call("content-sync", &operation, DATA_BUDGET).await {
                        Ok(trace) if matches!(trace.outcome, protocol::DataOutcome::Unit(_)) => {
                            Ok(())
                        }
                        Ok(trace) => {
                            let error = DataCallError::Unavailable(format!(
                                "unexpected content sync outcome: {:?}",
                                trace.outcome
                            ));
                            *apply_failure
                                .lock()
                                .expect("content apply failure lock poisoned") =
                                Some(error.clone());
                            Err(format!("{error:?}"))
                        }
                        Err(error) => {
                            *apply_failure
                                .lock()
                                .expect("content apply failure lock poisoned") =
                                Some(error.clone());
                            Err(format!("{error:?}"))
                        }
                    }
                }
            })
            .await;
        match result {
            Ok(status) => {
                self.workspace
                    .complete_sync(published_commit, published_snapshot, batch_state)?;
                self.persist_after_remote().await?;
                Ok(status)
            }
            Err(error) => {
                self.persist_after_remote().await?;
                let apply_failure = apply_failure
                    .lock()
                    .expect("content apply failure lock poisoned")
                    .take()
                    .unwrap_or_else(|| DataCallError::Unavailable(error.to_string()));
                Err(ContentServiceError::Data(apply_failure))
            }
        }
    }

    pub async fn abandon(
        &self,
        expected_version: u64,
    ) -> Result<WorkspaceView, ContentServiceError> {
        let _write = self.writes.lock().await;
        self.ensure_writable()?;
        let pending_submit = self
            .checkpoint()
            .pending_remote_operation
            .is_some_and(|operation| {
                operation.kind == protocol::ContentRemoteOperationKind::Submit
            });
        if pending_submit {
            if let Err(error) = self.recover_remote_operation().await {
                self.workspace.fail_remote_operation(error.to_string());
                self.persist_failure_state().await;
                return Err(error);
            }
        }
        let checkpoint = self.checkpoint();
        let operation = self.workspace.begin_discard(expected_version)?;
        if operation.batch.is_none() {
            let view = self.workspace.complete_discard()?;
            self.clear_pending();
            self.persist_or_restore(checkpoint).await?;
            return Ok(view);
        }
        self.persist_or_restore(checkpoint).await?;
        let workspace = Arc::clone(&self.workspace);
        let result = tokio::task::spawn_blocking(move || workspace.execute_discard(&operation))
            .await
            .map_err(|error| {
                ContentServiceError::Workspace(WorkspaceError::Remote(format!(
                    "remote discard task failed: {error}"
                )))
            })?;
        if let Err(error) = result {
            self.workspace.fail_remote_operation(error.to_string());
            self.persist_failure_state().await;
            return Err(error.into());
        }
        let view = self.workspace.complete_discard()?;
        self.clear_pending();
        self.persist_after_remote().await?;
        Ok(view)
    }

    pub fn sync_status(&self) -> SyncStatus {
        self.sync.status()
    }

    fn checkpoint(&self) -> protocol::ContentWorkflowState {
        let pending = self
            .pending
            .lock()
            .expect("pending taxonomy lock poisoned")
            .as_ref()
            .map(pending_to_protocol)
            .transpose()
            .expect("pending taxonomy state must serialize");
        self.workspace
            .persisted_state(pending, self.sync.persisted())
    }

    fn clear_pending(&self) {
        *self.pending.lock().expect("pending taxonomy lock poisoned") = None;
    }

    fn ensure_writable(&self) -> Result<(), ContentServiceError> {
        if let Some(message) = self
            .fail_closed
            .lock()
            .expect("content fail-closed lock poisoned")
            .clone()
        {
            return Err(ContentServiceError::FailClosed(message));
        }
        Ok(())
    }

    async fn persist_or_restore(
        &self,
        checkpoint: protocol::ContentWorkflowState,
    ) -> Result<(), ContentServiceError> {
        if let Err(error) = self.persist_current().await {
            self.workspace
                .restore_persisted(&checkpoint)
                .expect("validated workflow checkpoint must restore");
            let pending = checkpoint
                .pending_taxonomy_review
                .as_ref()
                .map(|pending| pending_from_protocol(pending, &self.workspace.view().snapshot))
                .transpose()
                .expect("validated pending checkpoint must restore");
            *self.pending.lock().expect("pending taxonomy lock poisoned") = pending;
            *self
                .fail_closed
                .lock()
                .expect("content fail-closed lock poisoned") = Some(error.to_string());
            return Err(error);
        }
        Ok(())
    }

    async fn persist_after_remote(&self) -> Result<(), ContentServiceError> {
        if let Err(error) = self.persist_current().await {
            *self
                .fail_closed
                .lock()
                .expect("content fail-closed lock poisoned") = Some(error.to_string());
            return Err(error);
        }
        Ok(())
    }

    async fn persist_failure_state(&self) {
        if let Err(error) = self.persist_current().await {
            *self
                .fail_closed
                .lock()
                .expect("content fail-closed lock poisoned") = Some(error.to_string());
        }
    }

    async fn recover_remote_operation(&self) -> Result<(), ContentServiceError> {
        let state = self.checkpoint();
        let Some(operation) = state.pending_remote_operation else {
            let view = self.workspace.view();
            if view.status == crate::content_workspace::WorkspaceStatus::Discarding
                && view.remote_batch.is_none()
            {
                self.workspace.complete_discard()?;
                return self.persist_after_remote().await;
            }
            return Ok(());
        };
        match operation.kind {
            protocol::ContentRemoteOperationKind::Submit => {
                let remote_operation = self.workspace.begin_submit(operation.workspace_version)?;
                let workspace = Arc::clone(&self.workspace);
                let result = tokio::task::spawn_blocking(move || {
                    workspace.execute_submit(&remote_operation)
                })
                .await
                .map_err(|error| {
                    ContentServiceError::Workspace(WorkspaceError::Remote(format!(
                        "recover submit task failed: {error}"
                    )))
                })??;
                self.workspace.complete_submit(result)?;
            }
            protocol::ContentRemoteOperationKind::Discard => {
                let remote_operation = self.workspace.begin_discard(operation.workspace_version)?;
                let workspace = Arc::clone(&self.workspace);
                tokio::task::spawn_blocking(move || workspace.execute_discard(&remote_operation))
                    .await
                    .map_err(|error| {
                        ContentServiceError::Workspace(WorkspaceError::Remote(format!(
                            "recover discard task failed: {error}"
                        )))
                    })??;
                self.workspace.complete_discard()?;
            }
        }
        self.persist_after_remote().await
    }

    async fn persist_current(&self) -> Result<(), ContentServiceError> {
        let expected_revision = *self
            .storage_revision
            .lock()
            .expect("workflow revision lock poisoned");
        let operation = protocol::DataOperation::ContentWorkflowWrite(Box::new(
            protocol::ContentWorkflowWrite {
                expected_revision,
                state: self.checkpoint(),
            },
        ));
        let trace = self
            .data
            .call("content-workflow-write", &operation, DATA_BUDGET)
            .await
            .map_err(ContentServiceError::Data)?;
        let protocol::DataOutcome::ContentWorkflow(Some(stored)) = trace.outcome else {
            return Err(ContentServiceError::Invalid(
                "Data returned an unexpected workflow write outcome".to_owned(),
            ));
        };
        *self
            .storage_revision
            .lock()
            .expect("workflow revision lock poisoned") = Some(stored.revision);
        Ok(())
    }
}

async fn call_workflow_get(
    data: &DataClient,
) -> Result<Option<protocol::StoredContentWorkflow>, ContentServiceError> {
    let trace = data
        .call(
            "product-startup-workflow",
            &protocol::DataOperation::ContentWorkflowGet,
            DATA_BUDGET,
        )
        .await
        .map_err(ContentServiceError::Data)?;
    match trace.outcome {
        protocol::DataOutcome::ContentWorkflow(value) => Ok(value),
        _ => Err(ContentServiceError::Invalid(
            "Data returned an unexpected workflow read outcome".to_owned(),
        )),
    }
}

async fn call_snapshot_get(
    data: &DataClient,
) -> Result<Option<protocol::StoredContentSnapshot>, ContentServiceError> {
    let trace = data
        .call(
            "product-startup-content",
            &protocol::DataOperation::ContentSnapshotGet,
            DATA_BUDGET,
        )
        .await
        .map_err(ContentServiceError::Data)?;
    match trace.outcome {
        protocol::DataOutcome::ContentSnapshot(stored) => Ok(stored),
        _ => Err(ContentServiceError::Invalid(
            "Data returned an unexpected content snapshot outcome".to_owned(),
        )),
    }
}

fn pending_to_protocol(
    pending: &PendingAnalysis,
) -> Result<protocol::PendingTaxonomyReview, serde_json::Error> {
    Ok(protocol::PendingTaxonomyReview {
        workspace_version: pending.workspace_version,
        prompt_version: TAXONOMY_PROMPT_VERSION.to_owned(),
        change_schema_version: CHANGE_SCHEMA_VERSION,
        article_ids: pending.article_ids.clone(),
        proposal_json: serde_json::to_string(&pending.changes)?,
        applied_snapshot: pending.applied.snapshot.clone(),
        diff_json: serde_json::to_string(&pending.applied.normalized_diff)?,
        warnings: pending.applied.warnings.clone(),
    })
}

fn pending_from_protocol(
    value: &protocol::PendingTaxonomyReview,
    current: &ContentSnapshot,
) -> Result<PendingAnalysis, ContentServiceError> {
    if value.prompt_version != TAXONOMY_PROMPT_VERSION
        || value.change_schema_version != CHANGE_SCHEMA_VERSION
    {
        return Err(ContentServiceError::Invalid(format!(
            "unsupported pending taxonomy versions prompt={:?} schema={}",
            value.prompt_version, value.change_schema_version
        )));
    }
    let changes: TaxonomyChangeSet =
        serde_json::from_str(&value.proposal_json).map_err(|error| {
            ContentServiceError::Invalid(format!("decode pending proposal: {error}"))
        })?;
    let stored_diff: crate::taxonomy_changes::NormalizedTaxonomyDiff =
        serde_json::from_str(&value.diff_json).map_err(|error| {
            ContentServiceError::Invalid(format!("decode pending normalized diff: {error}"))
        })?;
    let applied = crate::taxonomy_changes::apply_changes(current, &changes).map_err(|error| {
        ContentServiceError::Invalid(format!("re-apply pending taxonomy proposal: {error}"))
    })?;
    if applied.snapshot != value.applied_snapshot
        || applied.normalized_diff != stored_diff
        || applied.warnings != value.warnings
    {
        return Err(ContentServiceError::Invalid(
            "pending taxonomy proposal does not match its stored applied result".to_owned(),
        ));
    }
    Ok(PendingAnalysis {
        workspace_version: value.workspace_version,
        article_ids: value.article_ids.clone(),
        changes,
        applied,
    })
}
