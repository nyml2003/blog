//! Data-owned validation that depends on the current taxonomy state.

use protocol::envelope::codes;
use protocol::{ArticleBrowseQuery, OperationFailure};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone)]
pub(super) struct ProjectedType {
    pub id: i64,
    pub name: String,
}
#[derive(Debug, Clone)]
pub(super) struct ProjectedTerm {
    pub id: i64,
    pub name: String,
    pub kind: &'static str,
}
#[derive(Debug, Clone)]
pub(super) struct ProjectedArticle {
    pub id: i64,
    pub title: String,
    pub summary: String,
    pub article_type_id: i64,
    pub content_html: String,
    pub created_at: String,
    pub updated_at: String,
    pub published_at: String,
    pub term_ids: Vec<i64>,
}
#[derive(Debug, Clone)]
pub(super) struct LegacyProjection {
    pub types: Vec<ProjectedType>,
    pub terms: Vec<ProjectedTerm>,
    pub articles: Vec<ProjectedArticle>,
}

/// Stable compatibility projection for legacy public DTOs. Category and tag term IDs use
/// disjoint parity namespaces; checked arithmetic turns overflow into an atomic rejection.
pub(super) fn legacy_projection(
    snapshot: &protocol::ContentSnapshot,
) -> Result<LegacyProjection, OperationFailure> {
    let invalid = |message: String| OperationFailure::new(codes::INVALID_PAYLOAD, message);
    let categories = snapshot
        .taxonomy
        .categories
        .iter()
        .map(|v| (v.id, v))
        .collect::<BTreeMap<_, _>>();
    let parent_ids = snapshot
        .taxonomy
        .categories
        .iter()
        .filter_map(|v| v.parent_id)
        .collect::<BTreeSet<_>>();
    let mut roots = snapshot
        .taxonomy
        .categories
        .iter()
        .filter(|v| v.parent_id.is_none())
        .collect::<Vec<_>>();
    roots.sort_by_key(|v| (v.position, v.id));
    let types = roots
        .iter()
        .map(|v| ProjectedType {
            id: v.id,
            name: v.name.clone(),
        })
        .collect();
    let mut terms = Vec::new();
    for category in snapshot
        .taxonomy
        .categories
        .iter()
        .filter(|v| !parent_ids.contains(&v.id))
    {
        let id = category
            .id
            .checked_mul(2)
            .ok_or_else(|| invalid("category term ID projection overflow".to_owned()))?;
        terms.push(ProjectedTerm {
            id,
            name: category.name.clone(),
            kind: protocol::TERM_KIND_TOPIC,
        });
    }
    for tag in &snapshot.taxonomy.tags {
        let id = tag
            .id
            .checked_mul(2)
            .and_then(|v| v.checked_add(1))
            .ok_or_else(|| invalid("tag term ID projection overflow".to_owned()))?;
        terms.push(ProjectedTerm {
            id,
            name: tag.name.clone(),
            kind: protocol::TERM_KIND_TAG,
        });
    }
    let mut articles = Vec::new();
    for article in &snapshot.articles {
        if article.meta.category_ids.is_empty() {
            return Err(invalid(format!(
                "article {} must reference at least one leaf category",
                article.meta.id
            )));
        }
        let published_at = article.meta.published_at.clone().ok_or_else(|| {
            invalid(format!(
                "main article {} has no recovered publication time",
                article.meta.id
            ))
        })?;
        let mut candidates = Vec::new();
        let mut term_ids = Vec::new();
        for leaf_id in &article.meta.category_ids {
            term_ids.push(
                leaf_id
                    .checked_mul(2)
                    .ok_or_else(|| invalid("category term ID projection overflow".to_owned()))?,
            );
            let mut current = *leaf_id;
            loop {
                let category = categories
                    .get(&current)
                    .ok_or_else(|| invalid(format!("category {current} is missing")))?;
                match category.parent_id {
                    Some(parent) => current = parent,
                    None => {
                        candidates.push((category.position, category.id));
                        break;
                    }
                }
            }
        }
        for tag_id in &article.meta.tag_ids {
            term_ids.push(
                tag_id
                    .checked_mul(2)
                    .and_then(|v| v.checked_add(1))
                    .ok_or_else(|| invalid("tag term ID projection overflow".to_owned()))?,
            );
        }
        candidates.sort();
        term_ids.sort_unstable();
        term_ids.dedup();
        let article_type_id = candidates
            .first()
            .map(|v| v.1)
            .ok_or_else(|| invalid("article type projection is empty".to_owned()))?;
        articles.push(ProjectedArticle {
            id: article.meta.id,
            title: article.meta.title.clone(),
            summary: article.meta.summary.clone(),
            article_type_id,
            content_html: article.content_html.clone(),
            created_at: article.meta.created_at.clone(),
            updated_at: article.meta.updated_at.clone(),
            published_at,
            term_ids,
        });
    }
    Ok(LegacyProjection {
        types,
        terms,
        articles,
    })
}

