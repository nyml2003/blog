//! Provider-neutral one-generation/one-review taxonomy model workflow.

use crate::content_contract::ContentSnapshot;
use crate::taxonomy_changes::{
    AppliedTaxonomyChanges, TaxonomyChangeSet, apply_changes_for_articles,
};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::fs::{OpenOptions, remove_file};
use std::io::{Read, Seek, SeekFrom, Write};
use std::process::{Command, Stdio};
use std::time::Duration;
use wait_timeout::ChildExt;

pub const TAXONOMY_PROMPT_VERSION: &str = "taxonomy-workflow/v1";
pub const MODEL_PROVIDER_ENV: &str = "BLOG_TAXONOMY_MODEL_PROVIDER";
pub const MODEL_COMMAND_ENV: &str = "BLOG_TAXONOMY_MODEL_COMMAND";

const MODEL_TIMEOUT: Duration = Duration::from_secs(45);
const MODEL_OUTPUT_LIMIT: u64 = 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelRequest {
    pub snapshot: ContentSnapshot,
    pub article_ids: Vec<i64>,
}

impl Serialize for ModelRequest {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        #[derive(Serialize)]
        struct Prompt<'a> {
            taxonomy: &'a protocol::Taxonomy,
            article_ids: &'a [i64],
            articles: Vec<&'a protocol::ContentSnapshotArticle>,
        }
        let selected = self
            .snapshot
            .articles
            .iter()
            .filter(|article| self.article_ids.contains(&article.meta.id))
            .collect();
        Prompt {
            taxonomy: &self.snapshot.taxonomy,
            article_ids: &self.article_ids,
            articles: selected,
        }
        .serialize(serializer)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReviewRequest {
    pub original: ContentSnapshot,
    pub proposed: TaxonomyChangeSet,
    pub applied: AppliedTaxonomyChanges,
    pub article_ids: Vec<i64>,
}

impl Serialize for ReviewRequest {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        #[derive(Serialize)]
        struct Prompt<'a> {
            original_taxonomy: &'a protocol::Taxonomy,
            proposed: &'a TaxonomyChangeSet,
            normalized_diff: &'a crate::taxonomy_changes::NormalizedTaxonomyDiff,
            warnings: &'a [String],
        }
        Prompt {
            original_taxonomy: &self.original.taxonomy,
            proposed: &self.proposed,
            normalized_diff: &self.applied.normalized_diff,
            warnings: &self.applied.warnings,
        }
        .serialize(serializer)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "decision", rename_all = "snake_case")]
pub enum ReviewDecision {
    Approve,
    Revise { changes: TaxonomyChangeSet },
    Reject { reason: String },
}

pub trait TaxonomyModel: Send {
    fn generate(&mut self, request: &ModelRequest) -> Result<TaxonomyChangeSet, String>;
    fn review(&mut self, request: &ReviewRequest) -> Result<ReviewDecision, String>;
}

pub struct ClaudeCliModel {
    command: String,
}

pub struct UnavailableModel {
    reason: String,
}

impl UnavailableModel {
    pub fn new(reason: impl Into<String>) -> Self {
        Self {
            reason: reason.into(),
        }
    }
}

impl TaxonomyModel for UnavailableModel {
    fn generate(&mut self, _: &ModelRequest) -> Result<TaxonomyChangeSet, String> {
        Err(self.reason.clone())
    }

    fn review(&mut self, _: &ReviewRequest) -> Result<ReviewDecision, String> {
        Err(self.reason.clone())
    }
}

impl ClaudeCliModel {
    pub fn from_env() -> Result<Self, String> {
        let provider = std::env::var(MODEL_PROVIDER_ENV)
            .map_err(|_| format!("{MODEL_PROVIDER_ENV} must be set to claude-cli"))?;
        if provider != "claude-cli" {
            return Err(format!(
                "unsupported taxonomy model provider {provider:?}; expected claude-cli"
            ));
        }
        let command = std::env::var(MODEL_COMMAND_ENV)
            .map_err(|_| format!("{MODEL_COMMAND_ENV} must name the Claude CLI executable"))?;
        if command.trim().is_empty() {
            return Err(format!("{MODEL_COMMAND_ENV} must not be empty"));
        }
        Ok(Self { command })
    }

