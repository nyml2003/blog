//! Mobile F-shelf orchestration for the session-local Mock domain.

use protocol::wire::{self, ShelfData, ShelfSection};
use protocol::{ArticleListItem, ArticleShelfData, ArticleShelfQuery, ArticleType};

use crate::domain::DomainState;

const SHELF_SECTION_LIMIT: usize = 6;
const SHELF_RECOMMENDATION_LIMIT: usize = 3;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct MobileShelfRequest {
    pub article_type_id: Option<i64>,
    pub term_ids: Vec<i64>,
    pub created_from: Option<String>,
    pub created_to: Option<String>,
    pub updated_from: Option<String>,
    pub updated_to: Option<String>,
}

pub fn load(domain: &DomainState, request: MobileShelfRequest) -> ShelfData {
    let has_filters = request.article_type_id.is_some()
        || !request.term_ids.is_empty()
        || request.created_from.is_some()
        || request.created_to.is_some()
        || request.updated_from.is_some()
        || request.updated_to.is_some();
    let data = domain.article_shelf(&ArticleShelfQuery {
        article_type_id: request.article_type_id,
        term_ids: request.term_ids,
        created_from: request.created_from,
        created_to: request.created_to,
        updated_from: request.updated_from,
        updated_to: request.updated_to,
    });
    assemble(&data, has_filters)
}

fn assemble(data: &ArticleShelfData, has_filters: bool) -> ShelfData {
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
    use crate::scenario::SeedKind;

    #[test]
    fn filtered_load_keeps_the_existing_mobile_contract() {
        let domain = DomainState::new(SeedKind::Full);
        let shelf = load(
            &domain,
            MobileShelfRequest {
                article_type_id: Some(1),
                ..MobileShelfRequest::default()
            },
        );
        assert!(shelf.has_filters);
        assert!(
            shelf
                .sections
                .iter()
                .all(|section| section.id != "recommendation")
        );
        assert!(
            shelf
                .sections
                .iter()
                .all(|section| section.articles.len() <= SHELF_SECTION_LIMIT)
        );
    }
}