/// Validate that browse term ids exist and belong to the requested dimensions.
pub(super) fn browse_term_kind_failure<'a>(
    query: &ArticleBrowseQuery,
    kind_of: impl Fn(i64) -> Option<&'a str>,
) -> Option<OperationFailure> {
    for (term_id, expected_kind) in query.term_dimensions() {
        let failure = match kind_of(term_id) {
            None => OperationFailure::new(
                codes::INVALID_PAYLOAD,
                format!("{expected_kind} term {term_id} not found"),
            ),
            Some(kind) if kind != expected_kind => OperationFailure::new(
                codes::INVALID_PAYLOAD,
                format!("term {term_id} has kind '{kind}', expected '{expected_kind}'"),
            ),
            Some(_) => continue,
        };
        return Some(failure);
    }
    None
}

pub(super) fn content_snapshot_failure(
    snapshot: &protocol::ContentSnapshot,
) -> Option<OperationFailure> {
    let taxonomy = &snapshot.taxonomy;
    let invalid = |message: String| OperationFailure::new(codes::INVALID_PAYLOAD, message);
    if taxonomy.version != protocol::TAXONOMY_SCHEMA_VERSION {
        return Some(invalid("unsupported taxonomy version".into()));
    }
    if taxonomy.next_category_id <= 0 || taxonomy.next_tag_id <= 0 {
        return Some(invalid("taxonomy ID watermarks must be positive".into()));
    }
    let mut ids = BTreeSet::new();
    let mut category_names = BTreeSet::new();
    let mut category_positions = BTreeSet::new();
    for category in &taxonomy.categories {
        if category.id <= 0
            || category.id >= taxonomy.next_category_id
            || category.name.trim().is_empty()
            || category.position < 0
        {
            return Some(invalid(format!("invalid category {}", category.id)));
        }
        if !ids.insert(category.id) {
            return Some(invalid(format!("duplicate category id {}", category.id)));
        }
        if !category_names.insert((category.parent_id, category.name.trim().to_lowercase())) {
            return Some(invalid(format!(
                "duplicate category name {:?} under the same parent",
                category.name
            )));
        }
        if !category_positions.insert((category.parent_id, category.position)) {
            return Some(invalid(format!(
                "duplicate category position {} under the same parent",
                category.position
            )));
        }
    }
    let parents: BTreeMap<_, _> = taxonomy
        .categories
        .iter()
        .map(|v| (v.id, v.parent_id))
        .collect();
    for category in &taxonomy.categories {
        let mut seen = BTreeSet::new();
        let mut current = Some(category.id);
        while let Some(id) = current {
            if !seen.insert(id) {
                return Some(invalid(format!("category cycle at {id}")));
            }
            current = match parents.get(&id) {
                Some(parent) => *parent,
                None => return Some(invalid(format!("category parent {id} does not exist"))),
            };
        }
    }
    let parent_ids: BTreeSet<_> = taxonomy
        .categories
        .iter()
        .filter_map(|v| v.parent_id)
        .collect();
    let mut tag_ids = BTreeSet::new();
    let mut tag_names = BTreeSet::new();
    for tag in &taxonomy.tags {
        if tag.id <= 0 || tag.id >= taxonomy.next_tag_id || tag.name.trim().is_empty() {
            return Some(invalid(format!("invalid tag {}", tag.id)));
        }
        if !tag_ids.insert(tag.id) {
            return Some(invalid(format!("duplicate tag id {}", tag.id)));
        }
        if !tag_names.insert(tag.name.trim().to_lowercase()) {
            return Some(invalid(format!("duplicate tag name {:?}", tag.name)));
        }
    }
    let mut article_ids = BTreeSet::new();
    for article in &snapshot.articles {
        if article.meta.id <= 0 || !article_ids.insert(article.meta.id) {
            return Some(invalid(format!(
                "invalid or duplicate article id {}",
                article.meta.id
            )));
        }
        if article.meta.title.trim().is_empty()
            || article.meta.summary.chars().count() > protocol::MAX_SUMMARY_CHARS
        {
            return Some(invalid(format!(
                "article {} has invalid title or summary",
                article.meta.id
            )));
        }
        let mut refs = BTreeSet::new();
        for id in &article.meta.category_ids {
            if !refs.insert(*id) || !ids.contains(id) || parent_ids.contains(id) {
                return Some(invalid(format!(
                    "article {} has invalid leaf category {id}",
                    article.meta.id
                )));
            }
        }
        let mut refs = BTreeSet::new();
        for id in &article.meta.tag_ids {
            if !refs.insert(*id) || !tag_ids.contains(id) {
                return Some(invalid(format!(
                    "article {} has invalid tag {id}",
                    article.meta.id
                )));
            }
        }
    }
    None
}

