//! Versioned content taxonomy and repository snapshot contracts.
//!
//! These DTOs are shared by Product and Data. Model adapters may propose changes,
//! but only Product allocates IDs and produces a validated [`ContentSnapshot`].

use serde::{Deserialize, Serialize};

pub const TAXONOMY_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct Taxonomy {
    pub version: u32,
    /// Next server-allocatable category ID. Existing IDs must be lower.
    pub next_category_id: i64,
    /// Next server-allocatable tag ID. Existing IDs must be lower.
    pub next_tag_id: i64,
    pub categories: Vec<Category>,
    pub tags: Vec<Tag>,
}

impl Default for Taxonomy {
    fn default() -> Self {
        Self {
            version: TAXONOMY_SCHEMA_VERSION,
            next_category_id: 1,
            next_tag_id: 1,
            categories: Vec::new(),
            tags: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    pub position: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct Tag {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct ContentArticleMeta {
    pub id: i64,
    pub title: String,
    pub summary: String,
    pub category_ids: Vec<i64>,
    pub tag_ids: Vec<i64>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct ContentArticle {
    pub meta: ContentArticleMeta,
    pub content_html: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct ContentSnapshot {
    pub taxonomy: Taxonomy,
    pub articles: Vec<ContentArticle>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct ContentSnapshotReplace {
    /// `None` creates the singleton only when no snapshot exists. `Some` must exactly match the
    /// currently stored source commit.
    pub expected_previous_commit: Option<String>,
    pub commit: String,
    pub snapshot: ContentSnapshot,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct StoredContentSnapshot {
    pub commit: String,
    pub snapshot: ContentSnapshot,
}

/// Persisted Product workspace state. Data stores this record atomically, but Product owns
/// its lifecycle and remote side effects.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContentWorkspaceStatus {
    Clean,
    Saved,
    Submitting,
    Discarding,
    Submitted,
    SubmittedWithChanges,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct ContentRemoteBatch {
    pub branch: String,
    pub pull_request: u64,
    pub commit: String,
    #[serde(default)]
    pub base_commit: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContentRemoteOperationKind {
    Submit,
    Discard,
}

/// Durable intent written before Product starts a remote side effect. It is sufficient to
/// determine whether a timed-out operation completed without creating a second branch or PR.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct ContentRemoteOperation {
    pub kind: ContentRemoteOperationKind,
    pub workspace_version: u64,
    pub branch: String,
    pub base_commit: String,
    pub target_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct ContentSyncState {
    pub target_commit: Option<String>,
    pub successful_commit: Option<String>,
    pub article_count: u64,
    pub last_error: Option<String>,
}

/// A generated taxonomy proposal waiting for its single model review.
///
/// `proposal_json` is a Product-owned, versioned change document. Data deliberately does not
/// interpret model prompts or change operations; it validates and persists the complete applied
/// snapshot that accompanies the proposal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct PendingTaxonomyReview {
    pub workspace_version: u64,
    pub prompt_version: String,
    pub change_schema_version: u32,
    pub article_ids: Vec<i64>,
    pub proposal_json: String,
    pub applied_snapshot: ContentSnapshot,
    pub diff_json: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct ContentWorkflowState {
    pub workspace_version: u64,
    pub committed_version: Option<u64>,
    pub status: ContentWorkspaceStatus,
    pub snapshot: ContentSnapshot,
    pub committed_snapshot: ContentSnapshot,
    pub batch_base_snapshot: ContentSnapshot,
    pub remote_batch: Option<ContentRemoteBatch>,
    pub last_error: Option<String>,
    pub known_article_ids: Vec<i64>,
    pub pending_taxonomy_review: Option<PendingTaxonomyReview>,
    /// Commit from which this workspace was based. Missing only for JSON persisted by the
    /// pre-GitHub workflow; Product fills it from StoredContentSnapshot before allowing submit.
    #[serde(default)]
    pub source_commit: Option<String>,
    #[serde(default)]
    pub pending_remote_operation: Option<ContentRemoteOperation>,
    #[serde(default)]
    pub sync: ContentSyncState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct ContentWorkflowWrite {
    /// `None` means create the singleton and is only valid while no record exists.
    pub expected_revision: Option<u64>,
    pub state: ContentWorkflowState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct StoredContentWorkflow {
    pub revision: u64,
    pub state: ContentWorkflowState,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_taxonomy_serializes_with_explicit_watermarks() {
        let json = serde_json::to_value(Taxonomy::default()).unwrap();
        assert_eq!(json["version"], TAXONOMY_SCHEMA_VERSION);
        assert_eq!(json["next_category_id"], 1);
        assert_eq!(json["next_tag_id"], 1);
        assert_eq!(json["categories"], serde_json::json!([]));
        assert_eq!(json["tags"], serde_json::json!([]));
    }

    #[test]
    fn snapshot_replace_serializes_its_explicit_compare_and_swap_base() {
        let operation = ContentSnapshotReplace {
            expected_previous_commit: Some("main-1".into()),
            commit: "main-2".into(),
            snapshot: ContentSnapshot::default(),
        };
        let json = serde_json::to_value(&operation).unwrap();
        assert_eq!(json["expected_previous_commit"], "main-1");
        assert_eq!(
            serde_json::from_value::<ContentSnapshotReplace>(json).unwrap(),
            operation
        );
    }
}
