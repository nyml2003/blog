//! Content repository snapshot parser, writer, and complete-batch validator.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

use article_html_core::Inspection;
use serde::de::DeserializeOwned;

pub use protocol::{
    Category as TaxonomyCategory, ContentArticleMeta as ArticleMeta, ContentSnapshot,
    ContentSnapshotArticle as ContentArticle, Tag as TaxonomyTag, Taxonomy as TaxonomyFile,
};

pub const TAXONOMY_FILE: &str = "taxonomy.json";
pub const ARTICLES_DIR: &str = "articles";

pub fn validate_snapshot(snapshot: &ContentSnapshot) -> Result<(), ContractError> {
    let path = PathBuf::from(TAXONOMY_FILE);
    validate_taxonomy(&snapshot.taxonomy, &path)?;
    let category_ids: BTreeSet<_> = snapshot.taxonomy.categories.iter().map(|v| v.id).collect();
    let tag_ids: BTreeSet<_> = snapshot.taxonomy.tags.iter().map(|v| v.id).collect();
    let parents: BTreeSet<_> = snapshot
        .taxonomy
        .categories
        .iter()
        .filter_map(|v| v.parent_id)
        .collect();
    let mut article_ids = BTreeSet::new();
    for article in &snapshot.articles {
        let directory = PathBuf::from(ARTICLES_DIR).join(article.meta.id.to_string());
        if !article_ids.insert(article.meta.id) {
            return Err(ContractError::new(
                &directory,
                format!("duplicate article id {}", article.meta.id),
            ));
        }
        validate_meta(&article.meta, &category_ids, &tag_ids, &parents, &directory)?;
        let inspection = article_html_core::inspect(&article.content_html);
        if !inspection.valid {
            return Err(ContractError::new(
                directory.join("content.html"),
                format_inspection_error(&inspection),
            ));
        }
    }
    Ok(())
}

/// Validate a snapshot that may enter `main` or a managed pull request.
///
/// Workspace drafts may temporarily have no category while taxonomy analysis is pending. A
/// published article cannot because the public compatibility projection needs an article type.
pub fn validate_publishable_snapshot(snapshot: &ContentSnapshot) -> Result<(), ContractError> {
    validate_snapshot(snapshot)?;
    for article in &snapshot.articles {
        validate_publishable_timestamps(&article.meta)?;
        if article.meta.category_ids.is_empty() {
            return Err(ContractError::new(
                PathBuf::from(ARTICLES_DIR)
                    .join(article.meta.id.to_string())
                    .join("meta.json"),
                "published article must reference at least one leaf category",
            ));
        }
    }
    Ok(())
}

fn validate_publishable_timestamps(meta: &ArticleMeta) -> Result<(), ContractError> {
    let path = PathBuf::from(ARTICLES_DIR)
        .join(meta.id.to_string())
        .join("meta.json");
    let created = parse_rfc3339(&meta.created_at)
        .ok_or_else(|| ContractError::new(&path, "createdAt must be RFC3339"))?;
    let updated = parse_rfc3339(&meta.updated_at)
        .ok_or_else(|| ContractError::new(&path, "updatedAt must be RFC3339"))?;
    if created > updated {
        return Err(ContractError::new(
            &path,
            "createdAt must not be later than updatedAt",
        ));
    }
    if let Some(value) = meta.published_at.as_deref() {
        let published = parse_rfc3339(value)
            .ok_or_else(|| ContractError::new(&path, "publishedAt must be RFC3339"))?;
        if published < created {
            return Err(ContractError::new(
                &path,
                "publishedAt must not be earlier than createdAt",
            ));
        }
    }
    Ok(())
}

