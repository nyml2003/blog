//! T-shelf orchestration for public recommendation and archive surfaces.

use protocol::envelope::codes;
use protocol::wire::{self, TShelfData};
use protocol::{
    ArticleShelfQuery, ArticleType, DataOperation, DataOutcome, OperationFailure,
};

pub const T_SHELF_LIMIT: usize = 20;
pub const SURFACE_RECOMMENDATION: &str = "recommendation";
pub const SURFACE_ARCHIVE: &str = "archive";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TShelfSurface {
    Recommendation,
    Archive,
}

pub struct TShelfPlan {
    pub surface: TShelfSurface,
    pub selected_filter_id: String,
    pub selected_type_id: Option<i64>,
    pub operations: Vec<DataOperation>,
}

pub fn plan(surface: Option<&str>, filter_id: Option<&str>) -> Result<TShelfPlan, OperationFailure> {
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
    let operations = match surface {
        TShelfSurface::Recommendation => vec![
            DataOperation::ArticleTypeList(protocol::ArticleTypeListQuery::default()),
            DataOperation::RecommendationCurrent,
        ],
        TShelfSurface::Archive => vec![DataOperation::ArticleShelf(ArticleShelfQuery {
            article_type_id: selected_type_id,
            include_recommendation: false,
            ..ArticleShelfQuery::default()
        })],
    };
    Ok(TShelfPlan {
        surface,
        selected_filter_id,
        selected_type_id,
        operations,
    })
}

pub fn assemble(
    plan: &TShelfPlan,
    outcomes: Vec<DataOutcome>,
) -> Result<TShelfData, OperationFailure> {
    match (plan.surface, outcomes.as_slice()) {
        (TShelfSurface::Archive, [DataOutcome::ArticleShelf(data)]) => {
            validate_selected_type(&data.article_types, plan.selected_type_id)?;
            let total = usize::try_from(data.total)
                .map_err(|_| internal("archive shelf returned a negative total"))?;
            Ok(TShelfData {
                filters: wire::to_t_shelf_filters(&data.article_types),
                selected_filter_id: plan.selected_filter_id.clone(),
                articles: wire::to_shelf_cards(&data.articles)
                    .into_iter()
                    .take(T_SHELF_LIMIT)
                    .collect(),
                total,
            })
        }
        (
            TShelfSurface::Recommendation,
            [DataOutcome::ArticleTypes(types), DataOutcome::Recommendation(items)],
        ) => {
            validate_selected_type(types, plan.selected_type_id)?;
            let matching: Vec<_> = items
                .iter()
                .filter(|item| {
                    plan.selected_type_id
                        .is_none_or(|type_id| item.article_type_id == type_id)
                })
                .cloned()
                .collect();
            let total = matching.len();
            Ok(TShelfData {
                filters: wire::to_t_shelf_filters(types),
                selected_filter_id: plan.selected_filter_id.clone(),
                articles: wire::to_shelf_cards_from_details(&matching)
                    .into_iter()
                    .take(T_SHELF_LIMIT)
                    .collect(),
                total,
            })
        }
        _ => Err(internal("T-shelf received unexpected Data outcomes")),
    }
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
    types: &[ArticleType],
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
    use protocol::{ArticleDetail, ArticleListItem, ArticleShelfData};

    fn article_type(id: i64, name: &str) -> ArticleType {
        ArticleType {
            id,
            name: name.to_owned(),
            created_at: "c".to_owned(),
            updated_at: "u".to_owned(),
        }
    }

    fn detail(id: i64, type_id: i64) -> ArticleDetail {
        ArticleDetail {
            id,
            title: format!("title-{id}"),
            summary: String::new(),
            article_type_id: type_id,
            article_type: None,
            content_html: "<p>body</p>".to_owned(),
            status: "published".to_owned(),
            created_at: "c".to_owned(),
            updated_at: "u".to_owned(),
            published_at: Some("p".to_owned()),
            term_ids: Vec::new(),
            terms: Vec::new(),
        }
    }

    fn list_item(id: i64, type_id: i64) -> ArticleListItem {
        let item = detail(id, type_id);
        ArticleListItem {
            id: item.id,
            title: item.title,
            summary: item.summary,
            article_type_id: item.article_type_id,
            article_type: item.article_type,
            status: item.status,
            created_at: item.created_at,
            updated_at: item.updated_at,
            published_at: item.published_at,
            term_ids: item.term_ids,
            terms: item.terms,
        }
    }

    #[test]
    fn initial_archive_plan_selects_all_and_returns_filters_with_first_shelf() {
        let plan = plan(Some("archive"), None).unwrap();
        assert_eq!(plan.selected_filter_id, "all");
        assert_eq!(plan.operations.len(), 1);
        let articles: Vec<_> = (1..=25).map(|id| list_item(id, 1)).collect();
        let data = assemble(
            &plan,
            vec![DataOutcome::ArticleShelf(ArticleShelfData {
                article_types: vec![article_type(1, "Engineering")],
                total: articles.len() as i64,
                articles,
                recommendation: Vec::new(),
            })],
        )
        .unwrap();
        assert_eq!(data.filters[0].id, "all");
        assert_eq!(data.selected_filter_id, "all");
        assert_eq!(data.articles.len(), T_SHELF_LIMIT);
        assert_eq!(data.total, 25);
    }

    #[test]
    fn recommendation_filter_only_uses_the_current_recommendation_set() {
        let plan = plan(Some("recommendation"), Some("2")).unwrap();
        let data = assemble(
            &plan,
            vec![
                DataOutcome::ArticleTypes(vec![
                    article_type(1, "Engineering"),
                    article_type(2, "Field Notes"),
                ]),
                DataOutcome::Recommendation(vec![detail(1, 1), detail(2, 2), detail(3, 1)]),
            ],
        )
        .unwrap();
        assert_eq!(data.selected_filter_id, "2");
        assert_eq!(data.total, 1);
        assert_eq!(data.articles[0].id, 2);
        assert!(
            serde_json::to_value(&data.articles[0])
                .unwrap()
                .get("contentHtml")
                .is_none()
        );
    }

    #[test]
    fn invalid_surface_filter_and_unknown_type_are_rejected() {
        assert_eq!(
            plan(None, None).unwrap_err().code,
            codes::INVALID_PAYLOAD
        );
        assert_eq!(
            plan(Some("archive"), Some("x")).unwrap_err().code,
            codes::INVALID_PAYLOAD
        );
        let plan = plan(Some("archive"), Some("9")).unwrap();
        let error = assemble(
            &plan,
            vec![DataOutcome::ArticleShelf(ArticleShelfData {
                article_types: vec![article_type(1, "Engineering")],
                articles: Vec::new(),
                total: 0,
                recommendation: Vec::new(),
            })],
        )
        .unwrap_err();
        assert_eq!(error.code, codes::INVALID_PAYLOAD);
        assert_eq!(error.message, "article type filter 9 not found");
    }
}
