//! 对外 HTTP 契约投影：`{ code, message, data }` envelope + camelCase 字段。
//!
//! Product 与 Mock Product API 暴露同一路由集合，**必须返回同一形状**——前端在
//! 真实后端与 Mock 之间切换时不需要两套类型。这里只做投影：内部类型是
//! [`crate::operation`] 的 `snake_case` 结构体，对外是 camelCase；两套命名刻意
//! 不同，使内部字段名不会泄漏到公开 API。
//!
//! 只依赖 `serde::Serialize`（两个服务都只序列化响应），不引入任何运行时依赖。

use serde::Serialize;

use crate::operation::{
    ArticleDetail as InternalArticleDetail, ArticleListItem as InternalArticleListItem,
    ArticleType as InternalArticleType, Term as InternalTerm,
};

/// 对外领域错误码集合（envelope 的 `code` 取值，沿用已移除的 Go 参考实现）。
///
/// 与内部失败码（[`crate::envelope::codes`]）不同：这是前端可见的稳定集合，
/// 语义以 ARCH-DATA-API 为准。
pub mod code {
    pub const UNKNOWN_SCENE_CODE: &str = "UNKNOWN_SCENE_CODE";
    pub const METHOD_NOT_ALLOWED: &str = "METHOD_NOT_ALLOWED";
    pub const INVALID_ID: &str = "INVALID_ID";
    pub const INVALID_JSON: &str = "INVALID_JSON";
    pub const INVALID_SUMMARY: &str = "INVALID_SUMMARY";
    pub const INVALID_STATE_TRANSITION: &str = "INVALID_STATE_TRANSITION";
    pub const DUPLICATE_NAME: &str = "DUPLICATE_NAME";
    pub const ARTICLE_NOT_FOUND: &str = "ARTICLE_NOT_FOUND";
    pub const NOT_FOUND: &str = "NOT_FOUND";
    pub const INTERNAL_ERROR: &str = "INTERNAL_ERROR";
    pub const BACKPRESSURE: &str = "BACKPRESSURE";
    pub const DEADLINE_EXCEEDED: &str = "DEADLINE_EXCEEDED";
}

/// `{ code, message, data }`。
#[derive(Debug, Serialize)]
pub struct Envelope<T> {
    pub code: String,
    pub message: String,
    pub data: Option<T>,
}

impl<T> Envelope<T> {
    /// 成功 envelope；`message` 为空字符串（与历史实现一致）。
    pub fn ok(data: T) -> Self {
        Self {
            code: "OK".to_owned(),
            message: String::new(),
            data: Some(data),
        }
    }

    /// 失败 envelope：`data` 序列化为 `null`。
    pub fn failure(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            message: message.into(),
            data: None,
        }
    }
}

/// 类型/term 的只读引用（文章内嵌对象）。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleTypeRef {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TermRef {
    pub id: i64,
    pub name: String,
    pub kind: String,
}