fn parse_rfc3339(value: &str) -> Option<i128> {
    let bytes = value.as_bytes();
    if bytes.len() < 20
        || bytes.get(4) != Some(&b'-')
        || bytes.get(7) != Some(&b'-')
        || bytes.get(10) != Some(&b'T')
        || bytes.get(13) != Some(&b':')
        || bytes.get(16) != Some(&b':')
    {
        return None;
    }
    let year = parse_digits(bytes, 0, 4)? as i64;
    let month = parse_digits(bytes, 5, 2)? as i64;
    let day = parse_digits(bytes, 8, 2)? as i64;
    let hour = parse_digits(bytes, 11, 2)? as i64;
    let minute = parse_digits(bytes, 14, 2)? as i64;
    let second = parse_digits(bytes, 17, 2)? as i64;
    if !(1..=12).contains(&month)
        || day < 1
        || day > days_in_month(year, month)
        || hour > 23
        || minute > 59
        || second > 59
    {
        return None;
    }
    let mut cursor = 19;
    let mut nanos = 0_i128;
    if bytes.get(cursor) == Some(&b'.') {
        cursor += 1;
        let start = cursor;
        while bytes.get(cursor).is_some_and(u8::is_ascii_digit) {
            cursor += 1;
        }
        let width = cursor.checked_sub(start)?;
        if width == 0 || width > 9 {
            return None;
        }
        nanos = i128::from(parse_digits(bytes, start, width)?)
            * 10_i128.pow(u32::try_from(9 - width).ok()?);
    }
    let offset_seconds = match bytes.get(cursor) {
        Some(b'Z') if cursor + 1 == bytes.len() => 0_i64,
        Some(sign @ (b'+' | b'-')) if cursor + 6 == bytes.len() => {
            if bytes.get(cursor + 3) != Some(&b':') {
                return None;
            }
            let hours = i64::from(parse_digits(bytes, cursor + 1, 2)?);
            let minutes = i64::from(parse_digits(bytes, cursor + 4, 2)?);
            if hours > 23 || minutes > 59 {
                return None;
            }
            let offset = hours.checked_mul(3600)?.checked_add(minutes * 60)?;
            if *sign == b'-' { -offset } else { offset }
        }
        _ => return None,
    };
    let days = days_from_civil(year, month, day);
    let local_seconds = days
        .checked_mul(86_400)?
        .checked_add(hour * 3_600)?
        .checked_add(minute * 60)?
        .checked_add(second)?;
    Some(i128::from(local_seconds.checked_sub(offset_seconds)?) * 1_000_000_000 + nanos)
}

fn parse_digits(bytes: &[u8], start: usize, width: usize) -> Option<u32> {
    let mut value = 0_u32;
    for byte in bytes.get(start..start.checked_add(width)?)? {
        if !byte.is_ascii_digit() {
            return None;
        }
        value = value
            .checked_mul(10)?
            .checked_add(u32::from(*byte - b'0'))?;
    }
    Some(value)
}

fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        _ => 0,
    }
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = year - i64::from(month <= 2);
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let shifted_month = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * shifted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

pub fn validate_taxonomy(taxonomy: &TaxonomyFile, path: &Path) -> Result<(), ContractError> {
    if taxonomy.version != protocol::TAXONOMY_SCHEMA_VERSION {
        return Err(ContractError::new(
            path,
            format!("unsupported taxonomy version {}", taxonomy.version),
        ));
    }
    if taxonomy.next_category_id <= 0 || taxonomy.next_tag_id <= 0 {
        return Err(ContractError::new(
            path,
            "taxonomy ID watermarks must be positive",
        ));
    }
    let mut ids = BTreeSet::new();
    let mut names = BTreeSet::new();
    let mut positions = BTreeSet::new();
    for category in &taxonomy.categories {
        validate_identity(category.id, &category.name, path, "category")?;
        if category.id >= taxonomy.next_category_id {
            return Err(ContractError::new(
                path,
                format!(
                    "category {} must be below next_category_id {}",
                    category.id, taxonomy.next_category_id
                ),
            ));
        }
        if category.position < 0 {
            return Err(ContractError::new(
                path,
                format!("category {} position must not be negative", category.id),
            ));
        }
        if !ids.insert(category.id) {
            return Err(ContractError::new(
                path,
                format!("duplicate category id {}", category.id),
            ));
        }
        if !names.insert((category.parent_id, category.name.trim().to_lowercase())) {
            return Err(ContractError::new(
                path,
                format!(
                    "duplicate category name {:?} under the same parent",
                    category.name
                ),
            ));
        }
        if !positions.insert((category.parent_id, category.position)) {
            return Err(ContractError::new(
                path,
                format!(
                    "duplicate category position {} under the same parent",
                    category.position
                ),
            ));
        }
    }
    for category in &taxonomy.categories {
        if let Some(parent) = category.parent_id {
            if parent == category.id {
                return Err(ContractError::new(
                    path,
                    format!("category {} cannot parent itself", category.id),
                ));
            }
            if !ids.contains(&parent) {
                return Err(ContractError::new(
                    path,
                    format!("category {} parent {parent} does not exist", category.id),
                ));
            }
        }
    }
    validate_acyclic(taxonomy, path)?;
    let mut tag_ids = BTreeSet::new();
    let mut tag_names = BTreeSet::new();
    for tag in &taxonomy.tags {
        validate_identity(tag.id, &tag.name, path, "tag")?;
        if tag.id >= taxonomy.next_tag_id {
            return Err(ContractError::new(
                path,
                format!(
                    "tag {} must be below next_tag_id {}",
                    tag.id, taxonomy.next_tag_id
                ),
            ));
        }
        if !tag_ids.insert(tag.id) {
            return Err(ContractError::new(
                path,
                format!("duplicate tag id {}", tag.id),
            ));
        }
        if !tag_names.insert(tag.name.trim().to_lowercase()) {
            return Err(ContractError::new(
                path,
                format!("duplicate tag name {:?}", tag.name),
            ));
        }
    }
    Ok(())
}

