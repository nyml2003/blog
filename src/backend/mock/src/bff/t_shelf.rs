//! T-shelf orchestration for the session-local Mock domain.

use protocol::envelope::codes;
use protocol::wire::{self, TShelfData};
use protocol::{ArticleListQuery, ArticleTypeListQuery, OperationFailure};

use crate::domain::DomainState;

const T_SHELF_LIMIT: usize = 20;
pub const SURFACE_RECOMMENDATION: &str = "recommendation";
pub const SURFACE_ARCHIVE: &str = "archive";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TShelfSurface {
    Recommendation,
    Archive,
}

pub struct TShelfRequest {
    surface: TShelfSurface,
    selected_filter_id: String,
    selected_type_id: Option<i64>,
}

pub fn request(
    surface: Option<&str>,
    filter_id: Option<&str>,
) -> Result<TShelfRequest, OperationFailure> {
    let surface = match surface {
        Some(SURFACE_RECOMMENDATION) => TShelfSurface::Recommendation,
        Some(SURFACE_ARCHIVE) => TShelfSurface::Archive,
        _ => {
            return Err(invalid(
                "query parameter 'surface' must be 'recommendation' or 'archive'",
            ));
        }
    };
    let (selected_filter_id, selected_type_id) = selected_filter(filter_id)?;
    Ok(TShelfRequest {
        surface,
        selected_filter_id,
        selected_type_id,
    })
}

pub fn load(domain: &DomainState, request: &TShelfRequest) -> Result<TShelfData, OperationFailure> {
    let types = domain.article_type_list(&ArticleTypeListQuery::default());
    validate_selected_type(&types, request.selected_type_id)?;
    let (articles, total) = match request.surface {
        TShelfSurface::Recommendation => {
            let matching: Vec<_> = domain
                .recommendation_current()
                .into_iter()
                .filter(|item| {
                    request
                        .selected_type_id
                        .is_none_or(|type_id| item.article_type_id == type_id)
                })
                .collect();
            let total = matching.len();
            (
                wire::to_shelf_cards_from_details(&matching, wire::ArticleCardSurface::Desktop)
                    .into_iter()
                    .take(T_SHELF_LIMIT)
                    .collect(),
                total,
            )
        }
        TShelfSurface::Archive => {
            let page = domain.article_list(&ArticleListQuery {
                page: Some(1),
                page_size: Some(T_SHELF_LIMIT as u32),
                article_type_id: request.selected_type_id,
                published_only: true,
                ..ArticleListQuery::default()
            })?;
            let total = usize::try_from(page.total)
                .map_err(|_| internal("archive shelf returned a negative total"))?;
            (
                wire::to_shelf_cards(&page.items, wire::ArticleCardSurface::Desktop)
                    .into_iter()
                    .take(T_SHELF_LIMIT)
                    .collect(),
                total,
            )
        }
    };
    Ok(TShelfData {
        filters: wire::to_t_shelf_filters(&types),
        selected_filter_id: request.selected_filter_id.clone(),
        articles,
        total,
    })
}

fn selected_filter(filter_id: Option<&str>) -> Result<(String, Option<i64>), OperationFailure> {
    match filter_id.filter(|value| !value.is_empty()).unwrap_or("all") {
        "all" => Ok(("all".to_owned(), None)),
        value => {
            let type_id = value.parse::<i64>().map_err(|_| {
                invalid("query parameter 'filter_id' must be 'all' or a positive article type id")
            })?;
            if type_id < 1 {
                return Err(invalid(
                    "query parameter 'filter_id' must be 'all' or a positive article type id",
                ));
            }
            Ok((type_id.to_string(), Some(type_id)))
        }
    }
}

fn validate_selected_type(
    types: &[protocol::ArticleType],
    selected_type_id: Option<i64>,
) -> Result<(), OperationFailure> {
    let Some(type_id) = selected_type_id else {
        return Ok(());
    };
    if types.iter().any(|article_type| article_type.id == type_id) {
        return Ok(());
    }
    Err(invalid(format!("article type filter {type_id} not found")))
}

fn invalid(message: impl Into<String>) -> OperationFailure {
    OperationFailure::new(codes::INVALID_PAYLOAD, message)
}

fn internal(message: impl Into<String>) -> OperationFailure {
    OperationFailure::new(codes::INTERNAL_ERROR, message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scenario::SeedKind;

    #[test]
    fn recommendation_filter_stays_inside_the_recommendation_set() {
        let domain = DomainState::new(SeedKind::Full);
        let request = request(Some("recommendation"), Some("1")).unwrap();
        let shelf = load(&domain, &request).unwrap();
        assert_eq!(shelf.filters[0].id, "all");
        assert_eq!(shelf.selected_filter_id, "1");
        assert!(shelf.total <= protocol::RECOMMENDATION_LIMIT);
        assert!(shelf.articles.len() <= protocol::RECOMMENDATION_LIMIT);
    }
}