/// 列表卡片：不含正文 HTML（列表与 mobile shelf 共一取舍）。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleListItem {
    pub id: i64,
    pub title: String,
    pub summary: String,
    pub article_type_id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub article_type: Option<ArticleTypeRef>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>,
    pub term_ids: Vec<i64>,
    pub terms: Vec<TermRef>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleType {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Term {
    pub id: i64,
    pub name: String,
    pub kind: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 详情：列表投影 + 正文 HTML。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleDetail {
    pub id: i64,
    pub title: String,
    pub summary: String,
    pub article_type_id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub article_type: Option<ArticleTypeRef>,
    pub content_html: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>,
    pub term_ids: Vec<i64>,
    pub terms: Vec<TermRef>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleListPage {
    pub items: Vec<ArticleListItem>,
    pub page: u32,
    pub page_size: u32,
    pub total: i64,
    pub has_more: bool,
}

/// mobile shelf 卡片：只含列表展示字段，不返回正文 HTML。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfCard {
    pub id: i64,
    pub title: String,
    pub summary: String,
    pub updated_at: String,
    pub terms: Vec<TermRef>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfSection {
    /// `recommendation` 或稳定的 `type-<id>`。
    pub id: String,
    pub title: String,
    pub articles: Vec<ShelfCard>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfData {
    pub sections: Vec<ShelfSection>,
    pub total: usize,
    pub has_filters: bool,
    pub warnings: Vec<String>,
}

fn article_type_ref(value: &crate::operation::ArticleTypeRef) -> ArticleTypeRef {
    ArticleTypeRef {
        id: value.id,
        name: value.name.clone(),
    }
}

fn term_ref(value: &crate::operation::TermRef) -> TermRef {
    TermRef {
        id: value.id,
        name: value.name.clone(),
        kind: value.kind.clone(),
    }
}

fn list_item(value: &InternalArticleListItem) -> ArticleListItem {
    ArticleListItem {
        id: value.id,
        title: value.title.clone(),
        summary: value.summary.clone(),
        article_type_id: value.article_type_id,
        article_type: value.article_type.as_ref().map(article_type_ref),
        status: value.status.clone(),
        created_at: value.created_at.clone(),
        updated_at: value.updated_at.clone(),
        published_at: value.published_at.clone(),
        term_ids: value.term_ids.clone(),
        terms: value.terms.iter().map(term_ref).collect(),
    }
}

fn term(value: &InternalTerm) -> Term {
    Term {
        id: value.id,
        name: value.name.clone(),
        kind: value.kind.clone(),
        created_at: value.created_at.clone(),
        updated_at: value.updated_at.clone(),
    }
}

/// 列表条目 → 外部契约投影（不含正文 HTML）。
pub fn to_list_items(items: &[InternalArticleListItem]) -> Vec<ArticleListItem> {
    items.iter().map(list_item).collect()
}

/// 文章类型 → 外部契约。
pub fn to_types(items: &[InternalArticleType]) -> Vec<ArticleType> {
    items
        .iter()
        .map(|kind| ArticleType {
            id: kind.id,
            name: kind.name.clone(),
            created_at: kind.created_at.clone(),
            updated_at: kind.updated_at.clone(),
        })
        .collect()
}

/// 主题/标签 → 外部契约。
pub fn to_terms(items: &[InternalTerm]) -> Vec<Term> {
    items.iter().map(term).collect()
}

/// 详情 → 外部契约（含正文 HTML）。
pub fn to_detail(detail: &InternalArticleDetail) -> ArticleDetail {
    ArticleDetail {
        id: detail.id,
        title: detail.title.clone(),
        summary: detail.summary.clone(),
        article_type_id: detail.article_type_id,
        article_type: detail.article_type.as_ref().map(article_type_ref),
        content_html: detail.content_html.clone(),
        status: detail.status.clone(),
        created_at: detail.created_at.clone(),
        updated_at: detail.updated_at.clone(),
        published_at: detail.published_at.clone(),
        term_ids: detail.term_ids.clone(),
        terms: detail.terms.iter().map(term_ref).collect(),
    }
}

/// 推荐集合：详情级投影（含正文 HTML，与历史实现一致）。
pub fn to_details(items: &[InternalArticleDetail]) -> Vec<ArticleDetail> {
    items.iter().map(to_detail).collect()
}

fn shelf_card(item: &InternalArticleListItem) -> ShelfCard {
    ShelfCard {
        id: item.id,
        title: item.title.clone(),
        summary: item.summary.clone(),
        updated_at: item.updated_at.clone(),
        terms: item.terms.iter().map(term_ref).collect(),
    }
}

/// BFF 分组（共享给 Product 与 Mock，保证两侧 section 顺序一致）：
/// 推荐 section（无筛选时，最多 3 张卡片）→ 按类型的分组 section（空分区隐藏，
/// 类型按传入顺序，即 `name` 序）→ 类型已删除的文章进入稳定的 `type-<id>` 兜底
/// section（标题 `未分类`），不静默丢弃。
pub fn to_shelf(
    types: &[InternalArticleType],
    items: &[InternalArticleListItem],
    recommendation: &[InternalArticleListItem],
    has_filters: bool,
) -> ShelfData {
    let mut sections: Vec<ShelfSection> = Vec::new();
    if !has_filters && !recommendation.is_empty() {
        let cards: Vec<ShelfCard> = recommendation.iter().take(3).map(shelf_card).collect();
        sections.push(ShelfSection {
            id: "recommendation".to_owned(),
            title: "推荐".to_owned(),
            articles: cards,
        });
    }

    let mut grouped: Vec<(i64, Vec<ShelfCard>)> = Vec::new();
    for item in items {
        match grouped
            .iter_mut()
            .find(|(id, _)| *id == item.article_type_id)
        {
            Some((_, cards)) => cards.push(shelf_card(item)),
            None => grouped.push((item.article_type_id, vec![shelf_card(item)])),
        }
    }

    let mut seen: Vec<i64> = Vec::new();
    for kind in types {
        let Some((_, cards)) = grouped.iter_mut().find(|(id, _)| *id == kind.id) else {
            continue;
        };
        seen.push(kind.id);
        sections.push(ShelfSection {
            id: format!("type-{}", kind.id),
            title: kind.name.clone(),
            articles: std::mem::take(cards),
        });
    }
    for (type_id, cards) in grouped {
        if seen.contains(&type_id) || cards.is_empty() {
            continue;
        }
        let title = types
            .iter()
            .find(|kind| kind.id == type_id)
            .map(|kind| kind.name.clone())
            .unwrap_or_else(|| "未分类".to_owned());
        sections.push(ShelfSection {
            id: format!("type-{type_id}"),
            title,
            articles: cards,
        });
    }

    ShelfData {
        sections,
        total: items.len(),
        has_filters,
        warnings: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::operation::{ArticleTypeRef as InternalArticleTypeRef, TermRef as InternalTermRef};

    fn internal_item(id: i64, type_id: i64) -> InternalArticleListItem {
        InternalArticleListItem {
            id,
            title: format!("title-{id}"),
            summary: String::new(),
            article_type_id: type_id,
            article_type: Some(InternalArticleTypeRef {
                id: type_id,
                name: format!("type-{type_id}"),
            }),
            status: "published".to_owned(),
            created_at: "c".to_owned(),
            updated_at: "u".to_owned(),
            published_at: None,
            term_ids: vec![4],
            terms: vec![InternalTermRef {
                id: 4,
                name: "runtime".to_owned(),
                kind: "tag".to_owned(),
            }],
        }
    }

    #[test]
    fn external_shape_uses_camel_case_and_omits_optional_fields() {
        let json = serde_json::to_value(list_item(&internal_item(11, 1))).unwrap();
        assert_eq!(json["articleTypeId"], 1);
        assert_eq!(json["termIds"][0], 4);
        assert_eq!(json["terms"][0]["kind"], "tag");
        assert!(
            json.get("contentHtml").is_none(),
            "list items carry no body"
        );
        assert!(json.get("publishedAt").is_none(), "None must be omitted");
    }

    #[test]
    fn detail_projection_adds_body_only() {
        let internal = InternalArticleDetail {
            id: 11,
            title: "t".to_owned(),
            summary: "s".to_owned(),
            article_type_id: 1,
            article_type: Some(InternalArticleTypeRef {
                id: 1,
                name: "Engineering".to_owned(),
            }),
            content_html: "<p>x</p>".to_owned(),
            status: "published".to_owned(),
            created_at: "c".to_owned(),
            updated_at: "u".to_owned(),
            published_at: Some("p".to_owned()),
            term_ids: vec![4],
            terms: vec![InternalTermRef {
                id: 4,
                name: "runtime".to_owned(),
                kind: "tag".to_owned(),
            }],
        };
        let json = serde_json::to_value(to_detail(&internal)).unwrap();
        assert_eq!(json["contentHtml"], "<p>x</p>");
        assert_eq!(json["publishedAt"], "p");
        assert_eq!(json["articleType"]["name"], "Engineering");
    }

    #[test]
    fn taxonomy_projections_keep_server_owned_timestamps() {
        let kinds = vec![InternalArticleType {
            id: 2,
            name: "Field Notes".to_owned(),
            created_at: "c".to_owned(),
            updated_at: "u".to_owned(),
        }];
        let json = serde_json::to_value(to_types(&kinds)).unwrap();
        assert_eq!(json[0]["createdAt"], "c");
        assert_eq!(json[0]["updatedAt"], "u");
        assert_eq!(json[0]["name"], "Field Notes");
    }

    #[test]
    fn shelf_groups_by_type_hides_empty_sections_and_keeps_fallback() {
        let types = vec![
            InternalArticleType {
                id: 1,
                name: "Engineering".to_owned(),
                created_at: "c".to_owned(),
                updated_at: "u".to_owned(),
            },
            InternalArticleType {
                id: 2,
                name: "Field Notes".to_owned(),
                created_at: "c".to_owned(),
                updated_at: "u".to_owned(),
            },
        ];
        let items = vec![
            internal_item(11, 2),
            internal_item(10, 2),
            internal_item(9, 99), // 类型已删除 → 兜底 section
        ];
        let shelf = to_shelf(&types, &items, &items[..1], false);
        assert_eq!(shelf.total, 3);
        assert!(!shelf.has_filters);
        assert_eq!(shelf.sections[0].id, "recommendation");
        assert_eq!(shelf.sections[0].articles.len(), 1, "at most 3 cards");
        assert_eq!(shelf.sections[1].id, "type-2");
        assert_eq!(shelf.sections[1].title, "Field Notes");
        assert_eq!(shelf.sections[2].id, "type-99");
        assert_eq!(shelf.sections[2].title, "未分类");
        assert!(
            shelf.sections.iter().all(|section| section.id != "type-1"),
            "empty section must be hidden"
        );
        for section in &shelf.sections {
            for card in &section.articles {
                let json = serde_json::to_value(card).unwrap();
                assert!(json.get("contentHtml").is_none(), "cards carry no body");
            }
        }
    }

    #[test]
    fn shelf_skips_recommendation_when_filtered() {
        let types = vec![InternalArticleType {
            id: 1,
            name: "Engineering".to_owned(),
            created_at: "c".to_owned(),
            updated_at: "u".to_owned(),
        }];
        let items = vec![internal_item(11, 1)];
        let shelf = to_shelf(&types, &items, &items, true);
        assert!(shelf.has_filters);
        assert!(
            !shelf
                .sections
                .iter()
                .any(|section| section.id == "recommendation"),
            "filtered requests carry no recommendation section"
        );
    }

    #[test]
    fn envelope_success_and_failure_shapes() {
        let ok = serde_json::to_value(Envelope::ok(vec!["a"])).unwrap();
        assert_eq!(ok["code"], "OK");
        assert_eq!(ok["message"], "");
        assert_eq!(ok["data"][0], "a");

        let failure = serde_json::to_value(Envelope::<Option<u8>>::failure(
            code::ARTICLE_NOT_FOUND,
            "missing",
        ))
        .unwrap();
        assert_eq!(failure["code"], "ARTICLE_NOT_FOUND");
        assert_eq!(failure["message"], "missing");
        assert_eq!(failure["data"], serde_json::Value::Null);
    }

    #[test]
    fn external_code_set_is_stable() {
        assert_eq!(code::BACKPRESSURE, "BACKPRESSURE");
        assert_eq!(code::INVALID_SUMMARY, "INVALID_SUMMARY");
        assert_eq!(code::INVALID_STATE_TRANSITION, "INVALID_STATE_TRANSITION");
        assert_eq!(code::DUPLICATE_NAME, "DUPLICATE_NAME");
        assert_eq!(code::METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED");
        assert_eq!(code::DEADLINE_EXCEEDED, "DEADLINE_EXCEEDED");
    }
}