fn validate_acyclic(taxonomy: &TaxonomyFile, path: &Path) -> Result<(), ContractError> {
    let parents: BTreeMap<_, _> = taxonomy
        .categories
        .iter()
        .map(|v| (v.id, v.parent_id))
        .collect();
    for category in &taxonomy.categories {
        let mut visited = BTreeSet::new();
        let mut current = Some(category.id);
        while let Some(id) = current {
            if !visited.insert(id) {
                return Err(ContractError::new(
                    path,
                    format!("category tree contains a cycle at {id}"),
                ));
            }
            current = parents.get(&id).copied().flatten();
        }
    }
    Ok(())
}

fn validate_meta(
    meta: &ArticleMeta,
    categories: &BTreeSet<i64>,
    tags: &BTreeSet<i64>,
    parents: &BTreeSet<i64>,
    directory: &Path,
) -> Result<(), ContractError> {
    let path = directory.join("meta.json");
    validate_identity(meta.id, &meta.title, &path, "article")?;
    if meta.summary.chars().count() > protocol::MAX_SUMMARY_CHARS {
        return Err(ContractError::new(
            &path,
            format!(
                "summary must contain at most {} Unicode scalar values",
                protocol::MAX_SUMMARY_CHARS
            ),
        ));
    }
    let mut seen = BTreeSet::new();
    for id in &meta.category_ids {
        if !seen.insert(*id) {
            return Err(ContractError::new(
                &path,
                format!("duplicate category id {id}"),
            ));
        }
        if !categories.contains(id) {
            return Err(ContractError::new(
                &path,
                format!("category {id} is not present in taxonomy"),
            ));
        }
        if parents.contains(id) {
            return Err(ContractError::new(
                &path,
                format!("category {id} is not a leaf"),
            ));
        }
    }
    let mut seen = BTreeSet::new();
    for id in &meta.tag_ids {
        if !seen.insert(*id) {
            return Err(ContractError::new(&path, format!("duplicate tag id {id}")));
        }
        if !tags.contains(id) {
            return Err(ContractError::new(
                &path,
                format!("tag {id} is not present in taxonomy"),
            ));
        }
    }
    Ok(())
}

pub fn write_snapshot(root: &Path, snapshot: &ContentSnapshot) -> Result<(), ContractError> {
    validate_snapshot(snapshot)?;
    fs::create_dir(root)
        .map_err(|e| ContractError::new(root, format!("create repository root: {e}")))?;
    write_json(&root.join(TAXONOMY_FILE), &snapshot.taxonomy)?;
    if snapshot.articles.is_empty() {
        return Ok(());
    }
    let articles = root.join(ARTICLES_DIR);
    fs::create_dir(&articles)
        .map_err(|e| ContractError::new(&articles, format!("create articles directory: {e}")))?;
    for article in &snapshot.articles {
        let directory = articles.join(article.meta.id.to_string());
        fs::create_dir(&directory).map_err(|e| {
            ContractError::new(&directory, format!("create article directory: {e}"))
        })?;
        write_json(&directory.join("meta.json"), &article.meta)?;
        let path = directory.join("content.html");
        fs::write(&path, &article.content_html)
            .map_err(|e| ContractError::new(&path, format!("write HTML: {e}")))?;
    }
    Ok(())
}