pub(super) fn content_history_failure(
    previous: &protocol::ContentSnapshot,
    next: &protocol::ContentSnapshot,
) -> Option<OperationFailure> {
    let fail = |message| OperationFailure::new(codes::INVALID_PAYLOAD, message);
    if next.taxonomy.next_category_id < previous.taxonomy.next_category_id {
        return Some(fail("next_category_id cannot move backwards"));
    }
    if next.taxonomy.next_tag_id < previous.taxonomy.next_tag_id {
        return Some(fail("next_tag_id cannot move backwards"));
    }
    let previous_categories: BTreeSet<_> = previous
        .taxonomy
        .categories
        .iter()
        .map(|value| value.id)
        .collect();
    if next.taxonomy.categories.iter().any(|value| {
        !previous_categories.contains(&value.id) && value.id < previous.taxonomy.next_category_id
    }) {
        return Some(fail("a retired category ID cannot be reused"));
    }
    let previous_tags: BTreeSet<_> = previous
        .taxonomy
        .tags
        .iter()
        .map(|value| value.id)
        .collect();
    if next
        .taxonomy
        .tags
        .iter()
        .any(|value| !previous_tags.contains(&value.id) && value.id < previous.taxonomy.next_tag_id)
    {
        return Some(fail("a retired tag ID cannot be reused"));
    }
    None
}

pub(super) fn content_workflow_failure(
    state: &protocol::ContentWorkflowState,
) -> Option<OperationFailure> {
    if let Some(failure) = content_snapshot_failure(&state.snapshot) {
        return Some(failure);
    }
    if let Some(failure) = content_snapshot_failure(&state.committed_snapshot) {
        return Some(failure);
    }
    if let Some(failure) = content_snapshot_failure(&state.batch_base_snapshot) {
        return Some(failure);
    }
    if let Some(version) = state.committed_version {
        if version > state.workspace_version {
            return Some(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                "committed workflow version exceeds workspace version",
            ));
        }
    }
    let actual_ids: BTreeSet<_> = state
        .snapshot
        .articles
        .iter()
        .map(|article| article.meta.id)
        .collect();
    let known_ids: BTreeSet<_> = state.known_article_ids.iter().copied().collect();
    if known_ids.len() != state.known_article_ids.len() || !actual_ids.is_subset(&known_ids) {
        return Some(OperationFailure::new(
            codes::INVALID_PAYLOAD,
            "known article IDs must be unique and include the current snapshot",
        ));
    }
    if let Some(pending) = &state.pending_taxonomy_review {
        if pending.workspace_version != state.workspace_version {
            return Some(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                "pending taxonomy review is stale",
            ));
        }
        if pending.prompt_version.trim().is_empty()
            || pending.change_schema_version == 0
            || pending.proposal_json.trim().is_empty()
            || pending.diff_json.trim().is_empty()
        {
            return Some(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                "pending taxonomy review metadata is incomplete",
            ));
        }
        if let Some(failure) = content_snapshot_failure(&pending.applied_snapshot) {
            return Some(failure);
        }
    }
    if let Some(batch) = &state.remote_batch {
        if batch.branch.trim().is_empty()
            || batch.commit.trim().is_empty()
            || batch.base_commit.trim().is_empty()
            || batch.pull_request == 0
        {
            return Some(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                "remote batch metadata is incomplete",
            ));
        }
    }
    if let Some(operation) = &state.pending_remote_operation {
        if operation.workspace_version != state.workspace_version
            || operation.branch.trim().is_empty()
            || operation.base_commit.trim().is_empty()
            || (operation.kind == protocol::ContentRemoteOperationKind::Submit
                && operation.target_digest.len() != 64)
        {
            return Some(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                "pending remote operation metadata is incomplete",
            ));
        }
    }
    if matches!(state.status, protocol::ContentWorkspaceStatus::Submitting)
        && !matches!(
            state.pending_remote_operation.as_ref().map(|v| v.kind),
            Some(protocol::ContentRemoteOperationKind::Submit)
        )
    {
        return Some(OperationFailure::new(
            codes::INVALID_PAYLOAD,
            "submitting workflow has no submit intent",
        ));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browse_validation_preserves_the_public_failure_messages() {
        let query = ArticleBrowseQuery {
            topic_id: Some(7),
            tag_id: Some(8),
            ..ArticleBrowseQuery::default()
        };
        let missing = browse_term_kind_failure(&query, |_| None).unwrap();
        assert_eq!(missing.code, codes::INVALID_PAYLOAD);
        assert_eq!(missing.message, "topic term 7 not found");

        let wrong_kind = browse_term_kind_failure(&query, |id| match id {
            7 => Some("tag"),
            _ => None,
        })
        .unwrap();
        assert_eq!(wrong_kind.code, codes::INVALID_PAYLOAD);
        assert_eq!(
            wrong_kind.message,
            "term 7 has kind 'tag', expected 'topic'"
        );
    }
}
