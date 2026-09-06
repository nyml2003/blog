//! GitHub 内容仓库的本地快照契约。
//!
//! 该模块只读取一个已经取得的仓库目录：不访问 GitHub、不访问 SQLite，
//! 也不修改原始 HTML。Product 的同步协调器和 GitHub 客户端分别负责取得
//! commit 与提交文件树；这里负责把文件树归一化为可交给 Data 的快照。

use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

use article_html_core::Inspection;
use serde::{Deserialize, Serialize};

pub const TAXONOMY_FILE: &str = "taxonomy.json";
pub const ARTICLES_DIR: &str = "articles";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TaxonomyFile {
    pub article_types: Vec<TaxonomyType>,
    pub terms: Vec<TaxonomyTerm>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TaxonomyType {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TaxonomyTerm {
    pub id: i64,
    pub name: String,
    pub kind: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ArticleMeta {
    pub id: i64,
    pub title: String,
    pub summary: String,
    pub article_type_id: i64,
    pub term_ids: Vec<i64>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub published_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContentArticle {
    pub meta: ArticleMeta,
    pub content_html: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContentSnapshot {
    pub taxonomy: TaxonomyFile,
    pub articles: Vec<ContentArticle>,
}

/// Validate a complete in-memory repository snapshot before writing or submitting it.
pub fn validate_snapshot(snapshot: &ContentSnapshot) -> Result<(), ContractError> {
    let taxonomy_path = PathBuf::from(TAXONOMY_FILE);
    validate_taxonomy(&snapshot.taxonomy, &taxonomy_path)?;
    let type_ids: BTreeSet<i64> = snapshot
        .taxonomy
        .article_types
        .iter()
        .map(|item| item.id)
        .collect();
    let term_kinds: BTreeMap<i64, &str> = snapshot
        .taxonomy
        .terms
        .iter()
        .map(|item| (item.id, item.kind.as_str()))
        .collect();
    let mut article_ids = BTreeSet::new();
    for article in &snapshot.articles {
        let article_path = PathBuf::from(ARTICLES_DIR).join(article.meta.id.to_string());
        if !article_ids.insert(article.meta.id) {
            return Err(ContractError::new(
                article_path,
                format!("duplicate article id {}", article.meta.id),
            ));
        }
        validate_meta(&article.meta, &type_ids, &term_kinds, &article_path)?;
        let inspection = article_html_core::inspect(&article.content_html);
        if !inspection.valid {
            return Err(ContractError::new(
                article_path.join("content.html"),
                format_inspection_error(&inspection),
            ));
        }
    }
    Ok(())
}

/// Write the exact repository layout into a temporary workspace directory.
///
/// The target must not exist. A failed write leaves only a new staging directory; callers
/// publish it only after success, so neither a workspace nor an existing checkout is overwritten.
pub fn write_snapshot(root: &Path, snapshot: &ContentSnapshot) -> Result<(), ContractError> {
    validate_snapshot(snapshot)?;
    fs::create_dir(root)
        .map_err(|error| ContractError::new(root, format!("create repository root: {error}")))?;
    fs::write(
        root.join(TAXONOMY_FILE),
        serde_json::to_vec_pretty(&snapshot.taxonomy)
            .map_err(|error| ContractError::new(root.join(TAXONOMY_FILE), error.to_string()))?,
    )
    .map_err(|error| {
        ContractError::new(root.join(TAXONOMY_FILE), format!("write JSON: {error}"))
    })?;
    let articles_root = root.join(ARTICLES_DIR);
    fs::create_dir_all(&articles_root).map_err(|error| {
        ContractError::new(
            &articles_root,
            format!("create articles directory: {error}"),
        )
    })?;
    for article in &snapshot.articles {
        let directory = articles_root.join(article.meta.id.to_string());
        fs::create_dir_all(&directory).map_err(|error| {
            ContractError::new(&directory, format!("create article directory: {error}"))
        })?;
        let meta_path = directory.join("meta.json");
        fs::write(
            &meta_path,
            serde_json::to_vec_pretty(&article.meta)
                .map_err(|error| ContractError::new(&meta_path, error.to_string()))?,
        )
        .map_err(|error| ContractError::new(&meta_path, format!("write JSON: {error}")))?;
        let content_path = directory.join("content.html");
        fs::write(&content_path, &article.content_html)
            .map_err(|error| ContractError::new(&content_path, format!("write HTML: {error}")))?;
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContractError {
    path: PathBuf,
    message: String,
}

impl ContractError {
    fn new(path: impl Into<PathBuf>, message: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            message: message.into(),
        }
    }
}

impl fmt::Display for ContractError {
    fn fmt(&self, output: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(output, "{}: {}", self.path.display(), self.message)
    }
}

impl std::error::Error for ContractError {}

pub fn read_snapshot(root: &Path) -> Result<ContentSnapshot, ContractError> {
    let taxonomy_path = root.join(TAXONOMY_FILE);
    let taxonomy = read_json::<TaxonomyFile>(&taxonomy_path)?;
    validate_taxonomy(&taxonomy, &taxonomy_path)?;

    let articles_root = root.join(ARTICLES_DIR);
    let entries = match fs::read_dir(&articles_root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ContentSnapshot {
                taxonomy,
                articles: Vec::new(),
            });
        }
        Err(error) => {
            return Err(ContractError::new(
                &articles_root,
                format!("read directory: {error}"),
            ));
        }
    };
    let mut article_dirs = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| {
            ContractError::new(&articles_root, format!("read directory entry: {error}"))
        })?;
        let file_type = entry.file_type().map_err(|error| {
            ContractError::new(entry.path(), format!("read file type: {error}"))
        })?;
        if !file_type.is_dir() {
            return Err(ContractError::new(
                entry.path(),
                "articles must contain numeric article directories only",
            ));
        }
        let name = entry.file_name();
        let name = name.to_str().ok_or_else(|| {
            ContractError::new(entry.path(), "article directory name is not UTF-8")
        })?;
        let id = name.parse::<i64>().map_err(|_| {
            ContractError::new(
                entry.path(),
                "article directory name must be a positive integer",
            )
        })?;
        if id <= 0 || name != id.to_string() {
            return Err(ContractError::new(
                entry.path(),
                "article directory id must be a canonical positive integer",
            ));
        }
        article_dirs.push((id, entry.path()));
    }
    article_dirs.sort_by_key(|(id, _)| *id);

    let type_ids: BTreeSet<i64> = taxonomy.article_types.iter().map(|item| item.id).collect();
    let term_kinds: BTreeMap<i64, &str> = taxonomy
        .terms
        .iter()
        .map(|item| (item.id, item.kind.as_str()))
        .collect();
    let mut articles = Vec::with_capacity(article_dirs.len());
    for (directory_id, directory) in article_dirs {
        let meta_path = directory.join("meta.json");
        let content_path = directory.join("content.html");
        let meta = read_json::<ArticleMeta>(&meta_path)?;
        if meta.id != directory_id {
            return Err(ContractError::new(
                meta_path,
                format!(
                    "meta id {} does not match directory id {directory_id}",
                    meta.id
                ),
            ));
        }
        validate_meta(&meta, &type_ids, &term_kinds, &directory)?;
        let content_html = fs::read_to_string(&content_path).map_err(|error| {
            ContractError::new(&content_path, format!("read UTF-8 HTML: {error}"))
        })?;
        let inspection = article_html_core::inspect(&content_html);
        if !inspection.valid {
            return Err(ContractError::new(
                content_path,
                format_inspection_error(&inspection),
            ));
        }
        articles.push(ContentArticle { meta, content_html });
    }

    let snapshot = ContentSnapshot { taxonomy, articles };
    validate_snapshot(&snapshot)?;
    Ok(snapshot)
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, ContractError> {
    let bytes =
        fs::read(path).map_err(|error| ContractError::new(path, format!("read JSON: {error}")))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| ContractError::new(path, format!("invalid JSON: {error}")))
}

fn validate_taxonomy(taxonomy: &TaxonomyFile, path: &Path) -> Result<(), ContractError> {
    let mut type_ids = BTreeSet::new();
    for item in &taxonomy.article_types {
        validate_identity(item.id, &item.name, path, "article type")?;
        if !type_ids.insert(item.id) {
            return Err(ContractError::new(
                path,
                format!("duplicate article type id {}", item.id),
            ));
        }
    }

    let mut term_ids = BTreeSet::new();
    for item in &taxonomy.terms {
        validate_identity(item.id, &item.name, path, "term")?;
        if !matches!(item.kind.as_str(), "topic" | "tag") {
            return Err(ContractError::new(
                path,
                format!("term {} has unsupported kind {:?}", item.id, item.kind),
            ));
        }
        if !term_ids.insert(item.id) {
            return Err(ContractError::new(
                path,
                format!("duplicate term id {}", item.id),
            ));
        }
    }
    Ok(())
}

fn validate_meta(
    meta: &ArticleMeta,
    type_ids: &BTreeSet<i64>,
    term_kinds: &BTreeMap<i64, &str>,
    directory: &Path,
) -> Result<(), ContractError> {
    validate_identity(
        meta.id,
        &meta.title,
        &directory.join("meta.json"),
        "article",
    )?;
    if meta.summary.chars().count() > 160 {
        return Err(ContractError::new(
            directory.join("meta.json"),
            "summary must contain at most 160 Unicode scalar values",
        ));
    }
    if !type_ids.contains(&meta.article_type_id) {
        return Err(ContractError::new(
            directory.join("meta.json"),
            format!(
                "article type {} is not present in taxonomy",
                meta.article_type_id
            ),
        ));
    }
    let mut seen = BTreeSet::new();
    for term_id in &meta.term_ids {
        if !seen.insert(*term_id) {
            return Err(ContractError::new(
                directory.join("meta.json"),
                format!("duplicate term id {term_id}"),
            ));
        }
        if !term_kinds.contains_key(term_id) {
            return Err(ContractError::new(
                directory.join("meta.json"),
                format!("term {term_id} is not present in taxonomy"),
            ));
        }
    }
    Ok(())
}

fn validate_identity(id: i64, name: &str, path: &Path, kind: &str) -> Result<(), ContractError> {
    if id <= 0 {
        return Err(ContractError::new(
            path,
            format!("{kind} id must be positive"),
        ));
    }
    if name.trim().is_empty() {
        return Err(ContractError::new(
            path,
            format!("{kind} name must not be empty"),
        ));
    }
    Ok(())
}

fn format_inspection_error(inspection: &Inspection) -> String {
    inspection
        .diagnostics
        .first()
        .map(|diagnostic| format!("invalid HTML {}: {}", diagnostic.code, diagnostic.message))
        .unwrap_or_else(|| "invalid HTML".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "blog-content-contract-{}-{name}",
            std::process::id()
        ))
    }

    fn write_fixture(root: &Path, html: &str) {
        fs::create_dir_all(root.join("articles/1001")).unwrap();
        fs::write(
            root.join(TAXONOMY_FILE),
            r#"{"article_types":[{"id":1,"name":"Rust","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"}],"terms":[{"id":2,"name":"基础","kind":"topic","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"}]}"#,
        )
        .unwrap();
        fs::write(
            root.join("articles/1001/meta.json"),
            r#"{"id":1001,"title":"Hello","summary":"","article_type_id":1,"term_ids":[2],"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"}"#,
        )
        .unwrap();
        fs::write(root.join("articles/1001/content.html"), html).unwrap();
    }

    #[test]
    fn reads_empty_and_valid_article_snapshot() {
        let root = fixture_root("valid");
        write_fixture(&root, "<p>hello</p>");
        let snapshot = read_snapshot(&root).unwrap();
        assert_eq!(snapshot.articles.len(), 1);
        assert_eq!(snapshot.articles[0].meta.id, 1001);
        assert_eq!(snapshot.articles[0].content_html, "<p>hello</p>");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_invalid_html_without_rewriting_it() {
        let root = fixture_root("invalid-html");
        write_fixture(&root, "<script>alert(1)</script>");
        let error = read_snapshot(&root).unwrap_err().to_string();
        assert!(error.contains("invalid HTML"));
        assert_eq!(
            fs::read_to_string(root.join("articles/1001/content.html")).unwrap(),
            "<script>alert(1)</script>"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_missing_taxonomy_reference() {
        let root = fixture_root("missing-reference");
        write_fixture(&root, "<p>hello</p>");
        let meta_path = root.join("articles/1001/meta.json");
        fs::write(
            &meta_path,
            r#"{"id":1001,"title":"Hello","summary":"","article_type_id":99,"term_ids":[2],"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"}"#,
        )
        .unwrap();
        let error = read_snapshot(&root).unwrap_err().to_string();
        assert!(error.contains("article type 99"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn writes_a_round_trippable_snapshot_without_changing_html() {
        let source = "<p>hello</p>";
        let root = fixture_root("roundtrip");
        write_fixture(&root, source);
        let snapshot = read_snapshot(&root).unwrap();
        let target = fixture_root("roundtrip-target");
        write_snapshot(&target, &snapshot).unwrap();
        let roundtrip = read_snapshot(&target).unwrap();
        assert_eq!(roundtrip, snapshot);
        assert_eq!(
            fs::read_to_string(target.join("articles/1001/content.html")).unwrap(),
            source
        );
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(target);
    }

    #[test]
    fn empty_git_tree_needs_only_taxonomy() {
        let root = fixture_root("empty-tree");
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join(TAXONOMY_FILE),
            r#"{"article_types":[],"terms":[]}"#,
        )
        .unwrap();
        assert!(read_snapshot(&root).unwrap().articles.is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn refuses_to_overwrite_an_existing_checkout() {
        let root = fixture_root("existing-checkout");
        write_fixture(&root, "<p>original</p>");
        let original = read_snapshot(&root).unwrap();
        let mut changed = original.clone();
        changed.articles.clear();
        assert!(write_snapshot(&root, &changed).is_err());
        assert_eq!(read_snapshot(&root).unwrap(), original);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_alternate_directory_spellings_for_the_same_id() {
        let root = fixture_root("duplicate-directory");
        write_fixture(&root, "<p>original</p>");
        fs::rename(root.join("articles/1001"), root.join("articles/01001")).unwrap();
        assert!(
            read_snapshot(&root)
                .unwrap_err()
                .to_string()
                .contains("canonical")
        );
        fs::remove_dir_all(root).unwrap();
    }
}