pub fn read_snapshot(root: &Path) -> Result<ContentSnapshot, ContractError> {
    let taxonomy = read_json::<TaxonomyFile>(&root.join(TAXONOMY_FILE))?;
    let article_root = root.join(ARTICLES_DIR);
    let entries = match fs::read_dir(&article_root) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let snapshot = ContentSnapshot {
                taxonomy,
                articles: Vec::new(),
            };
            validate_snapshot(&snapshot)?;
            return Ok(snapshot);
        }
        Err(e) => {
            return Err(ContractError::new(
                &article_root,
                format!("read directory: {e}"),
            ));
        }
    };
    let mut directories = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| ContractError::new(&article_root, e.to_string()))?;
        if !entry
            .file_type()
            .map_err(|e| ContractError::new(entry.path(), e.to_string()))?
            .is_dir()
        {
            return Err(ContractError::new(
                entry.path(),
                "articles must contain numeric article directories only",
            ));
        }
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| ContractError::new(entry.path(), "article directory name is not UTF-8"))?;
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
        directories.push((id, entry.path()));
    }
    directories.sort_by_key(|v| v.0);
    let mut articles = Vec::new();
    for (id, directory) in directories {
        let meta_path = directory.join("meta.json");
        let meta = read_json::<ArticleMeta>(&meta_path)?;
        if meta.id != id {
            return Err(ContractError::new(
                &meta_path,
                format!("meta id {} does not match directory id {id}", meta.id),
            ));
        }
        let html_path = directory.join("content.html");
        let content_html = fs::read_to_string(&html_path)
            .map_err(|e| ContractError::new(&html_path, format!("read UTF-8 HTML: {e}")))?;
        articles.push(ContentArticle { meta, content_html });
    }
    let snapshot = ContentSnapshot { taxonomy, articles };
    validate_snapshot(&snapshot)?;
    Ok(snapshot)
}

fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, ContractError> {
    let bytes = fs::read(path).map_err(|e| ContractError::new(path, format!("read JSON: {e}")))?;
    serde_json::from_slice(&bytes)
        .map_err(|e| ContractError::new(path, format!("invalid JSON: {e}")))
}
fn write_json(path: &Path, value: &impl serde::Serialize) -> Result<(), ContractError> {
    let mut bytes =
        serde_json::to_vec_pretty(value).map_err(|e| ContractError::new(path, e.to_string()))?;
    bytes.push(b'\n');
    fs::write(path, bytes).map_err(|e| ContractError::new(path, format!("write JSON: {e}")))
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
fn format_inspection_error(value: &Inspection) -> String {
    value
        .diagnostics
        .first()
        .map(|v| format!("invalid HTML {}: {}", v.code, v.message))
        .unwrap_or_else(|| "invalid HTML".into())
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
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.path.display(), self.message)
    }
}
impl std::error::Error for ContractError {}

#[cfg(test)]
mod tests {
    use super::*;
    fn taxonomy() -> TaxonomyFile {
        TaxonomyFile {
            version: 1,
            next_category_id: 4,
            next_tag_id: 12,
            categories: vec![
                TaxonomyCategory {
                    id: 1,
                    name: "Engineering".into(),
                    parent_id: None,
                    position: 10,
                },
                TaxonomyCategory {
                    id: 2,
                    name: "Rust".into(),
                    parent_id: Some(1),
                    position: 10,
                },
                TaxonomyCategory {
                    id: 3,
                    name: "Web".into(),
                    parent_id: Some(1),
                    position: 20,
                },
            ],
            tags: vec![TaxonomyTag {
                id: 11,
                name: "Performance".into(),
            }],
        }
    }
    fn article() -> ContentArticle {
        ContentArticle {
            meta: ArticleMeta {
                id: 1001,
                title: "Borrowing".into(),
                summary: String::new(),
                category_ids: vec![2, 3],
                tag_ids: vec![11],
                created_at: "2026-01-01T00:00:00Z".into(),
                updated_at: "2026-01-01T00:00:00Z".into(),
                published_at: None,
            },
            content_html: "<p>hello</p>".into(),
        }
    }
    #[test]
    fn validates_tree_watermarks_and_leaf_references() {
        let snapshot = ContentSnapshot {
            taxonomy: taxonomy(),
            articles: vec![article()],
        };
        validate_snapshot(&snapshot).unwrap();
        let mut invalid = snapshot.clone();
        invalid.articles[0].meta.category_ids = vec![1];
        assert!(
            validate_snapshot(&invalid)
                .unwrap_err()
                .to_string()
                .contains("not a leaf")
        );
        let mut invalid = snapshot;
        invalid.taxonomy.next_category_id = 3;
        assert!(
            validate_snapshot(&invalid)
                .unwrap_err()
                .to_string()
                .contains("next_category_id")
        );
    }
    #[test]
    fn uncategorized_draft_is_valid_only_inside_the_workspace() {
        let mut value = article();
        value.meta.category_ids.clear();
        let snapshot = ContentSnapshot {
            taxonomy: taxonomy(),
            articles: vec![value],
        };
        validate_snapshot(&snapshot).unwrap();
        assert!(
            validate_publishable_snapshot(&snapshot)
                .unwrap_err()
                .to_string()
                .contains("at least one leaf category")
        );
    }