    fn invoke<T: for<'de> Deserialize<'de>>(
        &self,
        task: &str,
        payload: &impl Serialize,
    ) -> Result<T, String> {
        let payload = serde_json::to_string(payload)
            .map_err(|error| format!("encode {task} model payload: {error}"))?;
        let prompt = format!(
            "Prompt version: {TAXONOMY_PROMPT_VERSION}\n\
             You are the taxonomy workflow model. Return one JSON document only, with no markdown.\n\
             Task: {task}.\n\
             Change documents use version 1 and an operations array. Operation names are add_category, move_category, rename_category, merge_category, add_tag, rename_tag, set_article_categories, and set_article_tags. Selectors use {{\"kind\":\"existing\",\"id\":1}} or {{\"kind\":\"proposed\",\"reference\":\"ref\"}}.\n\
             A review response is one of {{\"decision\":\"approve\"}}, {{\"decision\":\"revise\",\"changes\":...}}, or {{\"decision\":\"reject\",\"reason\":\"...\"}}.\n\
             Never return an empty operations array for generation or revision.\n\
             Input JSON:\n{payload}"
        );
        let nonce = format!(
            "{}-{}",
            std::process::id(),
            protocol::clock::now_utc_rfc3339()
                .bytes()
                .map(u64::from)
                .sum::<u64>()
        );
        let root = std::env::temp_dir();
        let stdout_path = root.join(format!("blog-taxonomy-model-{nonce}.out"));
        let stderr_path = root.join(format!("blog-taxonomy-model-{nonce}.err"));
        let mut stdout = OpenOptions::new()
            .create_new(true)
            .read(true)
            .write(true)
            .open(&stdout_path)
            .map_err(|_| "prepare Claude CLI output failed".to_owned())?;
        let stderr = OpenOptions::new()
            .create_new(true)
            .read(true)
            .write(true)
            .open(&stderr_path)
            .map_err(|_| {
                let _ = remove_file(&stdout_path);
                "prepare Claude CLI diagnostics failed".to_owned()
            })?;
        let mut child = Command::new(&self.command)
            .arg("-p")
            .arg("--output-format")
            .arg("text")
            .stdin(Stdio::piped())
            .stdout(Stdio::from(
                stdout
                    .try_clone()
                    .map_err(|_| "prepare Claude CLI output failed".to_owned())?,
            ))
            .stderr(Stdio::from(stderr))
            .spawn()
            .map_err(|_| "start Claude CLI failed".to_owned())?;
        child
            .stdin
            .as_mut()
            .ok_or_else(|| "Claude CLI stdin was not created".to_owned())?
            .write_all(prompt.as_bytes())
            .map_err(|_| "write Claude CLI prompt failed".to_owned())?;
        drop(child.stdin.take());
        let status = match child
            .wait_timeout(MODEL_TIMEOUT)
            .map_err(|_| "wait for Claude CLI failed".to_owned())?
        {
            Some(status) => status,
            None => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = remove_file(&stdout_path);
                let _ = remove_file(&stderr_path);
                return Err("Claude CLI exceeded its execution budget".to_owned());
            }
        };
        if !status.success() {
            let _ = remove_file(&stdout_path);
            let _ = remove_file(&stderr_path);
            return Err("Claude CLI returned an unsuccessful status".to_owned());
        }
        let size = stdout
            .metadata()
            .map_err(|_| "read Claude CLI output metadata failed".to_owned())?
            .len();
        if size > MODEL_OUTPUT_LIMIT {
            let _ = remove_file(&stdout_path);
            let _ = remove_file(&stderr_path);
            return Err("Claude CLI output exceeded its size limit".to_owned());
        }
        stdout
            .seek(SeekFrom::Start(0))
            .map_err(|_| "read Claude CLI output failed".to_owned())?;
        let mut bytes = Vec::with_capacity(size as usize);
        stdout
            .take(MODEL_OUTPUT_LIMIT + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "read Claude CLI output failed".to_owned())?;
        let _ = remove_file(&stdout_path);
        let _ = remove_file(&stderr_path);
        let raw = String::from_utf8(bytes)
            .map_err(|_| "Claude CLI returned non-UTF-8 output".to_owned())?;
        let json = strip_json_fence(raw.trim());
        serde_json::from_str(json)
            .map_err(|error| format!("decode Claude CLI {task} JSON: {error}"))
    }
}

