//! GitHub content transport and the isolated fixture remote.
//!
//! The production client is blocking by design. Product calls this boundary only inside
//! `spawn_blocking`, keeping DNS, TLS and response decoding off the current-thread runtime.

use std::cell::Cell;
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::io::Read as _;
use std::time::{Duration, Instant};

use base64::Engine as _;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::content_contract::{
    ArticleMeta, ContentArticle, ContentSnapshot, TaxonomyFile, validate_publishable_snapshot,
    validate_snapshot,
};

const MANAGED_PREFIX: &str = "blog-content/";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const OPERATION_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_OPERATION_REQUESTS: usize = 10_000;
const MAX_TREE_ENTRIES: usize = 4_100;
const MAX_ARTICLES: usize = 2_000;
const MAX_JSON_BYTES: usize = 512 * 1024;
const MAX_HTML_BYTES: usize = 4 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES: usize = 32 * 1024 * 1024;
const MAX_API_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
const MAX_HISTORY_PAGES: usize = 20;
const MAX_BRANCH_PAGES: usize = 100;
const MAX_MAIN_FIRST_PARENT_COMMITS: usize = 2_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteBatch {
    pub branch: String,
    pub pull_request: u64,
    pub commit: String,
    pub base_commit: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteSubmission {
    pub batch: RemoteBatch,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteMainSnapshot {
    pub commit: String,
    pub snapshot: ContentSnapshot,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteBatchState {
    Open,
    Merged,
    Closed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteSubmitIntent {
    pub branch: String,
    pub base_commit: String,
    pub target_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteError {
    code: &'static str,
    message: String,
}

impl RemoteError {
    pub fn new(message: impl Into<String>) -> Self {
        Self::coded("CONTENT_REMOTE_FAILED", message)
    }

    pub fn coded(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn code(&self) -> &'static str {
        self.code
    }
}

impl fmt::Display for RemoteError {
    fn fmt(&self, output: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(output, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for RemoteError {}

/// There is deliberately no merge method.
pub trait ContentRemote: Send + 'static {
    fn read_main_snapshot(&mut self) -> Result<RemoteMainSnapshot, RemoteError>;
    fn submit_batch(
        &mut self,
        snapshot: &ContentSnapshot,
        existing: Option<&RemoteBatch>,
        intent: &RemoteSubmitIntent,
    ) -> Result<RemoteSubmission, RemoteError>;
    fn batch_state(&mut self, batch: &RemoteBatch) -> Result<RemoteBatchState, RemoteError>;
    fn close_batch(&mut self, batch: &RemoteBatch) -> Result<(), RemoteError>;
}

pub enum ConfiguredRemote {
    Fixture(MockGithub),
    Github(GithubRemote),
    Unavailable(UnavailableRemote),
}

pub struct UnavailableRemote {
    message: String,
}

impl UnavailableRemote {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    fn error(&self) -> RemoteError {
        RemoteError::coded("CONTENT_REMOTE_UNAVAILABLE", self.message.clone())
    }
}

impl ContentRemote for ConfiguredRemote {
    fn read_main_snapshot(&mut self) -> Result<RemoteMainSnapshot, RemoteError> {
        match self {
            Self::Fixture(v) => v.read_main_snapshot(),
            Self::Github(v) => v.read_main_snapshot(),
            Self::Unavailable(v) => Err(v.error()),
        }
    }
    fn submit_batch(
        &mut self,
        snapshot: &ContentSnapshot,
        existing: Option<&RemoteBatch>,
        intent: &RemoteSubmitIntent,
    ) -> Result<RemoteSubmission, RemoteError> {
        match self {
            Self::Fixture(v) => v.submit_batch(snapshot, existing, intent),
            Self::Github(v) => v.submit_batch(snapshot, existing, intent),
            Self::Unavailable(v) => Err(v.error()),
        }
    }
    fn batch_state(&mut self, batch: &RemoteBatch) -> Result<RemoteBatchState, RemoteError> {
        match self {
            Self::Fixture(v) => v.batch_state(batch),
            Self::Github(v) => v.batch_state(batch),
            Self::Unavailable(v) => Err(v.error()),
        }
    }
    fn close_batch(&mut self, batch: &RemoteBatch) -> Result<(), RemoteError> {
        match self {
            Self::Fixture(v) => v.close_batch(batch),
            Self::Github(v) => v.close_batch(batch),
            Self::Unavailable(v) => Err(v.error()),
        }
    }
}

#[derive(Debug, Default)]
pub struct MockGithub {
    next_pull_request: u64,
    next_commit: u64,
    submissions: Vec<ContentSnapshot>,
    close_calls: usize,
    main: Option<RemoteMainSnapshot>,
    state: Option<RemoteBatchState>,
}

impl MockGithub {
    pub fn with_main(commit: impl Into<String>, snapshot: ContentSnapshot) -> Self {
        Self {
            main: Some(RemoteMainSnapshot {
                commit: commit.into(),
                snapshot,
            }),
            ..Self::default()
        }
    }
    pub fn submissions(&self) -> &[ContentSnapshot] {
        &self.submissions
    }
    pub fn close_calls(&self) -> usize {
        self.close_calls
    }
}

impl ContentRemote for MockGithub {
    fn read_main_snapshot(&mut self) -> Result<RemoteMainSnapshot, RemoteError> {
        self.main
            .clone()
            .ok_or_else(|| RemoteError::new("fixture main snapshot is not configured"))
    }
    fn submit_batch(
        &mut self,
        snapshot: &ContentSnapshot,
        existing: Option<&RemoteBatch>,
        intent: &RemoteSubmitIntent,
    ) -> Result<RemoteSubmission, RemoteError> {
        self.next_commit += 1;
        let batch = if let Some(existing) = existing {
            RemoteBatch {
                branch: existing.branch.clone(),
                pull_request: existing.pull_request,
                commit: format!("mock-commit-{}", self.next_commit),
                base_commit: existing.base_commit.clone(),
            }
        } else {
            self.next_pull_request += 1;
            RemoteBatch {
                branch: intent.branch.clone(),
                pull_request: self.next_pull_request,
                commit: format!("mock-commit-{}", self.next_commit),
                base_commit: intent.base_commit.clone(),
            }
        };
        self.submissions.push(snapshot.clone());
        self.state = Some(RemoteBatchState::Open);
        Ok(RemoteSubmission { batch })
    }
    fn batch_state(&mut self, _batch: &RemoteBatch) -> Result<RemoteBatchState, RemoteError> {
        Ok(self.state.unwrap_or(RemoteBatchState::Open))
    }
    fn close_batch(&mut self, _batch: &RemoteBatch) -> Result<(), RemoteError> {
        if self.state == Some(RemoteBatchState::Merged) {
            return Err(RemoteError::coded(
                "CONTENT_BATCH_MERGED",
                "a merged pull request cannot be abandoned",
            ));
        }
        self.close_calls += 1;
        self.state = Some(RemoteBatchState::Closed);
        Ok(())
    }
}

#[derive(Clone)]
pub struct GithubRemote {
    owner: String,
    repository: String,
    token: String,
    api_base: String,
    agent: ureq::Agent,
    operation_started: Cell<Option<Instant>>,
    operation_requests: Cell<usize>,
}

impl GithubRemote {
    pub fn production(repository: &str, token: &str) -> Result<Self, RemoteError> {
        Self::new(repository, token, "https://api.github.com", false)
    }

    pub fn for_test(repository: &str, token: &str, api_base: &str) -> Result<Self, RemoteError> {
        Self::new(repository, token, api_base, true)
    }

    fn new(
        repository: &str,
        token: &str,
        api_base: &str,
        test_origin: bool,
    ) -> Result<Self, RemoteError> {
        let (owner, repository) = parse_repository(repository)?;
        if token.trim().is_empty() || token.chars().any(char::is_whitespace) {
            return Err(RemoteError::coded(
                "CONTENT_SOURCE_CONFIG_INVALID",
                "BLOG_CONTENT_TOKEN must be non-empty and contain no whitespace",
            ));
        }
        if api_base != "https://api.github.com" && !(test_origin && is_loopback_http(api_base)) {
            return Err(RemoteError::coded(
                "CONTENT_SOURCE_CONFIG_INVALID",
                "GitHub API origin must be production HTTPS or an explicit loopback test server",
            ));
        }
        Ok(Self {
            owner,
            repository,
            token: token.to_owned(),
            api_base: api_base.trim_end_matches('/').to_owned(),
            agent: ureq::AgentBuilder::new().timeout(REQUEST_TIMEOUT).build(),
            operation_started: Cell::new(None),
            operation_requests: Cell::new(0),
        })
    }

    fn begin_operation(&self) {
        self.operation_started.set(Some(Instant::now()));
        self.operation_requests.set(0);
    }

    fn charge_request(&self) -> Result<Duration, RemoteError> {
        let started = match self.operation_started.get() {
            Some(started) => started,
            None => {
                let started = Instant::now();
                self.operation_started.set(Some(started));
                started
            }
        };
        let remaining = OPERATION_TIMEOUT
            .checked_sub(started.elapsed())
            .ok_or_else(|| {
                RemoteError::coded(
                    "CONTENT_REMOTE_BUDGET_EXCEEDED",
                    "GitHub operation exceeded its wall-clock budget",
                )
            })?;
        if remaining.is_zero() {
            return Err(RemoteError::coded(
                "CONTENT_REMOTE_BUDGET_EXCEEDED",
                "GitHub operation exceeded its wall-clock budget",
            ));
        }
        let next = self
            .operation_requests
            .get()
            .checked_add(1)
            .ok_or_else(|| {
                RemoteError::coded(
                    "CONTENT_REMOTE_BUDGET_EXCEEDED",
                    "GitHub operation request count overflowed",
                )
            })?;
        if next > MAX_OPERATION_REQUESTS {
            return Err(RemoteError::coded(
                "CONTENT_REMOTE_BUDGET_EXCEEDED",
                "GitHub operation exceeded its request budget",
            ));
        }
        self.operation_requests.set(next);
        Ok(remaining.min(REQUEST_TIMEOUT))
    }

    fn url(&self, suffix: &str) -> String {
        format!(
            "{}/repos/{}/{}/{}",
            self.api_base, self.owner, self.repository, suffix
        )
    }

    fn request(&self, method: &str, suffix: &str) -> Result<ureq::Request, RemoteError> {
        let timeout = self.charge_request()?;
        Ok(self
            .agent
            .request(method, &self.url(suffix))
            .timeout(timeout)
            .set("Accept", "application/vnd.github+json")
            .set("Authorization", &format!("Bearer {}", self.token))
            .set("X-GitHub-Api-Version", "2022-11-28")
            .set("User-Agent", "nyml-blog-content/1"))
    }

    fn get(&self, suffix: &str) -> Result<Value, RemoteError> {
        self.response(self.request("GET", suffix)?.call())
    }
    fn send(&self, method: &str, suffix: &str, body: Value) -> Result<Value, RemoteError> {
        self.response(self.request(method, suffix)?.send_json(body))
    }
    fn response(
        &self,
        response: Result<ureq::Response, ureq::Error>,
    ) -> Result<Value, RemoteError> {
        let response = match response {
            Ok(v) => v,
            Err(ureq::Error::Status(status, _)) => {
                return Err(RemoteError::coded(
                    "CONTENT_GITHUB_HTTP",
                    format!("GitHub API returned HTTP {status}"),
                ));
            }
            Err(ureq::Error::Transport(_)) => {
                return Err(RemoteError::coded(
                    "CONTENT_GITHUB_UNAVAILABLE",
                    "GitHub transport is unavailable",
                ));
            }
        };
        decode_response(response)
    }

    fn main_commit(&self) -> Result<String, RemoteError> {
        string_at(
            &self.get("git/ref/heads/main")?,
            &["object", "sha"],
            "main commit",
        )
    }

    fn main_commit_optional(&self) -> Result<Option<String>, RemoteError> {
        match self.request("GET", "git/ref/heads/main")?.call() {
            Ok(response) => decode_response(response)
                .and_then(|value| string_at(&value, &["object", "sha"], "main commit").map(Some)),
            Err(ureq::Error::Status(404 | 409, _)) => Ok(None),
            other => self
                .response(other)
                .and_then(|value| string_at(&value, &["object", "sha"], "main commit").map(Some)),
        }
    }

    fn branch_commit(&self, branch: &str) -> Result<Option<String>, RemoteError> {
        let suffix = format!("git/ref/heads/{}", path_segment(branch));
        match self.request("GET", &suffix)?.call() {
            Ok(v) => decode_response(v)
                .and_then(|v| string_at(&v, &["object", "sha"], "branch commit").map(Some)),
            Err(ureq::Error::Status(404, _)) => Ok(None),
            other => self
                .response(other)
                .and_then(|v| string_at(&v, &["object", "sha"], "branch commit").map(Some)),
        }
    }

    fn managed_branches(&self) -> Result<Vec<String>, RemoteError> {
        let mut branches = BTreeSet::new();
        for page in 1..=MAX_BRANCH_PAGES {
            let value = self.get(&format!("branches?per_page=100&page={page}"))?;
            let array = value.as_array().ok_or_else(|| {
                RemoteError::coded(
                    "CONTENT_GITHUB_INVALID_RESPONSE",
                    "branches response is not an array",
                )
            })?;
            for value in array {
                if let Some(name) = value.get("name").and_then(Value::as_str) {
                    if name.starts_with(MANAGED_PREFIX) {
                        branches.insert(name.to_owned());
                    }
                }
            }
            if array.len() < 100 {
                break;
            }
            if page == MAX_BRANCH_PAGES {
                return Err(RemoteError::coded(
                    "CONTENT_REPOSITORY_LIMIT",
                    "repository branch listing exceeds its pagination limit",
                ));
            }
        }

        let mut active = Vec::new();
        for branch in branches {
            match self.find_pull_request(&branch)? {
                Some((_, RemoteBatchState::Open)) => active.push(branch),
                Some((_, RemoteBatchState::Merged | RemoteBatchState::Closed)) => {}
                None => {
                    let head = self.branch_commit(&branch)?.ok_or_else(|| {
                        RemoteError::coded(
                            "CONTENT_REMOTE_AMBIGUOUS",
                            "a listed managed branch could not be resolved",
                        )
                    })?;
                    if self.commit_marker(&head)?.is_some() {
                        active.push(branch);
                    } else {
                        return Err(RemoteError::coded(
                            "CONTENT_REMOTE_AMBIGUOUS",
                            "a managed branch without a pull request has no recoverable marker",
                        ));
                    }
                }
            }
        }
        if active.len() > 1 {
            return Err(RemoteError::coded(
                "CONTENT_REMOTE_AMBIGUOUS",
                "multiple active managed content branches exist",
            ));
        }
        Ok(active)
    }

    fn read_files(&self, commit: &str) -> Result<BTreeMap<String, Vec<u8>>, RemoteError> {
        let value = self.get(&format!("git/trees/{commit}?recursive=1"))?;
        if value.get("truncated").and_then(Value::as_bool) != Some(false) {
            return Err(RemoteError::coded(
                "CONTENT_REPOSITORY_TRUNCATED",
                "GitHub returned a truncated repository tree",
            ));
        }
        let entries = value.get("tree").and_then(Value::as_array).ok_or_else(|| {
            RemoteError::coded(
                "CONTENT_GITHUB_INVALID_RESPONSE",
                "tree response is missing entries",
            )
        })?;
        if entries.len() > MAX_TREE_ENTRIES {
            return Err(RemoteError::coded(
                "CONTENT_REPOSITORY_LIMIT",
                "repository has too many entries",
            ));
        }
        let mut result = BTreeMap::new();
        let mut total = 0usize;
        for entry in entries {
            let path = required_str(entry, "path", "tree path")?;
            let kind = required_str(entry, "type", "tree type")?;
            let mode = required_str(entry, "mode", "tree mode")?;
            if kind == "tree" && valid_directory(path) {
                continue;
            }
            if kind != "blob" || mode != "100644" || !valid_file(path) {
                return Err(RemoteError::coded(
                    "CONTENT_REPOSITORY_LAYOUT",
                    format!("unsupported repository entry {path:?}"),
                ));
            }
            let limit = if path.ends_with("content.html") {
                MAX_HTML_BYTES
            } else {
                MAX_JSON_BYTES
            };
            if entry
                .get("size")
                .and_then(Value::as_u64)
                .is_some_and(|v| v > limit as u64)
            {
                return Err(RemoteError::coded(
                    "CONTENT_REPOSITORY_LIMIT",
                    format!("repository file {path:?} exceeds its limit"),
                ));
            }
            let bytes = self.read_blob(required_str(entry, "sha", "blob sha")?, limit)?;
            total = total.checked_add(bytes.len()).ok_or_else(|| {
                RemoteError::coded("CONTENT_REPOSITORY_LIMIT", "snapshot size overflow")
            })?;
            if total > MAX_SNAPSHOT_BYTES {
                return Err(RemoteError::coded(
                    "CONTENT_REPOSITORY_LIMIT",
                    "snapshot exceeds its total size limit",
                ));
            }
            if result.insert(path.to_owned(), bytes).is_some() {
                return Err(RemoteError::coded(
                    "CONTENT_REPOSITORY_LAYOUT",
                    "duplicate repository path",
                ));
            }
        }
        Ok(result)
    }

    fn read_blob(&self, sha: &str, limit: usize) -> Result<Vec<u8>, RemoteError> {
        let value = self.get(&format!("git/blobs/{sha}"))?;
        if value.get("encoding").and_then(Value::as_str) != Some("base64") {
            return Err(RemoteError::coded(
                "CONTENT_GITHUB_INVALID_RESPONSE",
                "blob is not base64 encoded",
            ));
        }
        let compact = required_str(&value, "content", "blob content")?
            .bytes()
            .filter(|v| !v.is_ascii_whitespace())
            .collect::<Vec<_>>();
        if compact.len() > limit.saturating_mul(2) {
            return Err(RemoteError::coded(
                "CONTENT_REPOSITORY_LIMIT",
                "encoded blob exceeds its limit",
            ));
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(compact)
            .map_err(|_| {
                RemoteError::coded(
                    "CONTENT_GITHUB_INVALID_RESPONSE",
                    "blob contains invalid base64",
                )
            })?;
        if bytes.len() > limit {
            return Err(RemoteError::coded(
                "CONTENT_REPOSITORY_LIMIT",
                "decoded blob exceeds its limit",
            ));
        }
        Ok(bytes)
    }

    fn publication_history(
        &self,
        article_ids: &BTreeSet<i64>,
        main_commit: &str,
    ) -> Result<BTreeMap<i64, String>, RemoteError> {
        if article_ids.is_empty() {
            return Ok(BTreeMap::new());
        }
        let mut current = main_commit.to_owned();
        let mut oldest = BTreeMap::new();
        let mut reached_root = false;
        for _ in 0..MAX_MAIN_FIRST_PARENT_COMMITS {
            let mut commit = None;
            let mut changed_paths = BTreeSet::new();
            for page in 1..=MAX_HISTORY_PAGES {
                let value = self.get(&format!("commits/{current}?per_page=100&page={page}"))?;
                let files = value
                    .get("files")
                    .and_then(Value::as_array)
                    .ok_or_else(|| {
                        RemoteError::coded(
                            "CONTENT_GITHUB_INVALID_RESPONSE",
                            "first-parent commit is missing its changed files",
                        )
                    })?;
                for file in files {
                    changed_paths
                        .insert(required_str(file, "filename", "changed file path")?.to_owned());
                }
                let file_count = files.len();
                if commit.is_none() {
                    commit = Some(value);
                }
                if file_count < 100 {
                    break;
                }
                if page == MAX_HISTORY_PAGES {
                    return Err(RemoteError::coded(
                        "CONTENT_REPOSITORY_LIMIT",
                        "a first-parent commit changes too many files",
                    ));
                }
            }
            let commit = commit.expect("history page loop always executes");
            let date = commit
                .pointer("/commit/committer/date")
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    RemoteError::coded(
                        "CONTENT_GITHUB_INVALID_RESPONSE",
                        "first-parent commit has no committer timestamp",
                    )
                })?;
            for article_id in article_ids {
                let path = format!("articles/{article_id}/meta.json");
                if changed_paths.contains(&path) {
                    oldest.insert(*article_id, date.to_owned());
                }
            }
            let Some(parent) = commit.pointer("/parents/0/sha").and_then(Value::as_str) else {
                reached_root = true;
                break;
            };
            current = parent.to_owned();
        }
        if !reached_root {
            return Err(RemoteError::coded(
                "CONTENT_REPOSITORY_LIMIT",
                "main first-parent history exceeds its supported limit",
            ));
        }
        if let Some(article_id) = article_ids.iter().find(|id| !oldest.contains_key(id)) {
            return Err(RemoteError::coded(
                "CONTENT_PUBLICATION_HISTORY",
                format!("article {article_id} has no first-parent main history"),
            ));
        }
        Ok(oldest)
    }

    fn create_blob(&self, bytes: &[u8]) -> Result<String, RemoteError> {
        let value = self.send(
            "POST",
            "git/blobs",
            json!({
                "content": base64::engine::general_purpose::STANDARD.encode(bytes),
                "encoding": "base64"
            }),
        )?;
        string_at(&value, &["sha"], "created blob sha")
    }

    fn create_target_tree(
        &self,
        branch_head: &str,
        snapshot: &ContentSnapshot,
    ) -> Result<String, RemoteError> {
        let current = self.read_files(branch_head)?;
        let target = encode_snapshot(snapshot)?;
        let mut entries = Vec::new();
        for path in current.keys().filter(|path| !target.contains_key(*path)) {
            entries
                .push(json!({"path": path, "mode": "100644", "type": "blob", "sha": Value::Null}));
        }
        for (path, bytes) in target {
            entries.push(json!({"path": path, "mode": "100644", "type": "blob", "sha": self.create_blob(&bytes)?}));
        }
        let value = self.send(
            "POST",
            "git/trees",
            json!({"base_tree": branch_head, "tree": entries}),
        )?;
        string_at(&value, &["sha"], "created tree sha")
    }

    fn commit_marker(&self, commit: &str) -> Result<Option<String>, RemoteError> {
        let value = self.get(&format!("commits/{commit}"))?;
        let message = value
            .pointer("/commit/message")
            .and_then(Value::as_str)
            .unwrap_or_default();
        Ok(message
            .split_whitespace()
            .find_map(|part| part.strip_prefix("blog-content-digest:"))
            .map(ToOwned::to_owned))
    }

    fn find_pull_request(
        &self,
        branch: &str,
    ) -> Result<Option<(u64, RemoteBatchState)>, RemoteError> {
        let head = query_component(&format!("{}:{branch}", self.owner));
        let value = self.get(&format!(
            "pulls?state=all&head={head}&base=main&per_page=100"
        ))?;
        let pulls = value.as_array().ok_or_else(|| {
            RemoteError::coded(
                "CONTENT_GITHUB_INVALID_RESPONSE",
                "pull request query is not an array",
            )
        })?;
        if pulls.len() > 1 {
            return Err(RemoteError::coded(
                "CONTENT_REMOTE_AMBIGUOUS",
                "multiple pull requests exist for the managed branch",
            ));
        }
        pulls.first().map(parse_pull_state).transpose()
    }

    fn create_pull_request(&self, branch: &str) -> Result<u64, RemoteError> {
        let value = self.send(
            "POST",
            "pulls",
            json!({
                "title": "Update blog content",
                "head": branch,
                "base": "main",
                "body": "Managed by the blog content workflow. Merge is always manual."
            }),
        )?;
        value.get("number").and_then(Value::as_u64).ok_or_else(|| {
            RemoteError::coded(
                "CONTENT_GITHUB_INVALID_RESPONSE",
                "created pull request number is missing",
            )
        })
    }

    fn pull_state(&self, batch: &RemoteBatch) -> Result<RemoteBatchState, RemoteError> {
        parse_pull_state(&self.get(&format!("pulls/{}", batch.pull_request))?)
            .map(|(_, state)| state)
    }

    pub fn initialize_empty_main(&mut self) -> Result<String, RemoteError> {
        self.begin_operation();
        if let Some(commit) = self.main_commit_optional()? {
            self.verify_empty_repository(&commit)?;
            return Ok(commit);
        }
        let branches = self.get("branches?per_page=2&page=1")?;
        let branches = branches.as_array().ok_or_else(|| {
            RemoteError::coded(
                "CONTENT_GITHUB_INVALID_RESPONSE",
                "branches response is not an array",
            )
        })?;
        if !branches.is_empty() {
            return Err(RemoteError::coded(
                "CONTENT_REPOSITORY_NOT_EMPTY",
                "repository has branches but no main branch",
            ));
        }

        let taxonomy = pretty_json(&ContentSnapshot::default().taxonomy)?;
        let create_result = self.send(
            "PUT",
            "contents/taxonomy.json",
            json!({
                "message": "Initialize empty blog content repository",
                "content": base64::engine::general_purpose::STANDARD.encode(taxonomy),
                "branch": "main",
            }),
        );

        // GitHub can accept the commit and then lose the response, or another initializer can
        // win the create-file race. Only the observed main tree proves initialization succeeded.
        match self.main_commit_optional() {
            Ok(Some(commit)) => {
                self.verify_empty_repository(&commit)?;
                Ok(commit)
            }
            Ok(None) => match create_result {
                Ok(_) => Err(RemoteError::coded(
                    "CONTENT_GITHUB_INVALID_RESPONSE",
                    "GitHub accepted repository initialization but main is still missing",
                )),
                Err(create_error) => Err(create_error),
            },
            Err(recovery_error) => Err(recovery_error),
        }
    }

    fn verify_empty_repository(&self, commit: &str) -> Result<(), RemoteError> {
        let snapshot = decode_snapshot(self.read_files(commit)?)?;
        if snapshot != ContentSnapshot::default() {
            return Err(RemoteError::coded(
                "CONTENT_REPOSITORY_NOT_EMPTY",
                "main is already initialized with non-empty or incompatible content",
            ));
        }
        validate_publishable_snapshot(&snapshot)
            .map_err(|error| RemoteError::coded("CONTENT_REPOSITORY_INVALID", error.to_string()))
    }

    #[cfg(test)]
    fn request_count(&self) -> usize {
        self.operation_requests.get()
    }
}

impl ContentRemote for GithubRemote {
    fn read_main_snapshot(&mut self) -> Result<RemoteMainSnapshot, RemoteError> {
        self.begin_operation();
        let commit = self.main_commit()?;
        let mut snapshot = decode_snapshot(self.read_files(&commit)?)?;
        let article_ids = snapshot
            .articles
            .iter()
            .map(|article| article.meta.id)
            .collect();
        let publication_history = self.publication_history(&article_ids, &commit)?;
        for article in &mut snapshot.articles {
            article.meta.published_at = publication_history.get(&article.meta.id).cloned();
        }
        validate_publishable_snapshot(&snapshot).map_err(|error| {
            RemoteError::coded(
                "CONTENT_REPOSITORY_INVALID",
                format!("main snapshot failed Product validation: {error}"),
            )
        })?;
        Ok(RemoteMainSnapshot { commit, snapshot })
    }

    fn submit_batch(
        &mut self,
        snapshot: &ContentSnapshot,
        existing: Option<&RemoteBatch>,
        intent: &RemoteSubmitIntent,
    ) -> Result<RemoteSubmission, RemoteError> {
        validate_publishable_snapshot(snapshot)
            .map_err(|error| RemoteError::coded("CONTENT_REPOSITORY_INVALID", error.to_string()))?;
        let actual_digest = snapshot_digest(snapshot)?;
        if actual_digest != intent.target_digest {
            return Err(RemoteError::coded(
                "CONTENT_REMOTE_INTENT_INVALID",
                "remote submit intent does not match the target snapshot",
            ));
        }
        if !intent.branch.starts_with(MANAGED_PREFIX) || intent.base_commit.trim().is_empty() {
            return Err(RemoteError::coded(
                "CONTENT_REMOTE_INTENT_INVALID",
                "remote submit intent is incomplete",
            ));
        }
        self.begin_operation();
        let main = self.main_commit()?;
        if main != intent.base_commit {
            return Err(RemoteError::coded(
                "CONTENT_MAIN_DRIFT",
                "main changed after the workspace base was synchronized",
            ));
        }
        let managed = self.managed_branches()?;
        if managed
            .first()
            .is_some_and(|branch| branch != &intent.branch)
        {
            return Err(RemoteError::coded(
                "CONTENT_REMOTE_AMBIGUOUS",
                "a different managed content branch already exists",
            ));
        }
        let mut branch_head = match self.branch_commit(&intent.branch)? {
            Some(head) => head,
            None => {
                self.send(
                    "POST",
                    "git/refs",
                    json!({"ref": format!("refs/heads/{}", intent.branch), "sha": main}),
                )?;
                main.clone()
            }
        };
        let already_written = self
            .commit_marker(&branch_head)?
            .is_some_and(|digest| digest == intent.target_digest);
        if already_written {
            let recovered = decode_snapshot(self.read_files(&branch_head)?)?;
            let recovered_digest = snapshot_digest(&recovered)?;
            if recovered_digest != intent.target_digest || recovered != *snapshot {
                return Err(RemoteError::coded(
                    "CONTENT_REMOTE_RECOVERY_MISMATCH",
                    "managed branch marker does not match its repository snapshot",
                ));
            }
        }
        if !already_written {
            if existing.is_some_and(|batch| branch_head != batch.commit) {
                return Err(RemoteError::coded(
                    "CONTENT_REMOTE_HEAD_CHANGED",
                    "managed branch head changed outside the workflow",
                ));
            }
            if existing.is_none() && branch_head != main {
                return Err(RemoteError::coded(
                    "CONTENT_REMOTE_HEAD_CHANGED",
                    "new managed branch contains an unknown commit",
                ));
            }
            let tree = self.create_target_tree(&branch_head, snapshot)?;
            let value = self.send("POST", "git/commits", json!({
                "message": format!("Update blog content\n\nblog-content-digest:{}", intent.target_digest),
                "tree": tree,
                "parents": [branch_head]
            }))?;
            branch_head = string_at(&value, &["sha"], "created commit sha")?;
            self.send(
                "PATCH",
                &format!("git/refs/heads/{}", path_segment(&intent.branch)),
                json!({"sha": branch_head, "force": false}),
            )?;
        }
        let pull_request = match self.find_pull_request(&intent.branch)? {
            Some((number, RemoteBatchState::Open)) => number,
            Some((_, RemoteBatchState::Merged | RemoteBatchState::Closed)) => {
                return Err(RemoteError::coded(
                    "CONTENT_BATCH_CLOSED",
                    "managed branch belongs to a closed pull request",
                ));
            }
            None => self.create_pull_request(&intent.branch)?,
        };
        Ok(RemoteSubmission {
            batch: RemoteBatch {
                branch: intent.branch.clone(),
                pull_request,
                commit: branch_head,
                base_commit: intent.base_commit.clone(),
            },
        })
    }

    fn batch_state(&mut self, batch: &RemoteBatch) -> Result<RemoteBatchState, RemoteError> {
        self.begin_operation();
        self.pull_state(batch)
    }

    fn close_batch(&mut self, batch: &RemoteBatch) -> Result<(), RemoteError> {
        self.begin_operation();
        if self.pull_state(batch)? == RemoteBatchState::Merged {
            return Err(RemoteError::coded(
                "CONTENT_BATCH_MERGED",
                "a merged pull request cannot be abandoned",
            ));
        }
        self.send(
            "PATCH",
            &format!("pulls/{}", batch.pull_request),
            json!({"state": "closed"}),
        )?;
        if self.pull_state(batch)? != RemoteBatchState::Closed {
            return Err(RemoteError::coded(
                "CONTENT_BATCH_CLOSE_UNCONFIRMED",
                "GitHub did not confirm that the pull request is closed",
            ));
        }
        Ok(())
    }
}

pub fn snapshot_digest(snapshot: &ContentSnapshot) -> Result<String, RemoteError> {
    let mut digest = Sha256::new();
    for (path, bytes) in encode_snapshot(snapshot)? {
        digest.update((path.len() as u64).to_be_bytes());
        digest.update(path.as_bytes());
        digest.update((bytes.len() as u64).to_be_bytes());
        digest.update(bytes);
    }
    Ok(format!("{:x}", digest.finalize()))
}

pub fn managed_branch(workspace_version: u64, digest: &str) -> String {
    format!(
        "{MANAGED_PREFIX}v{workspace_version}-{}",
        digest.get(..12).unwrap_or(digest)
    )
}

fn encode_snapshot(snapshot: &ContentSnapshot) -> Result<BTreeMap<String, Vec<u8>>, RemoteError> {
    validate_snapshot(snapshot)
        .map_err(|error| RemoteError::coded("CONTENT_REPOSITORY_INVALID", error.to_string()))?;
    if snapshot.articles.len() > MAX_ARTICLES {
        return Err(RemoteError::coded(
            "CONTENT_REPOSITORY_LIMIT",
            "snapshot has too many articles",
        ));
    }
    let mut files = BTreeMap::new();
    files.insert("taxonomy.json".to_owned(), pretty_json(&snapshot.taxonomy)?);
    for article in &snapshot.articles {
        let root = format!("articles/{}", article.meta.id);
        files.insert(format!("{root}/meta.json"), pretty_json(&article.meta)?);
        files.insert(
            format!("{root}/content.html"),
            article.content_html.as_bytes().to_vec(),
        );
    }
    Ok(files)
}

fn decode_snapshot(mut files: BTreeMap<String, Vec<u8>>) -> Result<ContentSnapshot, RemoteError> {
    let taxonomy_bytes = files.remove("taxonomy.json").ok_or_else(|| {
        RemoteError::coded("CONTENT_REPOSITORY_LAYOUT", "taxonomy.json is missing")
    })?;
    let taxonomy: TaxonomyFile = serde_json::from_slice(&taxonomy_bytes).map_err(|error| {
        RemoteError::coded(
            "CONTENT_REPOSITORY_INVALID",
            format!("taxonomy.json is invalid: {error}"),
        )
    })?;
    let mut ids = BTreeSet::new();
    for path in files.keys() {
        let parts = path.split('/').collect::<Vec<_>>();
        if parts.len() != 3 {
            return Err(RemoteError::coded(
                "CONTENT_REPOSITORY_LAYOUT",
                format!("invalid content path {path:?}"),
            ));
        }
        let id = parts[1].parse::<i64>().map_err(|_| {
            RemoteError::coded(
                "CONTENT_REPOSITORY_LAYOUT",
                format!("invalid article directory in {path:?}"),
            )
        })?;
        if id <= 0 || parts[1] != id.to_string() {
            return Err(RemoteError::coded(
                "CONTENT_REPOSITORY_LAYOUT",
                format!("non-canonical article directory in {path:?}"),
            ));
        }
        ids.insert(id);
    }
    if ids.len() > MAX_ARTICLES {
        return Err(RemoteError::coded(
            "CONTENT_REPOSITORY_LIMIT",
            "repository has too many articles",
        ));
    }
    let mut articles = Vec::new();
    for id in ids {
        let meta_path = format!("articles/{id}/meta.json");
        let html_path = format!("articles/{id}/content.html");
        let meta_bytes = files.remove(&meta_path).ok_or_else(|| {
            RemoteError::coded(
                "CONTENT_REPOSITORY_LAYOUT",
                format!("{meta_path} is missing"),
            )
        })?;
        let meta: ArticleMeta = serde_json::from_slice(&meta_bytes).map_err(|error| {
            RemoteError::coded(
                "CONTENT_REPOSITORY_INVALID",
                format!("{meta_path} is invalid: {error}"),
            )
        })?;
        if meta.id != id {
            return Err(RemoteError::coded(
                "CONTENT_REPOSITORY_LAYOUT",
                format!("{meta_path} id does not match its directory"),
            ));
        }
        let html = files.remove(&html_path).ok_or_else(|| {
            RemoteError::coded(
                "CONTENT_REPOSITORY_LAYOUT",
                format!("{html_path} is missing"),
            )
        })?;
        let content_html = String::from_utf8(html).map_err(|_| {
            RemoteError::coded(
                "CONTENT_REPOSITORY_INVALID",
                format!("{html_path} is not UTF-8"),
            )
        })?;
        articles.push(ContentArticle { meta, content_html });
    }
    if !files.is_empty() {
        return Err(RemoteError::coded(
            "CONTENT_REPOSITORY_LAYOUT",
            "repository has unmatched article files",
        ));
    }
    let snapshot = ContentSnapshot { taxonomy, articles };
    validate_snapshot(&snapshot)
        .map_err(|error| RemoteError::coded("CONTENT_REPOSITORY_INVALID", error.to_string()))?;
    Ok(snapshot)
}

fn pretty_json(value: &impl serde::Serialize) -> Result<Vec<u8>, RemoteError> {
    let mut bytes = serde_json::to_vec_pretty(value).map_err(|_| {
        RemoteError::coded(
            "CONTENT_REPOSITORY_INVALID",
            "content JSON could not be encoded",
        )
    })?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn valid_directory(path: &str) -> bool {
    path == "articles"
        || path.strip_prefix("articles/").is_some_and(|id| {
            id.parse::<i64>()
                .is_ok_and(|v| v > 0 && id == v.to_string())
        })
}
fn valid_file(path: &str) -> bool {
    if path == "taxonomy.json" {
        return true;
    }
    let p = path.split('/').collect::<Vec<_>>();
    p.len() == 3
        && p[0] == "articles"
        && p[1]
            .parse::<i64>()
            .is_ok_and(|v| v > 0 && p[1] == v.to_string())
        && matches!(p[2], "meta.json" | "content.html")
}
fn parse_repository(value: &str) -> Result<(String, String), RemoteError> {
    let p = value.split('/').collect::<Vec<_>>();
    if p.len() != 2 || p.iter().any(|v| !valid_repo_part(v)) {
        return Err(RemoteError::coded(
            "CONTENT_SOURCE_CONFIG_INVALID",
            "BLOG_CONTENT_REPO must be owner/repository",
        ));
    }
    Ok((p[0].to_owned(), p[1].to_owned()))
}
fn valid_repo_part(v: &str) -> bool {
    !v.is_empty()
        && v.len() <= 100
        && v.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
}
fn is_loopback_http(v: &str) -> bool {
    v.strip_prefix("http://127.0.0.1:")
        .or_else(|| v.strip_prefix("http://[::1]:"))
        .is_some_and(|p| p.parse::<u16>().is_ok())
}
fn parse_pull_state(v: &Value) -> Result<(u64, RemoteBatchState), RemoteError> {
    let number = v.get("number").and_then(Value::as_u64).ok_or_else(|| {
        RemoteError::coded(
            "CONTENT_GITHUB_INVALID_RESPONSE",
            "pull request number is missing",
        )
    })?;
    let merged = v.get("merged_at").is_some_and(|v| !v.is_null())
        || v.get("merged").and_then(Value::as_bool) == Some(true);
    let state = if merged {
        RemoteBatchState::Merged
    } else if v.get("state").and_then(Value::as_str) == Some("open") {
        RemoteBatchState::Open
    } else {
        RemoteBatchState::Closed
    };
    Ok((number, state))
}
fn required_str<'a>(v: &'a Value, key: &str, label: &str) -> Result<&'a str, RemoteError> {
    v.get(key).and_then(Value::as_str).ok_or_else(|| {
        RemoteError::coded(
            "CONTENT_GITHUB_INVALID_RESPONSE",
            format!("GitHub response is missing {label}"),
        )
    })
}
fn decode_response(response: ureq::Response) -> Result<Value, RemoteError> {
    let mut reader = response
        .into_reader()
        .take((MAX_API_RESPONSE_BYTES + 1) as u64);
    let mut body = Vec::new();
    reader.read_to_end(&mut body).map_err(|_| {
        RemoteError::coded(
            "CONTENT_GITHUB_INVALID_RESPONSE",
            "GitHub API response could not be read",
        )
    })?;
    if body.len() > MAX_API_RESPONSE_BYTES {
        return Err(RemoteError::coded(
            "CONTENT_GITHUB_INVALID_RESPONSE",
            "GitHub API response exceeds its size limit",
        ));
    }
    serde_json::from_slice(&body).map_err(|_| {
        RemoteError::coded(
            "CONTENT_GITHUB_INVALID_RESPONSE",
            "GitHub API returned invalid JSON",
        )
    })
}
fn string_at(v: &Value, path: &[&str], label: &str) -> Result<String, RemoteError> {
    let mut current = v;
    for key in path {
        current = current.get(*key).ok_or_else(|| {
            RemoteError::coded(
                "CONTENT_GITHUB_INVALID_RESPONSE",
                format!("GitHub response is missing {label}"),
            )
        })?;
    }
    current.as_str().map(ToOwned::to_owned).ok_or_else(|| {
        RemoteError::coded(
            "CONTENT_GITHUB_INVALID_RESPONSE",
            format!("GitHub response has invalid {label}"),
        )
    })
}
fn path_segment(v: &str) -> String {
    percent_encode(v, false)
}
fn query_component(v: &str) -> String {
    percent_encode(v, true)
}
fn percent_encode(v: &str, keep_slash: bool) -> String {
    let mut out = String::new();
    for b in v.bytes() {
        if b.is_ascii_alphanumeric()
            || matches!(b, b'-' | b'_' | b'.' | b'~')
            || (keep_slash && b == b'/')
        {
            out.push(char::from(b));
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::thread;

    struct Step {
        method: &'static str,
        target: String,
        status: u16,
        body: String,
        expected_json: Option<Value>,
        disconnect: bool,
    }

    fn response(status: u16, body: Value) -> (u16, String) {
        (status, serde_json::to_string(&body).unwrap())
    }

    fn spawn_fake(steps: Vec<Step>, token: &'static str) -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            for step in steps {
                let (mut stream, _) = listener.accept().unwrap();
                let request = read_request(&mut stream);
                let head = request.split("\r\n\r\n").next().unwrap();
                let mut lines = head.lines();
                assert_eq!(
                    lines.next().unwrap(),
                    format!("{} {} HTTP/1.1", step.method, step.target)
                );
                assert!(
                    lines
                        .any(|line| line
                            .eq_ignore_ascii_case(&format!("Authorization: Bearer {token}"))),
                    "authorization header is missing"
                );
                if let Some(expected) = step.expected_json {
                    let body = request.split_once("\r\n\r\n").unwrap().1;
                    assert_eq!(serde_json::from_str::<Value>(body).unwrap(), expected);
                }
                if step.disconnect {
                    continue;
                }
                let reason = match step.status {
                    200 => "OK",
                    201 => "Created",
                    404 => "Not Found",
                    409 => "Conflict",
                    500 => "Internal Server Error",
                    value => panic!("unsupported fake status {value}"),
                };
                write!(
                    stream,
                    "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    step.status,
                    reason,
                    step.body.len(),
                    step.body
                )
                .unwrap();
            }
        });
        (format!("http://{address}"), handle)
    }

    fn read_request(stream: &mut TcpStream) -> String {
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let mut bytes = Vec::new();
        let mut buffer = [0u8; 4096];
        let mut expected = None;
        loop {
            let count = stream.read(&mut buffer).unwrap();
            assert!(count > 0, "client closed before completing request");
            bytes.extend_from_slice(&buffer[..count]);
            if expected.is_none() {
                if let Some(end) = bytes.windows(4).position(|value| value == b"\r\n\r\n") {
                    let header = String::from_utf8_lossy(&bytes[..end]);
                    let length = header
                        .lines()
                        .find_map(|line| line.strip_prefix("Content-Length: "))
                        .and_then(|value| value.parse::<usize>().ok())
                        .unwrap_or(0);
                    expected = Some(end + 4 + length);
                }
            }
            if expected.is_some_and(|value| bytes.len() >= value) {
                return String::from_utf8(bytes).unwrap();
            }
        }
    }

    fn repository_snapshot() -> ContentSnapshot {
        ContentSnapshot {
            taxonomy: TaxonomyFile {
                version: 1,
                next_category_id: 2,
                next_tag_id: 1,
                categories: vec![crate::content_contract::TaxonomyCategory {
                    id: 1,
                    name: "Engineering".into(),
                    parent_id: None,
                    position: 10,
                }],
                tags: Vec::new(),
            },
            articles: vec![ContentArticle {
                meta: ArticleMeta {
                    id: 1,
                    title: "Rust ownership".into(),
                    summary: "A compact guide".into(),
                    category_ids: vec![1],
                    tag_ids: Vec::new(),
                    created_at: "2026-01-01T00:00:00Z".into(),
                    updated_at: "2026-03-01T00:00:00Z".into(),
                    published_at: None,
                },
                content_html: "<p>Ownership.</p>".into(),
            }],
        }
    }

    fn blob(value: &[u8]) -> Value {
        json!({
            "encoding": "base64",
            "content": base64::engine::general_purpose::STANDARD.encode(value)
        })
    }

    fn step(method: &'static str, target: impl Into<String>, status: u16, body: Value) -> Step {
        let (status, body) = response(status, body);
        Step {
            method,
            target: target.into(),
            status,
            body,
            expected_json: None,
            disconnect: false,
        }
    }

    fn json_step(
        method: &'static str,
        target: impl Into<String>,
        status: u16,
        response_body: Value,
        expected_json: Value,
    ) -> Step {
        let mut step = step(method, target, status, response_body);
        step.expected_json = Some(expected_json);
        step
    }

    fn disconnect_step(method: &'static str, target: impl Into<String>) -> Step {
        Step {
            method,
            target: target.into(),
            status: 0,
            body: String::new(),
            expected_json: None,
            disconnect: true,
        }
    }

    #[test]
    fn configuration_and_snapshot_encoding_are_strict() {
        assert!(GithubRemote::production("owner/repo", "secret-token").is_ok());
        assert!(GithubRemote::production("bad", "token").is_err());
        assert!(GithubRemote::for_test("owner/repo", "token", "http://127.0.0.1:8088").is_ok());
        assert!(GithubRemote::for_test("owner/repo", "token", "http://example.com").is_err());
        let snapshot = ContentSnapshot::default();
        assert_eq!(
            decode_snapshot(encode_snapshot(&snapshot).unwrap()).unwrap(),
            snapshot
        );
        assert_eq!(snapshot_digest(&snapshot).unwrap().len(), 64);
    }

    #[test]
    fn initializes_an_empty_repository_and_is_idempotent() {
        let taxonomy = pretty_json(&ContentSnapshot::default().taxonomy).unwrap();
        let create_body = json!({
            "message": "Initialize empty blog content repository",
            "content": base64::engine::general_purpose::STANDARD.encode(&taxonomy),
            "branch": "main",
        });
        let prefix = "/repos/owner/repo";
        let tree = json!({"truncated":false,"tree":[
            {"path":"taxonomy.json","type":"blob","mode":"100644","sha":"empty-tax","size":taxonomy.len()}
        ]});
        let steps = vec![
            step(
                "GET",
                format!("{prefix}/git/ref/heads/main"),
                409,
                json!({}),
            ),
            step(
                "GET",
                format!("{prefix}/branches?per_page=2&page=1"),
                200,
                json!([]),
            ),
            json_step(
                "PUT",
                format!("{prefix}/contents/taxonomy.json"),
                201,
                json!({"commit":{"sha":"empty-main"}}),
                create_body,
            ),
            step(
                "GET",
                format!("{prefix}/git/ref/heads/main"),
                200,
                json!({"object":{"sha":"empty-main"}}),
            ),
            step(
                "GET",
                format!("{prefix}/git/trees/empty-main?recursive=1"),
                200,
                tree.clone(),
            ),
            step(
                "GET",
                format!("{prefix}/git/blobs/empty-tax"),
                200,
                blob(&taxonomy),
            ),
            step(
                "GET",
                format!("{prefix}/git/ref/heads/main"),
                200,
                json!({"object":{"sha":"empty-main"}}),
            ),
            step(
                "GET",
                format!("{prefix}/git/trees/empty-main?recursive=1"),
                200,
                tree,
            ),
            step(
                "GET",
                format!("{prefix}/git/blobs/empty-tax"),
                200,
                blob(&taxonomy),
            ),
        ];
        let (api, server) = spawn_fake(steps, "init-token");
        let mut remote = GithubRemote::for_test("owner/repo", "init-token", &api).unwrap();
        assert_eq!(remote.initialize_empty_main().unwrap(), "empty-main");
        assert_eq!(remote.initialize_empty_main().unwrap(), "empty-main");
        server.join().unwrap();
    }

    #[test]
    fn initialization_recovers_a_contents_conflict_from_the_observed_main() {
        let taxonomy = pretty_json(&ContentSnapshot::default().taxonomy).unwrap();
        let prefix = "/repos/owner/repo";
        let tree = json!({"truncated":false,"tree":[
            {"path":"taxonomy.json","type":"blob","mode":"100644","sha":"empty-tax","size":taxonomy.len()}
        ]});
        let steps = vec![
            step(
                "GET",
                format!("{prefix}/git/ref/heads/main"),
                409,
                json!({}),
            ),
            step(
                "GET",
                format!("{prefix}/branches?per_page=2&page=1"),
                200,
                json!([]),
            ),
            step(
                "PUT",
                format!("{prefix}/contents/taxonomy.json"),
                409,
                json!({}),
            ),
            step(
                "GET",
                format!("{prefix}/git/ref/heads/main"),
                200,
                json!({"object":{"sha":"raced-main"}}),
            ),
            step(
                "GET",
                format!("{prefix}/git/trees/raced-main?recursive=1"),
                200,
                tree,
            ),
            step(
                "GET",
                format!("{prefix}/git/blobs/empty-tax"),
                200,
                blob(&taxonomy),
            ),
        ];
        let (api, server) = spawn_fake(steps, "race-token");
        let mut remote = GithubRemote::for_test("owner/repo", "race-token", &api).unwrap();
        assert_eq!(remote.initialize_empty_main().unwrap(), "raced-main");
        server.join().unwrap();
    }

    #[test]
    fn initialization_rejects_an_incompatible_main_after_a_contents_conflict() {
        let prefix = "/repos/owner/repo";
        let steps = vec![
            step(
                "GET",
                format!("{prefix}/git/ref/heads/main"),
                409,
                json!({}),
            ),
            step(
                "GET",
                format!("{prefix}/branches?per_page=2&page=1"),
                200,
                json!([]),
            ),
            step(
                "PUT",
                format!("{prefix}/contents/taxonomy.json"),
                409,
                json!({}),
            ),
            step(
                "GET",
                format!("{prefix}/git/ref/heads/main"),
                200,
                json!({"object":{"sha":"incompatible-main"}}),
            ),
            step(
                "GET",
                format!("{prefix}/git/trees/incompatible-main?recursive=1"),
                200,
                json!({"truncated":false,"tree":[
                    {"path":"README.md","type":"blob","mode":"100644","sha":"readme","size":10}
                ]}),
            ),
        ];
        let (api, server) = spawn_fake(steps, "incompatible-token");
        let mut remote = GithubRemote::for_test("owner/repo", "incompatible-token", &api).unwrap();
        assert_eq!(
            remote.initialize_empty_main().unwrap_err().code(),
            "CONTENT_REPOSITORY_LAYOUT"
        );
        server.join().unwrap();
    }

    #[test]
    fn initialization_recovers_an_unknown_contents_result_from_the_observed_main() {
        let taxonomy = pretty_json(&ContentSnapshot::default().taxonomy).unwrap();
        let prefix = "/repos/owner/repo";
        let tree = json!({"truncated":false,"tree":[
            {"path":"taxonomy.json","type":"blob","mode":"100644","sha":"empty-tax","size":taxonomy.len()}
        ]});
        let steps = vec![
            step(
                "GET",
                format!("{prefix}/git/ref/heads/main"),
                409,
                json!({}),
            ),
            step(
                "GET",
                format!("{prefix}/branches?per_page=2&page=1"),
                200,
                json!([]),
            ),
            disconnect_step("PUT", format!("{prefix}/contents/taxonomy.json")),
            step(
                "GET",
                format!("{prefix}/git/ref/heads/main"),
                200,
                json!({"object":{"sha":"accepted-main"}}),
            ),
            step(
                "GET",
                format!("{prefix}/git/trees/accepted-main?recursive=1"),
                200,
                tree,
            ),
            step(
                "GET",
                format!("{prefix}/git/blobs/empty-tax"),
                200,
                blob(&taxonomy),
            ),
        ];
        let (api, server) = spawn_fake(steps, "unknown-token");
        let mut remote = GithubRemote::for_test("owner/repo", "unknown-token", &api).unwrap();
        assert_eq!(remote.initialize_empty_main().unwrap(), "accepted-main");
        server.join().unwrap();
    }

    #[test]
    fn publication_history_is_batched_and_enforces_operation_budgets() {
        let prefix = "/repos/owner/repo";
        let files: Vec<_> = (1..=100)
            .map(|id| json!({"filename":format!("articles/{id}/meta.json")}))
            .collect();
        let steps = vec![
            step(
                "GET",
                format!("{prefix}/commits/root?per_page=100&page=1"),
                200,
                json!({"commit":{"committer":{"date":"2026-01-01T00:00:00Z"}},"parents":[],"files":files}),
            ),
            step(
                "GET",
                format!("{prefix}/commits/root?per_page=100&page=2"),
                200,
                json!({"commit":{"committer":{"date":"2026-01-01T00:00:00Z"}},"parents":[],"files":[]}),
            ),
        ];
        let (api, server) = spawn_fake(steps, "history-token");
        let remote = GithubRemote::for_test("owner/repo", "history-token", &api).unwrap();
        remote.begin_operation();
        let ids = (1..=100).collect();
        assert_eq!(remote.publication_history(&ids, "root").unwrap().len(), 100);
        assert_eq!(remote.request_count(), 2);
        server.join().unwrap();

        remote.operation_requests.set(MAX_OPERATION_REQUESTS);
        assert_eq!(
            remote.charge_request().unwrap_err().code(),
            "CONTENT_REMOTE_BUDGET_EXCEEDED"
        );
        remote
            .operation_started
            .set(Some(Instant::now() - OPERATION_TIMEOUT));
        remote.operation_requests.set(0);
        assert_eq!(
            remote.charge_request().unwrap_err().code(),
            "CONTENT_REMOTE_BUDGET_EXCEEDED"
        );
    }

    #[test]
    fn each_request_is_limited_by_the_remaining_operation_deadline() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let _request = read_request(&mut stream);
            thread::sleep(Duration::from_millis(500));
            let _ = stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}");
        });
        let remote =
            GithubRemote::for_test("owner/repo", "slow-token", &format!("http://{address}"))
                .unwrap();
        remote.begin_operation();
        remote.operation_started.set(Some(
            Instant::now() - OPERATION_TIMEOUT + Duration::from_millis(50),
        ));
        let started = Instant::now();
        let error = remote.get("slow").unwrap_err();
        assert_eq!(error.code(), "CONTENT_GITHUB_UNAVAILABLE");
        assert!(
            started.elapsed() < Duration::from_millis(350),
            "request must stop at the operation deadline"
        );
        server.join().unwrap();
    }

    #[test]
    fn submit_rejects_a_stale_snapshot_digest_before_any_remote_request() {
        let snapshot = repository_snapshot();
        let mut remote =
            GithubRemote::for_test("owner/repo", "digest-token", "http://127.0.0.1:9").unwrap();
        let error = remote
            .submit_batch(
                &snapshot,
                None,
                &RemoteSubmitIntent {
                    branch: "content/managed-digest".into(),
                    base_commit: "main-1".into(),
                    target_digest: "stale-digest".into(),
                },
            )
            .unwrap_err();
        assert_eq!(error.code(), "CONTENT_REMOTE_INTENT_INVALID");
        assert_eq!(remote.request_count(), 0);
    }

    #[test]
    fn reads_fixed_main_and_uses_first_parent_merge_time() {
        let snapshot = repository_snapshot();
        let taxonomy = pretty_json(&snapshot.taxonomy).unwrap();
        let meta = pretty_json(&snapshot.articles[0].meta).unwrap();
        let html = snapshot.articles[0].content_html.as_bytes();
        let prefix = "/repos/owner/repo";
        let steps = vec![
            step(
                "GET",
                format!("{prefix}/git/ref/heads/main"),
                200,
                json!({"object":{"sha":"merge-2"}}),
            ),
            step(
                "GET",
                format!("{prefix}/git/trees/merge-2?recursive=1"),
                200,
                json!({"truncated":false,"tree":[
                    {"path":"taxonomy.json","type":"blob","mode":"100644","sha":"tax","size":taxonomy.len()},
                    {"path":"articles/1/meta.json","type":"blob","mode":"100644","sha":"meta","size":meta.len()},
                    {"path":"articles/1/content.html","type":"blob","mode":"100644","sha":"html","size":html.len()}
                ]}),
            ),
            step(
                "GET",
                format!("{prefix}/git/blobs/tax"),
                200,
                blob(&taxonomy),
            ),
            step("GET", format!("{prefix}/git/blobs/meta"), 200, blob(&meta)),
            step("GET", format!("{prefix}/git/blobs/html"), 200, blob(html)),
            step(
                "GET",
                format!("{prefix}/commits/merge-2?per_page=100&page=1"),
                200,
                json!({
                    "sha":"merge-2","commit":{"committer":{"date":"2026-03-01T00:00:00Z"}},
                    "parents":[{"sha":"main-1"}],"files":[{"filename":"articles/1/meta.json"}]
                }),
            ),
            step(
                "GET",
                format!("{prefix}/commits/main-1?per_page=100&page=1"),
                200,
                json!({
                    "sha":"main-1","commit":{"committer":{"date":"2026-01-01T00:00:00Z"}},
                    "parents":[],"files":[{"filename":"taxonomy.json"}]
                }),
            ),
        ];
        let (api, server) = spawn_fake(steps, "test-token");
        let mut remote = GithubRemote::for_test("owner/repo", "test-token", &api).unwrap();
        let loaded = remote.read_main_snapshot().unwrap();
        assert_eq!(loaded.commit, "merge-2");
        assert_eq!(
            loaded.snapshot.articles[0].meta.published_at.as_deref(),
            Some("2026-03-01T00:00:00Z")
        );
        server.join().unwrap();
    }

    #[test]
    fn recovers_written_commit_after_pull_request_failure_without_leaking_secrets() {
        let snapshot = repository_snapshot();
        let digest = snapshot_digest(&snapshot).unwrap();
        let branch = managed_branch(7, &digest);
        let encoded_branch = path_segment(&branch);
        let pull_head = query_component(&format!("owner:{branch}"));
        let files = encode_snapshot(&snapshot).unwrap();
        let taxonomy = files.get("taxonomy.json").unwrap();
        let meta = files.get("articles/1/meta.json").unwrap();
        let html = files.get("articles/1/content.html").unwrap();
        let prefix = "/repos/owner/repo";
        let tree = json!({"truncated":false,"tree":[
            {"path":"taxonomy.json","type":"blob","mode":"100644","sha":"old-tax","size":taxonomy.len()},
            {"path":"articles/1/meta.json","type":"blob","mode":"100644","sha":"old-meta","size":meta.len()},
            {"path":"articles/1/content.html","type":"blob","mode":"100644","sha":"old-html","size":html.len()}
        ]});
        let steps = vec![
            step(
                "GET",
                format!("{prefix}/git/ref/heads/main"),
                200,
                json!({"object":{"sha":"main-1"}}),
            ),
            step(
                "GET",
                format!("{prefix}/branches?per_page=100&page=1"),
                200,
                json!([]),
            ),
            step(
                "GET",
                format!("{prefix}/git/ref/heads/{encoded_branch}"),
                404,
                json!({"message":"missing secret response"}),
            ),
            step("POST", format!("{prefix}/git/refs"), 201, json!({})),
            step(
                "GET",
                format!("{prefix}/commits/main-1"),
                200,
                json!({"commit":{"message":"baseline"}}),
            ),
            step(
                "GET",
                format!("{prefix}/git/trees/main-1?recursive=1"),
                200,
                tree.clone(),
            ),
            step(
                "GET",
                format!("{prefix}/git/blobs/old-tax"),
                200,
                blob(taxonomy),
            ),
            step(
                "GET",
                format!("{prefix}/git/blobs/old-meta"),
                200,
                blob(meta),
            ),
            step(
                "GET",
                format!("{prefix}/git/blobs/old-html"),
                200,
                blob(html),
            ),
            step(
                "POST",
                format!("{prefix}/git/blobs"),
                201,
                json!({"sha":"new-html"}),
            ),
            step(
                "POST",
                format!("{prefix}/git/blobs"),
                201,
                json!({"sha":"new-meta"}),
            ),
            step(
                "POST",
                format!("{prefix}/git/blobs"),
                201,
                json!({"sha":"new-tax"}),
            ),
            step(
                "POST",
                format!("{prefix}/git/trees"),
                201,
                json!({"sha":"new-tree"}),
            ),
            step(
                "POST",
                format!("{prefix}/git/commits"),
                201,
                json!({"sha":"commit-2"}),
            ),
            step(
                "PATCH",
                format!("{prefix}/git/refs/heads/{encoded_branch}"),
                200,
                json!({}),
            ),
            step(
                "GET",
                format!("{prefix}/pulls?state=all&head={pull_head}&base=main&per_page=100"),
                200,
                json!([]),
            ),
            Step {
                method: "POST",
                target: format!("{prefix}/pulls"),
                status: 500,
                body: "{\"message\":\"server-secret-body\"}".into(),
                expected_json: None,
                disconnect: false,
            },
            step(
                "GET",
                format!("{prefix}/git/ref/heads/main"),
                200,
                json!({"object":{"sha":"main-1"}}),
            ),
            step(
                "GET",
                format!("{prefix}/branches?per_page=100&page=1"),
                200,
                json!([{"name":branch}]),
            ),
            step(
                "GET",
                format!("{prefix}/pulls?state=all&head={pull_head}&base=main&per_page=100"),
                200,
                json!([]),
            ),
            step(
                "GET",
                format!("{prefix}/git/ref/heads/{encoded_branch}"),
                200,
                json!({"object":{"sha":"commit-2"}}),
            ),
            step(
                "GET",
                format!("{prefix}/commits/commit-2"),
                200,
                json!({"commit":{"message":format!("Update blog content\n\nblog-content-digest:{digest}")}}),
            ),
            step(
                "GET",
                format!("{prefix}/git/ref/heads/{encoded_branch}"),
                200,
                json!({"object":{"sha":"commit-2"}}),
            ),
            step(
                "GET",
                format!("{prefix}/commits/commit-2"),
                200,
                json!({"commit":{"message":format!("Update blog content\n\nblog-content-digest:{digest}")}}),
            ),
            step(
                "GET",
                format!("{prefix}/git/trees/commit-2?recursive=1"),
                200,
                tree,
            ),
            step(
                "GET",
                format!("{prefix}/git/blobs/old-tax"),
                200,
                blob(taxonomy),
            ),
            step(
                "GET",
                format!("{prefix}/git/blobs/old-meta"),
                200,
                blob(meta),
            ),
            step(
                "GET",
                format!("{prefix}/git/blobs/old-html"),
                200,
                blob(html),
            ),
            step(
                "GET",
                format!("{prefix}/pulls?state=all&head={pull_head}&base=main&per_page=100"),
                200,
                json!([]),
            ),
            step("POST", format!("{prefix}/pulls"), 201, json!({"number":19})),
        ];
        let (api, server) = spawn_fake(steps, "private-token");
        let mut remote = GithubRemote::for_test("owner/repo", "private-token", &api).unwrap();
        let intent = RemoteSubmitIntent {
            branch: branch.clone(),
            base_commit: "main-1".into(),
            target_digest: digest,
        };
        let error = remote
            .submit_batch(&snapshot, None, &intent)
            .unwrap_err()
            .to_string();
        assert!(!error.contains("private-token"));
        assert!(!error.contains("server-secret-body"));
        let recovered = remote.submit_batch(&snapshot, None, &intent).unwrap();
        assert_eq!(recovered.batch.pull_request, 19);
        assert_eq!(recovered.batch.commit, "commit-2");
        assert_eq!(recovered.batch.branch, branch);
        server.join().unwrap();
    }

    #[test]
    fn refuses_a_recovery_marker_when_the_branch_tree_has_different_content() {
        let snapshot = repository_snapshot();
        let digest = snapshot_digest(&snapshot).unwrap();
        let branch = managed_branch(7, &digest);
        let encoded_branch = path_segment(&branch);
        let files = encode_snapshot(&snapshot).unwrap();
        let taxonomy = files.get("taxonomy.json").unwrap();
        let html = files.get("articles/1/content.html").unwrap();
        let mut wrong_meta = snapshot.articles[0].meta.clone();
        wrong_meta.title = "Unexpected branch content".to_owned();
        let wrong_meta = pretty_json(&wrong_meta).unwrap();
        let prefix = "/repos/owner/repo";
        let steps = vec![
            step(
                "GET",
                format!("{prefix}/git/ref/heads/main"),
                200,
                json!({"object":{"sha":"main-1"}}),
            ),
            step(
                "GET",
                format!("{prefix}/branches?per_page=100&page=1"),
                200,
                json!([]),
            ),
            step(
                "GET",
                format!("{prefix}/git/ref/heads/{encoded_branch}"),
                200,
                json!({"object":{"sha":"commit-2"}}),
            ),
            step(
                "GET",
                format!("{prefix}/commits/commit-2"),
                200,
                json!({"commit":{"message":format!("blog-content-digest:{digest}")}}),
            ),
            step(
                "GET",
                format!("{prefix}/git/trees/commit-2?recursive=1"),
                200,
                json!({"truncated":false,"tree":[
                    {"path":"taxonomy.json","type":"blob","mode":"100644","sha":"tax","size":taxonomy.len()},
                    {"path":"articles/1/meta.json","type":"blob","mode":"100644","sha":"meta","size":wrong_meta.len()},
                    {"path":"articles/1/content.html","type":"blob","mode":"100644","sha":"html","size":html.len()}
                ]}),
            ),
            step(
                "GET",
                format!("{prefix}/git/blobs/tax"),
                200,
                blob(taxonomy),
            ),
            step(
                "GET",
                format!("{prefix}/git/blobs/meta"),
                200,
                blob(&wrong_meta),
            ),
            step("GET", format!("{prefix}/git/blobs/html"), 200, blob(html)),
        ];
        let (api, server) = spawn_fake(steps, "recovery-token");
        let mut remote = GithubRemote::for_test("owner/repo", "recovery-token", &api).unwrap();
        let error = remote
            .submit_batch(
                &snapshot,
                None,
                &RemoteSubmitIntent {
                    branch,
                    base_commit: "main-1".to_owned(),
                    target_digest: digest,
                },
            )
            .unwrap_err();
        assert_eq!(error.code(), "CONTENT_REMOTE_RECOVERY_MISMATCH");
        server.join().unwrap();
    }

    #[test]
    fn ignores_historical_managed_branches_and_rejects_ambiguous_active_state() {
        let prefix = "/repos/owner/repo";
        let old = "blog-content/v1-old";
        let old_head = query_component(&format!("owner:{old}"));
        let historical = vec![
            step(
                "GET",
                format!("{prefix}/branches?per_page=100&page=1"),
                200,
                json!([{"name":old}]),
            ),
            step(
                "GET",
                format!("{prefix}/pulls?state=all&head={old_head}&base=main&per_page=100"),
                200,
                json!([{"number":2,"state":"closed","merged_at":"2026-01-01T00:00:00Z"}]),
            ),
        ];
        let (api, server) = spawn_fake(historical, "test-token");
        let remote = GithubRemote::for_test("owner/repo", "test-token", &api).unwrap();
        assert!(remote.managed_branches().unwrap().is_empty());
        server.join().unwrap();

        let first = "blog-content/v2-first";
        let second = "blog-content/v3-second";
        let first_head = query_component(&format!("owner:{first}"));
        let second_head = query_component(&format!("owner:{second}"));
        let ambiguous = vec![
            step(
                "GET",
                format!("{prefix}/branches?per_page=100&page=1"),
                200,
                json!([{"name":second},{"name":first}]),
            ),
            step(
                "GET",
                format!("{prefix}/pulls?state=all&head={first_head}&base=main&per_page=100"),
                200,
                json!([{"number":3,"state":"open","merged_at":null}]),
            ),
            step(
                "GET",
                format!("{prefix}/pulls?state=all&head={second_head}&base=main&per_page=100"),
                200,
                json!([{"number":4,"state":"open","merged_at":null}]),
            ),
        ];
        let (api, server) = spawn_fake(ambiguous, "test-token");
        let remote = GithubRemote::for_test("owner/repo", "test-token", &api).unwrap();
        let error = remote.managed_branches().unwrap_err();
        assert_eq!(error.code(), "CONTENT_REMOTE_AMBIGUOUS");
        server.join().unwrap();

        let unknown = "blog-content/v4-unknown";
        let unknown_head = query_component(&format!("owner:{unknown}"));
        let encoded_unknown = path_segment(unknown);
        let unknown_steps = vec![
            step(
                "GET",
                format!("{prefix}/branches?per_page=100&page=1"),
                200,
                json!([{"name":unknown}]),
            ),
            step(
                "GET",
                format!("{prefix}/pulls?state=all&head={unknown_head}&base=main&per_page=100"),
                200,
                json!([]),
            ),
            step(
                "GET",
                format!("{prefix}/git/ref/heads/{encoded_unknown}"),
                200,
                json!({"object":{"sha":"unknown-head"}}),
            ),
            step(
                "GET",
                format!("{prefix}/commits/unknown-head"),
                200,
                json!({"commit":{"message":"unmanaged commit"}}),
            ),
        ];
        let (api, server) = spawn_fake(unknown_steps, "test-token");
        let remote = GithubRemote::for_test("owner/repo", "test-token", &api).unwrap();
        assert_eq!(
            remote.managed_branches().unwrap_err().code(),
            "CONTENT_REMOTE_AMBIGUOUS"
        );
        server.join().unwrap();
    }

    #[test]
    fn mock_updates_one_batch() {
        let mut remote = MockGithub::default();
        let snapshot = ContentSnapshot::default();
        let digest = snapshot_digest(&snapshot).unwrap();
        let intent = RemoteSubmitIntent {
            branch: managed_branch(1, &digest),
            base_commit: "main-1".into(),
            target_digest: digest,
        };
        let first = remote.submit_batch(&snapshot, None, &intent).unwrap().batch;
        let second = remote
            .submit_batch(&snapshot, Some(&first), &intent)
            .unwrap()
            .batch;
        assert_eq!(first.branch, second.branch);
        assert_eq!(first.pull_request, second.pull_request);
        assert_ne!(first.commit, second.commit);
    }
}
