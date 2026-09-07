//! Mobile F-shelf orchestration. Protocol owns only the serialized shapes.

use protocol::wire::{self, ShelfData, ShelfSection};
use protocol::{ArticleListItem, ArticleShelfData, ArticleShelfQuery, ArticleType};

pub const SHELF_SECTION_LIMIT: usize = 6;
pub const SHELF_RECOMMENDATION_LIMIT: usize = 3;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct MobileShelfRequest {
    pub article_type_id: Option<i64>,
    pub term_ids: Vec<i64>,
    pub created_from: Option<String>,
    pub created_to: Option<String>,
    pub updated_from: Option<String>,
    pub updated_to: Option<String>,
}

pub struct MobileShelfPlan {
    pub query: ArticleShelfQuery,
    pub has_filters: bool,
}

pub fn plan(request: MobileShelfRequest) -> MobileShelfPlan {
    let has_filters = request.article_type_id.is_some()
        || !request.term_ids.is_empty()
        || request.created_from.is_some()
        || request.created_to.is_some()
        || request.updated_from.is_some()
        || request.updated_to.is_some();
    MobileShelfPlan {
        query: ArticleShelfQuery {
            article_type_id: request.article_type_id,
            term_ids: request.term_ids,
            created_from: request.created_from,
            created_to: request.created_to,
            updated_from: request.updated_from,
            updated_to: request.updated_to,
        },
        has_filters,
    }
}

pub fn assemble(data: &ArticleShelfData, has_filters: bool) -> ShelfData {
    let mut sections = Vec::new();
    if !has_filters && !data.recommendation.is_empty() {
        let articles = wire::to_shelf_cards(&data.recommendation);
        sections.push(ShelfSection {
            id: "recommendation".to_owned(),
            title: "推荐".to_owned(),
            total: articles.len(),
            articles: articles
                .into_iter()
                .take(SHELF_RECOMMENDATION_LIMIT)
                .collect(),
        });
    }

    let mut grouped: Vec<(i64, Vec<&ArticleListItem>)> = Vec::new();
    for item in &data.articles {
        match grouped
            .iter_mut()
            .find(|(type_id, _)| *type_id == item.article_type_id)
        {
            Some((_, articles)) => articles.push(item),
            None => grouped.push((item.article_type_id, vec![item])),
        }
    }

    let mut seen = Vec::new();
    for article_type in &data.article_types {
        let Some((_, articles)) = grouped
            .iter_mut()
            .find(|(type_id, _)| *type_id == article_type.id)
        else {
            continue;
        };
        seen.push(article_type.id);
        sections.push(type_section(
            article_type.id,
            article_type.name.clone(),
            std::mem::take(articles),
        ));
    }
    for (type_id, articles) in grouped {
        if seen.contains(&type_id) || articles.is_empty() {
            continue;
        }
        let title = type_name(&data.article_types, type_id).unwrap_or_else(|| "未分类".to_owned());
        sections.push(type_section(type_id, title, articles));
    }

    ShelfData {
        sections,
        total: data.articles.len(),
        has_filters,
        warnings: Vec::new(),
    }
}

fn type_section(type_id: i64, title: String, items: Vec<&ArticleListItem>) -> ShelfSection {
    let total = items.len();
    let owned: Vec<ArticleListItem> = items.into_iter().cloned().collect();
    ShelfSection {
        id: format!("type-{type_id}"),
        title,
        articles: wire::to_shelf_cards(&owned)
            .into_iter()
            .take(SHELF_SECTION_LIMIT)
            .collect(),
        total,
    }
}

fn type_name(types: &[ArticleType], type_id: i64) -> Option<String> {
    types
        .iter()
        .find(|article_type| article_type.id == type_id)
        .map(|article_type| article_type.name.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use protocol::{ArticleTypeRef, TermRef};

    fn item(id: i64, type_id: i64) -> ArticleListItem {
        ArticleListItem {
            id,
            title: format!("title-{id}"),
            summary: String::new(),
            article_type_id: type_id,
            article_type: Some(ArticleTypeRef {
                id: type_id,
                name: format!("type-{type_id}"),
            }),
            status: "published".to_owned(),
            created_at: "c".to_owned(),
            updated_at: "u".to_owned(),
            published_at: None,
            term_ids: vec![4],
            terms: vec![TermRef {
                id: 4,
                name: "runtime".to_owned(),
                kind: "tag".to_owned(),
            }],
        }
    }

    fn article_type(id: i64, name: &str) -> ArticleType {
        ArticleType {
            id,
            name: name.to_owned(),
            created_at: "c".to_owned(),
            updated_at: "u".to_owned(),
        }
    }

    #[test]
    fn plan_owns_filter_and_recommendation_decisions() {
        let unfiltered = plan(MobileShelfRequest::default());
        assert!(!unfiltered.has_filters);

        let filtered = plan(MobileShelfRequest {
            term_ids: vec![4],
            ..MobileShelfRequest::default()
        });
        assert!(filtered.has_filters);
        assert_eq!(filtered.query.term_ids, vec![4]);
    }

    #[test]
    fn assemble_groups_truncates_and_keeps_unknown_type_fallback() {
        let articles: Vec<ArticleListItem> = (1..=9)
            .map(|id| item(id, if id == 9 { 99 } else { 2 }))
            .collect();
        let data = ArticleShelfData {
            article_types: vec![
                article_type(1, "Engineering"),
                article_type(2, "Field Notes"),
            ],
            recommendation: articles[..6].to_vec(),
            total: articles.len() as i64,
            articles,
        };
        let shelf = assemble(&data, false);
        assert_eq!(shelf.total, 9);
        assert_eq!(shelf.sections[0].id, "recommendation");
        assert_eq!(shelf.sections[0].articles.len(), 3);
        assert_eq!(shelf.sections[0].total, 6);
        assert_eq!(shelf.sections[1].id, "type-2");
        assert_eq!(shelf.sections[1].articles.len(), 6);
        assert_eq!(shelf.sections[1].total, 8);
        assert_eq!(shelf.sections[2].id, "type-99");
        assert_eq!(shelf.sections[2].title, "未分类");
        assert!(
            shelf.sections.iter().all(|section| section.id != "type-1"),
            "empty sections stay hidden"
        );
    }

    #[test]
    fn filtered_shelf_has_no_recommendation_section() {
        let article = item(1, 1);
        let data = ArticleShelfData {
            article_types: vec![article_type(1, "Engineering")],
            articles: vec![article.clone()],
            total: 1,
            recommendation: vec![article],
        };
        let shelf = assemble(&data, true);
        assert!(shelf.has_filters);
        assert!(
            shelf
                .sections
                .iter()
                .all(|section| section.id != "recommendation")
        );
    }
}