    #[test]
    fn publishable_metadata_requires_ordered_rfc3339_timestamps() {
        let mut snapshot = ContentSnapshot {
            taxonomy: taxonomy(),
            articles: vec![article()],
        };
        snapshot.articles[0].meta.published_at = Some("2026-01-02T01:30:00+01:30".into());
        validate_publishable_snapshot(&snapshot).unwrap();

        snapshot.articles[0].meta.updated_at = "2025-12-31T23:59:59Z".into();
        assert!(
            validate_publishable_snapshot(&snapshot)
                .unwrap_err()
                .to_string()
                .contains("createdAt must not be later")
        );
        snapshot.articles[0].meta.updated_at = "2026-01-01T00:00:00Z".into();
        snapshot.articles[0].meta.published_at = Some("2025-12-31T23:59:59Z".into());
        assert!(
            validate_publishable_snapshot(&snapshot)
                .unwrap_err()
                .to_string()
                .contains("publishedAt must not be earlier")
        );
        snapshot.articles[0].meta.published_at = Some("2026-02-30T00:00:00Z".into());
        assert!(
            validate_publishable_snapshot(&snapshot)
                .unwrap_err()
                .to_string()
                .contains("publishedAt must be RFC3339")
        );
        snapshot.articles[0].meta.created_at = "2026-01-01 00:00:00Z".into();
        assert!(
            validate_publishable_snapshot(&snapshot)
                .unwrap_err()
                .to_string()
                .contains("createdAt must be RFC3339")
        );
    }
    #[test]
    fn rejects_cycles_duplicate_names_and_dangling_tags() {
        let mut value = taxonomy();
        value.categories[0].parent_id = Some(2);
        assert!(
            validate_taxonomy(&value, Path::new(TAXONOMY_FILE))
                .unwrap_err()
                .to_string()
                .contains("cycle")
        );
        let mut value = taxonomy();
        value.categories[2].name = " rust ".into();
        assert!(
            validate_taxonomy(&value, Path::new(TAXONOMY_FILE))
                .unwrap_err()
                .to_string()
                .contains("duplicate category name")
        );
        let mut snapshot = ContentSnapshot {
            taxonomy: taxonomy(),
            articles: vec![article()],
        };
        snapshot.articles[0].meta.tag_ids = vec![999];
        assert!(
            validate_snapshot(&snapshot)
                .unwrap_err()
                .to_string()
                .contains("tag 999")
        );
    }
    #[test]
    fn repository_round_trip_preserves_raw_html() {
        let root =
            std::env::temp_dir().join(format!("blog-taxonomy-contract-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let snapshot = ContentSnapshot {
            taxonomy: taxonomy(),
            articles: vec![article()],
        };
        write_snapshot(&root, &snapshot).unwrap();
        assert_eq!(read_snapshot(&root).unwrap(), snapshot);
        assert_eq!(
            fs::read_to_string(root.join("articles/1001/content.html")).unwrap(),
            "<p>hello</p>"
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn rejects_invalid_html() {
        let mut snapshot = ContentSnapshot {
            taxonomy: taxonomy(),
            articles: vec![article()],
        };
        snapshot.articles[0].content_html = "<script>bad()</script>".into();
        assert!(
            validate_snapshot(&snapshot)
                .unwrap_err()
                .to_string()
                .contains("invalid HTML")
        );
    }
    #[test]
    fn empty_repository_needs_only_taxonomy() {
        let root = std::env::temp_dir().join(format!("blog-taxonomy-empty-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        write_snapshot(&root, &ContentSnapshot::default()).unwrap();
        assert!(!root.join(ARTICLES_DIR).exists());
        assert_eq!(read_snapshot(&root).unwrap(), ContentSnapshot::default());
        fs::remove_dir_all(root).unwrap();
    }
}
