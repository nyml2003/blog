//! Category-tree shelf assembly for both Mobile F-shaped entry points.

use protocol::{ContentSnapshot, ContentSnapshotArticle};
use std::collections::{BTreeSet, HashMap};

#[derive(Debug)]
pub struct CategoryShelf<'a> {
    pub selected_category_id: Option<i64>,
    pub articles: Vec<&'a ContentSnapshotArticle>,
}

pub fn assemble(
    snapshot: &ContentSnapshot,
    selected: Option<i64>,
) -> Result<CategoryShelf<'_>, String> {
    let ids: BTreeSet<_> = snapshot
        .taxonomy
        .categories
        .iter()
        .map(|value| value.id)
        .collect();
    if selected.is_some_and(|id| !ids.contains(&id)) {
        return Err("category_id does not exist".into());
    }
    let parent_ids: BTreeSet<_> = snapshot
        .taxonomy
        .categories
        .iter()
        .filter_map(|value| value.parent_id)
        .collect();
    let parents: HashMap<_, _> = snapshot
        .taxonomy
        .categories
        .iter()
        .map(|value| (value.id, value.parent_id))
        .collect();
    let leaves: BTreeSet<_> = snapshot
        .taxonomy
        .categories
        .iter()
        .filter(|value| !parent_ids.contains(&value.id))
        .filter(|value| selected.is_none_or(|ancestor| is_descendant(&parents, value.id, ancestor)))
        .map(|value| value.id)
        .collect();
    let articles = snapshot
        .articles
        .iter()
        .filter(|article| {
            article.meta.published_at.is_some()
                && article
                    .meta
                    .category_ids
                    .iter()
                    .any(|id| leaves.contains(id))
        })
        .collect();
    Ok(CategoryShelf {
        selected_category_id: selected,
        articles,
    })
}

fn is_descendant(parents: &HashMap<i64, Option<i64>>, leaf: i64, ancestor: i64) -> bool {
    let mut current = Some(leaf);
    while let Some(id) = current {
        if id == ancestor {
            return true;
        }
        current = parents.get(&id).copied().flatten();
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use protocol::{Category, ContentArticleMeta, Tag, Taxonomy};
    fn article(id: i64, categories: Vec<i64>) -> ContentSnapshotArticle {
        ContentSnapshotArticle {
            meta: ContentArticleMeta {
                id,
                title: id.to_string(),
                summary: String::new(),
                category_ids: categories,
                tag_ids: Vec::new(),
                created_at: "c".into(),
                updated_at: "u".into(),
                published_at: Some("p".into()),
            },
            content_html: "<p>x</p>".into(),
        }
    }
    #[test]
    fn parent_aggregation_deduplicates_multi_leaf_articles() {
        let snapshot = ContentSnapshot {
            taxonomy: Taxonomy {
                version: 1,
                next_category_id: 4,
                next_tag_id: 1,
                categories: vec![
                    Category {
                        id: 1,
                        name: "root".into(),
                        parent_id: None,
                        position: 10,
                    },
                    Category {
                        id: 2,
                        name: "a".into(),
                        parent_id: Some(1),
                        position: 10,
                    },
                    Category {
                        id: 3,
                        name: "b".into(),
                        parent_id: Some(1),
                        position: 20,
                    },
                ],
                tags: Vec::<Tag>::new(),
            },
            articles: vec![article(7, vec![2, 3])],
        };
        let shelf = assemble(&snapshot, Some(1)).unwrap();
        assert_eq!(shelf.articles.len(), 1);
        assert_eq!(shelf.articles[0].meta.id, 7);
    }
    #[test]
    fn unknown_selection_is_rejected() {
        assert_eq!(
            assemble(&ContentSnapshot::default(), Some(9)).unwrap_err(),
            "category_id does not exist"
        );
    }
}