impl TaxonomyModel for ClaudeCliModel {
    fn generate(&mut self, request: &ModelRequest) -> Result<TaxonomyChangeSet, String> {
        self.invoke("generate taxonomy changes", request)
    }

    fn review(&mut self, request: &ReviewRequest) -> Result<ReviewDecision, String> {
        self.invoke(
            "review the normalized applied taxonomy diff exactly once",
            request,
        )
    }
}

fn strip_json_fence(value: &str) -> &str {
    value
        .strip_prefix("```json")
        .or_else(|| value.strip_prefix("```"))
        .and_then(|value| value.strip_suffix("```"))
        .map(str::trim)
        .unwrap_or(value)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReviewError {
    Model(String),
    Invalid(String),
    Rejected(String),
}
impl fmt::Display for ReviewError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Model(v) => write!(f, "model failed: {v}"),
            Self::Invalid(v) => write!(f, "model changes invalid: {v}"),
            Self::Rejected(v) => write!(f, "model review rejected: {v}"),
        }
    }
}
impl std::error::Error for ReviewError {}

pub fn generate<M: TaxonomyModel + ?Sized>(
    model: &mut M,
    request: &ModelRequest,
) -> Result<(TaxonomyChangeSet, AppliedTaxonomyChanges), ReviewError> {
    let changes = model.generate(request).map_err(ReviewError::Model)?;
    if changes.operations.is_empty() {
        return Err(ReviewError::Invalid(
            "model generation returned no operations".to_owned(),
        ));
    }
    let applied = apply_changes_for_articles(&request.snapshot, &changes, &request.article_ids)
        .map_err(|error| ReviewError::Invalid(error.to_string()))?;
    Ok((changes, applied))
}

