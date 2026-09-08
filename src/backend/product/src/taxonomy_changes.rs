//! Deterministic application of versioned model taxonomy proposals.

use crate::content_contract::{
    ContentSnapshot, TaxonomyCategory, TaxonomyFile, TaxonomyTag, validate_snapshot,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;

pub const CHANGE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaxonomyChangeSet {
    pub version: u32,
    pub operations: Vec<TaxonomyChange>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum CategorySelector {
    Existing { id: i64 },
    Proposed { reference: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum TagSelector {
    Existing { id: i64 },
    Proposed { reference: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
pub enum TaxonomyChange {
    AddCategory {
        reference: String,
        name: String,
        parent: Option<CategorySelector>,
        position: i32,
    },
    MoveCategory {
        category_id: i64,
        parent: Option<CategorySelector>,
        position: i32,
    },
    RenameCategory {
        category_id: i64,
        name: String,
    },
    MergeCategory {
        source_category_id: i64,
        target_category_id: i64,
    },
    AddTag {
        reference: String,
        name: String,
    },
    RenameTag {
        tag_id: i64,
        name: String,
    },
    SetArticleCategories {
        article_id: i64,
        categories: Vec<CategorySelector>,
    },
    SetArticleTags {
        article_id: i64,
        tags: Vec<TagSelector>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChangeDiff {
    pub operation_index: usize,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AppliedTaxonomyChanges {
    pub snapshot: ContentSnapshot,
    pub category_allocations: BTreeMap<String, i64>,
    pub tag_allocations: BTreeMap<String, i64>,
    pub diff: Vec<ChangeDiff>,
    pub normalized_diff: NormalizedTaxonomyDiff,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedTaxonomyDiff {
    pub taxonomy_before: TaxonomyFile,
    pub taxonomy_after: TaxonomyFile,
    pub articles: Vec<ArticleMetaDiff>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ArticleMetaDiff {
    pub article_id: i64,
    pub before: Option<crate::content_contract::ArticleMeta>,
    pub after: Option<crate::content_contract::ArticleMeta>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChangeError {
    pub operation_index: Option<usize>,
    pub message: String,
}
impl fmt::Display for ChangeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.operation_index {
            Some(i) => write!(f, "taxonomy operation {i}: {}", self.message),
            None => f.write_str(&self.message),
        }
    }
}
impl std::error::Error for ChangeError {}

pub fn apply_changes(
    current: &ContentSnapshot,
    changes: &TaxonomyChangeSet,
) -> Result<AppliedTaxonomyChanges, ChangeError> {
    validate_snapshot(current).map_err(|e| ChangeError {
        operation_index: None,
        message: format!("current snapshot is invalid: {e}"),
    })?;
    if changes.version != CHANGE_SCHEMA_VERSION {
        return Err(ChangeError {
            operation_index: None,
            message: format!("unsupported change schema version {}", changes.version),
        });
    }
    let mut next = current.clone();
    let mut category_allocations = BTreeMap::new();
    let mut tag_allocations = BTreeMap::new();
    let mut diff = Vec::new();
    for (index, operation) in changes.operations.iter().enumerate() {
        apply_one(
            &mut next,
            operation,
            &mut category_allocations,
            &mut tag_allocations,
            index,
            &mut diff,
        )?;
    }
    normalize(&mut next);
    validate_snapshot(&next).map_err(|e| ChangeError {
        operation_index: changes.operations.len().checked_sub(1),
        message: format!("normalized result is invalid: {e}"),
    })?;
    let normalized_diff = normalized_diff(current, &next);
    if normalized_diff.taxonomy_before == normalized_diff.taxonomy_after
        && normalized_diff.articles.is_empty()
    {
        return Err(ChangeError {
            operation_index: None,
            message: "taxonomy proposal produces no changes".to_owned(),
        });
    }
    Ok(AppliedTaxonomyChanges {
        snapshot: next,
        category_allocations,
        tag_allocations,
        diff,
        normalized_diff,
        warnings: Vec::new(),
    })
}

pub fn apply_changes_for_articles(
    current: &ContentSnapshot,
    changes: &TaxonomyChangeSet,
    allowed_article_ids: &[i64],
) -> Result<AppliedTaxonomyChanges, ChangeError> {
    for (index, operation) in changes.operations.iter().enumerate() {
        let article_id = match operation {
            TaxonomyChange::SetArticleCategories { article_id, .. }
            | TaxonomyChange::SetArticleTags { article_id, .. } => Some(*article_id),
            _ => None,
        };
        if article_id.is_some_and(|id| !allowed_article_ids.contains(&id)) {
            return Err(ChangeError {
                operation_index: Some(index),
                message: "model may only assign categories or tags to explicitly selected articles"
                    .to_owned(),
            });
        }
    }
    apply_changes(current, changes)
}

fn apply_one(
    snapshot: &mut ContentSnapshot,
    operation: &TaxonomyChange,
    category_refs: &mut BTreeMap<String, i64>,
    tag_refs: &mut BTreeMap<String, i64>,
    index: usize,
    diff: &mut Vec<ChangeDiff>,
) -> Result<(), ChangeError> {
    let fail = |message| ChangeError {
        operation_index: Some(index),
        message,
    };
    let description = match operation {
        TaxonomyChange::AddCategory {
            reference,
            name,
            parent,
            position,
        } => {
            validate_ref(reference).map_err(&fail)?;
            if category_refs.contains_key(reference) {
                return Err(fail(format!(
                    "duplicate proposed category reference {reference:?}"
                )));
            }
            let parent_id = parent
                .as_ref()
                .map(|v| resolve_category(v, category_refs))
                .transpose()
                .map_err(&fail)?;
            let id = allocate(&mut snapshot.taxonomy.next_category_id).map_err(&fail)?;
            snapshot.taxonomy.categories.push(TaxonomyCategory {
                id,
                name: name.trim().to_owned(),
                parent_id,
                position: *position,
            });
            category_refs.insert(reference.clone(), id);
            format!("add category {id} ({reference})")
        }
        TaxonomyChange::MoveCategory {
            category_id,
            parent,
            position,
        } => {
            let parent_id = parent
                .as_ref()
                .map(|value| resolve_category(value, category_refs))
                .transpose()
                .map_err(&fail)?;
            let value = snapshot
                .taxonomy
                .categories
                .iter_mut()
                .find(|v| v.id == *category_id)
                .ok_or_else(|| fail(format!("category {category_id} does not exist")))?;
            value.parent_id = parent_id;
            value.position = *position;
            format!("move category {category_id}")
        }
        TaxonomyChange::RenameCategory { category_id, name } => {
            let value = snapshot
                .taxonomy
                .categories
                .iter_mut()
                .find(|v| v.id == *category_id)
                .ok_or_else(|| fail(format!("category {category_id} does not exist")))?;
            value.name = name.trim().to_owned();
            format!("rename category {category_id}")
        }
        TaxonomyChange::MergeCategory {
            source_category_id,
            target_category_id,
        } => {
            if source_category_id == target_category_id {
                return Err(fail("merge source and target must differ".into()));
            }
            ensure_leaf(snapshot, *source_category_id).map_err(&fail)?;
            ensure_leaf(snapshot, *target_category_id).map_err(&fail)?;
            snapshot
                .taxonomy
                .categories
                .retain(|v| v.id != *source_category_id);
            let mut migrated_articles = Vec::new();
            for article in &mut snapshot.articles {
                if article.meta.category_ids.contains(source_category_id) {
                    article
                        .meta
                        .category_ids
                        .retain(|id| id != source_category_id);
                    article.meta.category_ids.push(*target_category_id);
                    migrated_articles.push(article.meta.id);
                }
            }
            format!(
                "merge category {source_category_id} into {target_category_id}; migrated article refs {migrated_articles:?}"
            )
        }
        TaxonomyChange::AddTag { reference, name } => {
            validate_ref(reference).map_err(&fail)?;
            if tag_refs.contains_key(reference) {
                return Err(fail(format!(
                    "duplicate proposed tag reference {reference:?}"
                )));
            }
            let id = allocate(&mut snapshot.taxonomy.next_tag_id).map_err(&fail)?;
            snapshot.taxonomy.tags.push(TaxonomyTag {
                id,
                name: name.trim().to_owned(),
            });
            tag_refs.insert(reference.clone(), id);
            format!("add tag {id} ({reference})")
        }
        TaxonomyChange::RenameTag { tag_id, name } => {
            let value = snapshot
                .taxonomy
                .tags
                .iter_mut()
                .find(|v| v.id == *tag_id)
                .ok_or_else(|| fail(format!("tag {tag_id} does not exist")))?;
            value.name = name.trim().to_owned();
            format!("rename tag {tag_id}")
        }
        TaxonomyChange::SetArticleCategories {
            article_id,
            categories,
        } => {
            let ids = categories
                .iter()
                .map(|v| resolve_category(v, category_refs))
                .collect::<Result<Vec<_>, _>>()
                .map_err(&fail)?;
            let article = snapshot
                .articles
                .iter_mut()
                .find(|v| v.meta.id == *article_id)
                .ok_or_else(|| fail(format!("article {article_id} does not exist")))?;
            article.meta.category_ids = ids;
            format!("set article {article_id} categories")
        }
        TaxonomyChange::SetArticleTags { article_id, tags } => {
            let ids = tags
                .iter()
                .map(|v| resolve_tag(v, tag_refs))
                .collect::<Result<Vec<_>, _>>()
                .map_err(&fail)?;
            let article = snapshot
                .articles
                .iter_mut()
                .find(|v| v.meta.id == *article_id)
                .ok_or_else(|| fail(format!("article {article_id} does not exist")))?;
            article.meta.tag_ids = ids;
            format!("set article {article_id} tags")
        }
    };
    diff.push(ChangeDiff {
        operation_index: index,
        description,
    });
    Ok(())
}

fn resolve_category(
    value: &CategorySelector,
    proposed: &BTreeMap<String, i64>,
) -> Result<i64, String> {
    match value {
        CategorySelector::Existing { id } => Ok(*id),
        CategorySelector::Proposed { reference } => proposed
            .get(reference)
            .copied()
            .ok_or_else(|| format!("unknown proposed category reference {reference:?}")),
    }
}
fn resolve_tag(value: &TagSelector, proposed: &BTreeMap<String, i64>) -> Result<i64, String> {
    match value {
        TagSelector::Existing { id } => Ok(*id),
        TagSelector::Proposed { reference } => proposed
            .get(reference)
            .copied()
            .ok_or_else(|| format!("unknown proposed tag reference {reference:?}")),
    }
}
fn validate_ref(value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err("proposed reference must not be empty".into())
    } else {
        Ok(())
    }
}
fn allocate(next: &mut i64) -> Result<i64, String> {
    let id = *next;
    *next = next
        .checked_add(1)
        .ok_or_else(|| "taxonomy ID space exhausted".to_owned())?;
    Ok(id)
}
fn ensure_leaf(snapshot: &ContentSnapshot, id: i64) -> Result<(), String> {
    if !snapshot.taxonomy.categories.iter().any(|v| v.id == id) {
        return Err(format!("category {id} does not exist"));
    }

    if snapshot
        .taxonomy
        .categories
        .iter()
        .any(|v| v.parent_id == Some(id))
    {
        return Err(format!("category {id} is not a mergeable leaf"));
    }
    Ok(())
}
fn normalize(snapshot: &mut ContentSnapshot) {
    snapshot
        .taxonomy
        .categories
        .sort_by_key(|v| (v.parent_id, v.position, v.id));
    snapshot
        .taxonomy
        .tags
        .sort_by(|a, b| a.name.cmp(&b.name).then(a.id.cmp(&b.id)));
    snapshot.articles.sort_by_key(|v| v.meta.id);
    for article in &mut snapshot.articles {
        article.meta.category_ids.sort_unstable();
        article.meta.category_ids.dedup();
        article.meta.tag_ids.sort_unstable();
        article.meta.tag_ids.dedup();
    }
}

fn normalized_diff(before: &ContentSnapshot, after: &ContentSnapshot) -> NormalizedTaxonomyDiff {
    let before_articles: BTreeMap<_, _> = before
        .articles
        .iter()
        .map(|article| (article.meta.id, &article.meta))
        .collect();
    let after_articles: BTreeMap<_, _> = after
        .articles
        .iter()
        .map(|article| (article.meta.id, &article.meta))
        .collect();
    let article_ids: std::collections::BTreeSet<_> = before_articles
        .keys()
        .chain(after_articles.keys())
        .copied()
        .collect();
    let articles = article_ids
        .into_iter()
        .filter_map(|article_id| {
            let before = before_articles.get(&article_id).copied();
            let after = after_articles.get(&article_id).copied();
            if before == after {
                return None;
            }
            Some(ArticleMetaDiff {
                article_id,
                before: before.cloned(),
                after: after.cloned(),
            })
        })
        .collect();
    NormalizedTaxonomyDiff {
        taxonomy_before: before.taxonomy.clone(),
        taxonomy_after: after.taxonomy.clone(),
        articles,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content_contract::{ArticleMeta, ContentArticle, TaxonomyFile};
    fn snapshot() -> ContentSnapshot {
        ContentSnapshot {
            taxonomy: TaxonomyFile {
                version: 1,
                next_category_id: 4,
                next_tag_id: 2,
                categories: vec![
                    TaxonomyCategory {
                        id: 1,
                        name: "Root".into(),
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
                        name: "Go".into(),
                        parent_id: Some(1),
                        position: 20,
                    },
                ],
                tags: vec![TaxonomyTag {
                    id: 1,
                    name: "old".into(),
                }],
            },
            articles: vec![ContentArticle {
                meta: ArticleMeta {
                    id: 7,
                    title: "A".into(),
                    summary: String::new(),
                    category_ids: vec![2, 3],
                    tag_ids: vec![1],
                    created_at: "c".into(),
                    updated_at: "u".into(),
                    published_at: None,
                },
                content_html: "<p>a</p>".into(),
            }],
        }
    }
    #[test]
    fn allocates_ids_and_resolves_proposed_refs() {
        let changes = TaxonomyChangeSet {
            version: 1,
            operations: vec![
                TaxonomyChange::AddCategory {
                    reference: "zig".into(),
                    name: "Zig".into(),
                    parent: Some(CategorySelector::Existing { id: 1 }),
                    position: 30,
                },
                TaxonomyChange::AddTag {
                    reference: "systems".into(),
                    name: "systems".into(),
                },
                TaxonomyChange::SetArticleCategories {
                    article_id: 7,
                    categories: vec![CategorySelector::Proposed {
                        reference: "zig".into(),
                    }],
                },
                TaxonomyChange::SetArticleTags {
                    article_id: 7,
                    tags: vec![TagSelector::Proposed {
                        reference: "systems".into(),
                    }],
                },
            ],
        };
        let applied = apply_changes(&snapshot(), &changes).unwrap();
        assert_eq!(applied.category_allocations["zig"], 4);
        assert_eq!(applied.tag_allocations["systems"], 2);
        assert_eq!(applied.snapshot.articles[0].meta.category_ids, vec![4]);
    }
    #[test]
    fn merge_migrates_and_deduplicates_refs() {
        let changes = TaxonomyChangeSet {
            version: 1,
            operations: vec![TaxonomyChange::MergeCategory {
                source_category_id: 2,
                target_category_id: 3,
            }],
        };
        let applied = apply_changes(&snapshot(), &changes).unwrap();
        assert_eq!(applied.snapshot.articles[0].meta.category_ids, vec![3]);
        assert_eq!(applied.snapshot.taxonomy.next_category_id, 4);
    }
    #[test]
    fn invalid_cycle_rejects_whole_batch() {
        let original = snapshot();
        let changes = TaxonomyChangeSet {
            version: 1,
            operations: vec![TaxonomyChange::MoveCategory {
                category_id: 1,
                parent: Some(CategorySelector::Existing { id: 2 }),
                position: 10,
            }],
        };
        assert!(
            apply_changes(&original, &changes)
                .unwrap_err()
                .to_string()
                .contains("cycle")
        );
        assert_eq!(original.taxonomy.categories[0].parent_id, None);
    }
}