pub fn review<M: TaxonomyModel + ?Sized>(
    model: &mut M,
    request: &ReviewRequest,
) -> Result<AppliedTaxonomyChanges, ReviewError> {
    match model.review(request).map_err(ReviewError::Model)? {
        ReviewDecision::Approve => Ok(request.applied.clone()),
        ReviewDecision::Revise { changes } => {
            if changes.operations.is_empty() {
                return Err(ReviewError::Invalid(
                    "model revision returned no operations".to_owned(),
                ));
            }
            apply_changes_for_articles(&request.applied.snapshot, &changes, &request.article_ids)
                .map_err(|error| ReviewError::Invalid(error.to_string()))
        }
        ReviewDecision::Reject { reason } => Err(ReviewError::Rejected(reason)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::taxonomy_changes::{CHANGE_SCHEMA_VERSION, TaxonomyChange};
    use std::os::unix::fs::PermissionsExt;
    struct Model {
        calls: Vec<&'static str>,
        changes: TaxonomyChangeSet,
        review: ReviewDecision,
    }
    impl TaxonomyModel for Model {
        fn generate(&mut self, _: &ModelRequest) -> Result<TaxonomyChangeSet, String> {
            self.calls.push("generate");
            Ok(self.changes.clone())
        }
        fn review(&mut self, _: &ReviewRequest) -> Result<ReviewDecision, String> {
            self.calls.push("review");
            Ok(self.review.clone())
        }
    }
    #[test]
    fn approval_requires_one_generation_and_one_review() {
        let mut model = Model {
            calls: Vec::new(),
            changes: TaxonomyChangeSet {
                version: CHANGE_SCHEMA_VERSION,
                operations: vec![TaxonomyChange::AddTag {
                    reference: "new-tag".into(),
                    name: "New tag".into(),
                }],
            },
            review: ReviewDecision::Approve,
        };
        let request = ModelRequest {
            snapshot: ContentSnapshot::default(),
            article_ids: Vec::new(),
        };
        let (changes, applied) = generate(&mut model, &request).unwrap();
        review(
            &mut model,
            &ReviewRequest {
                original: request.snapshot,
                proposed: changes,
                applied,
                article_ids: request.article_ids,
            },
        )
        .unwrap();
        assert_eq!(model.calls, vec!["generate", "review"]);
    }

    #[test]
    fn claude_cli_uses_only_print_arguments_and_versioned_stdin() {
        let root =
            std::env::temp_dir().join(format!("taxonomy-claude-adapter-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let command = root.join("claude-fixture.sh");
        std::fs::write(
            &command,
            r#"#!/bin/sh
[ "$#" -eq 3 ] || exit 31
[ "$1" = "-p" ] || exit 32
[ "$2" = "--output-format" ] || exit 33
[ "$3" = "text" ] || exit 34
prompt=$(cat)
case "$prompt" in
  *"Prompt version: taxonomy-workflow/v1"*) ;;
  *) exit 35 ;;
esac
printf '%s\n' '{"version":1,"operations":[{"operation":"add_tag","reference":"adapter-test","name":"Adapter test"}]}'
"#,
        )
        .unwrap();
        let mut permissions = std::fs::metadata(&command).unwrap().permissions();
        permissions.set_mode(0o700);
        std::fs::set_permissions(&command, permissions).unwrap();
        let mut model = ClaudeCliModel {
            command: command.to_string_lossy().into_owned(),
        };
        let changes = model
            .generate(&ModelRequest {
                snapshot: ContentSnapshot::default(),
                article_ids: Vec::new(),
            })
            .unwrap();
        assert_eq!(changes.operations.len(), 1);
        let _ = std::fs::remove_dir_all(root);
    }
    #[test]
    fn invalid_revision_stops_without_a_third_call() {
        let mut model = Model {
            calls: Vec::new(),
            changes: TaxonomyChangeSet {
                version: CHANGE_SCHEMA_VERSION,
                operations: vec![TaxonomyChange::AddTag {
                    reference: "new-tag".into(),
                    name: "New tag".into(),
                }],
            },
            review: ReviewDecision::Revise {
                changes: TaxonomyChangeSet {
                    version: 1,
                    operations: vec![TaxonomyChange::RenameCategory {
                        category_id: 404,
                        name: "missing".into(),
                    }],
                },
            },
        };
        let request = ModelRequest {
            snapshot: ContentSnapshot::default(),
            article_ids: Vec::new(),
        };
        let (changes, applied) = generate(&mut model, &request).unwrap();
        assert!(matches!(
            review(
                &mut model,
                &ReviewRequest {
                    original: request.snapshot,
                    proposed: changes,
                    applied,
                    article_ids: request.article_ids,
                }
            ),
            Err(ReviewError::Invalid(_))
        ));
        assert_eq!(model.calls, vec!["generate", "review"]);
    }
    #[test]
    fn rejection_returns_no_applied_result() {
        let mut model = Model {
            calls: Vec::new(),
            changes: TaxonomyChangeSet {
                version: CHANGE_SCHEMA_VERSION,
                operations: vec![TaxonomyChange::AddTag {
                    reference: "new-tag".into(),
                    name: "New tag".into(),
                }],
            },
            review: ReviewDecision::Reject {
                reason: "needs human".into(),
            },
        };
        let request = ModelRequest {
            snapshot: ContentSnapshot::default(),
            article_ids: Vec::new(),
        };
        let (changes, applied) = generate(&mut model, &request).unwrap();
        assert!(matches!(
            review(
                &mut model,
                &ReviewRequest {
                    original: request.snapshot,
                    proposed: changes,
                    applied,
                    article_ids: request.article_ids,
                }
            ),
            Err(ReviewError::Rejected(_))
        ));
        assert_eq!(model.calls.len(), 2);
    }
}
