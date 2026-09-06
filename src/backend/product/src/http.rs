//! Product 的 HTTP 面：公开 API、管理 API、BFF 与静态挂载（`web/dist`）。
//!
//! 外部契约（ARCH-DATA-API / Go 参考实现）：
//! - 业务接口只用 `GET`/`POST`；`sceneCode` 采用 `端点.场景` 命名；
//! - 响应 `{ code, message, data }`，字段 camelCase；
//! - 公开查询隐含 `status = 'published'`，草稿/下线文章不泄露管理状态；
//! - 同一筛选维度 OR，不同维度 AND；默认排序 `updated_at DESC, id DESC`；
//! - 状态机 `draft -> published -> draft`；时间字段由服务端维护。
//!
//! Product→Data 调用数与结果条目数无关；发布先读原文，再按原文条件提交。

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::Router;
use axum::extract::{Query, State};
use axum::http::{Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get};
use serde::Deserialize;

use crate::data_client::{DataCallError, DataClient};
use crate::static_files::StaticFiles;
use protocol::envelope::codes;
use protocol::scene;
use protocol::wire::code;
use protocol::wire::{self, Envelope};
use protocol::{
    ArticleBrowseQuery, ArticleGetQuery, ArticleId, ArticleListPage, ArticleListQuery,
    ArticleShelfQuery, ArticleTypeListQuery, ArticleTypeName, ArticleTypeRename, ArticleWrite,
    DataOperation, TermListQuery, TermRename, TermWrite, has_more,
};

/// 入口绝对 deadline；Data 收到的是剩余预算（deadline 沿链路传播）。
pub const ENTRY_BUDGET: Duration = Duration::from_secs(5);

pub struct AppState {
    pub data: DataClient,
    pub bound_addr: String,
    pub web_dir: Option<std::path::PathBuf>,
    pub static_files: Option<StaticFiles>,
    pub started: Instant,
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        // 公开
        .route("/api/public/articles", any(public_articles))
        .route("/api/public/article-types", any(public_article_types))
        .route("/api/public/terms", any(public_terms))
        .route("/api/public/recommendations", any(public_recommendations))
        .route(
            "/api/public/mobile/article-shelf",
            any(mobile_article_shelf),
        )
        // 管理
        .route("/api/admin/articles", any(admin_articles))
        .route("/api/admin/article-types", any(admin_article_types))
        .route("/api/admin/terms", any(admin_terms))
        .route("/api/admin/recommendations", any(admin_recommendations))
        .route("/product/diagnostics", get(diagnostics))
        // MODE-004：`web/dist` 静态挂载（页面 + 静态资源 + `/api` 同源）。
        .fallback(fallback)
        .with_state(state)
}

async fn healthz() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        "ok\n",
    )
}

/// 注入配置与 Data 调用计数（不访问 SQLite；供 ops 与验收检查）。
async fn diagnostics(State(state): State<Arc<AppState>>) -> Response {
    let (calls, backpressure, deadline_exceeded, unavailable) = state.data.counters();
    let payload = serde_json::json!({
        "service": "product",
        "listen": state.bound_addr,
        "webDirInjected": state.web_dir.as_ref().map(|path| path.display().to_string()),
        "webDirMounted": state.static_files.is_some(),
        "uptimeMs": state.started.elapsed().as_millis() as u64,
        "entryBudgetMs": ENTRY_BUDGET.as_millis() as u64,
        "dataClient": state.data.describe(),
        "dataCallsTotal": calls,
        "dataBackpressureTotal": backpressure,
        "dataDeadlineExceededTotal": deadline_exceeded,
        "dataUnavailableTotal": unavailable,
    });
    envelope(&Envelope::ok(payload), StatusCode::OK)
}

/// 静态挂载兜底：未知路径 / 目录路径 / 深层刷新路径都走这里（SPIKE-001）。
async fn fallback(State(state): State<Arc<AppState>>, request: axum::extract::Request) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    match &state.static_files {
        Some(files) => files.serve(&method, &path).await,
        None => not_found_plain(),
    }
}

// ---------- 公开端点 ----------

async fn public_articles(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if method != Method::GET {
        return method_not_allowed();
    }
    match params.get("sceneCode").map(String::as_str) {
        Some(scene::ARTICLE_LIST) => article_list_handler(&state, &params, true).await,
        Some(scene::ARTICLE_BROWSE) => article_browse_handler(&state, &params).await,
        Some(scene::ARTICLE_DETAIL) => {
            let id = required_id(&params);
            if id.is_none() {
                return invalid_id();
            }
            article_detail(&state, id.unwrap_or_default(), true, scene::ARTICLE_DETAIL).await
        }
        _ => unknown_scene_code(),
    }
}

async fn public_article_types(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if method != Method::GET
        || params.get("sceneCode").map(String::as_str) != Some(scene::ARTICLE_TYPE_LIST)
    {
        return unknown_scene_code();
    }
    respond(
        &state,
        "GET /api/public/article-types",
        scene::ARTICLE_TYPE_LIST,
        DataOperation::ArticleTypeList(ArticleTypeListQuery::default()),
        |outcome| match outcome {
            protocol::DataOutcome::ArticleTypes(types) => encode(&wire::to_types(&types)),
            _ => Err(unexpected_payload()),
        },
    )
    .await
}

async fn public_terms(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if method != Method::GET
        || params.get("sceneCode").map(String::as_str) != Some(scene::TERM_LIST)
    {
        return unknown_scene_code();
    }
    let kind = params.get("kind").filter(|kind| !kind.is_empty()).cloned();
    respond(
        &state,
        "GET /api/public/terms",
        scene::TERM_LIST,
        DataOperation::TermList(TermListQuery { kind }),
        |outcome| match outcome {
            protocol::DataOutcome::Terms(terms) => encode(&wire::to_terms(&terms)),
            _ => Err(unexpected_payload()),
        },
    )
    .await
}

async fn public_recommendations(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if method != Method::GET
        || params.get("sceneCode").map(String::as_str) != Some(scene::RECOMMENDATION_CURRENT)
    {
        return unknown_scene_code();
    }
    respond(
        &state,
        "GET /api/public/recommendations",
        scene::RECOMMENDATION_CURRENT,
        DataOperation::RecommendationCurrent,
        |outcome| match outcome {
            protocol::DataOutcome::Recommendation(items) => encode(&wire::to_details(&items)),
            _ => Err(unexpected_payload()),
        },
    )
    .await
}

/// mobile shelf BFF：分组/空分区隐藏/推荐截断都在服务端完成（ARCH-DATA-API）。
async fn mobile_article_shelf(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if method != Method::GET
        || params.get("sceneCode").map(String::as_str) != Some(scene::MOBILE_ARTICLE_SHELF)
    {
        return unknown_scene_code();
    }
    let query = ArticleShelfQuery {
        article_type_id: parse_i64(params.get("type_id")),
        term_ids: parse_id_list(params.get("term_ids")),
        created_from: non_empty(params.get("created_from")),
        created_to: non_empty(params.get("created_to")),
        updated_from: non_empty(params.get("updated_from")),
        updated_to: non_empty(params.get("updated_to")),
        include_recommendation: true,
    };
    let has_filters = query.article_type_id.is_some()
        || !query.term_ids.is_empty()
        || query.created_from.is_some()
        || query.created_to.is_some()
        || query.updated_from.is_some()
        || query.updated_to.is_some();
    // 无筛选时才带推荐（BFF 的推荐 section 规则），查询数固定 7 / 4。
    let query = ArticleShelfQuery {
        include_recommendation: !has_filters,
        ..query
    };
    let started = Instant::now();
    let result = state
        .data
        .call(
            &request_id("shelf"),
            &DataOperation::ArticleShelf(query),
            ENTRY_BUDGET,
        )
        .await;
    match result {
        Ok(trace) => {
            let protocol::DataOutcome::ArticleShelf(shelf) = trace.outcome else {
                return data_failure(&DataCallError::Unavailable(unexpected_payload().0), "shelf");
            };
            crate::product_info!(
                "GET /api/public/mobile/article-shelf scene={} items={} sections={} data_calls=1 data_queries={} data_elapsed_ms={} elapsed_ms={}",
                shelf.articles.len(),
                shelf.total,
                shelf.article_types.len(),
                trace.query_count.unwrap_or_default(),
                trace.elapsed.as_millis(),
                started.elapsed().as_millis()
            );
            let body = wire::to_shelf(
                &shelf.article_types,
                &shelf.articles,
                &shelf.recommendation,
                has_filters,
            );
            envelope(&Envelope::ok(body), StatusCode::OK)
        }
        Err(error) => data_failure(&error, "shelf"),
    }
}

// ---------- 文章（公开 + 管理共用实现） ----------

fn article_list_handler(
    state: &Arc<AppState>,
    params: &HashMap<String, String>,
    published_only: bool,
) -> impl std::future::Future<Output = Response> + Send {
    let query = ArticleListQuery {
        page: parse_u32(params.get("page")),
        page_size: parse_u32(params.get("pageSize")),
        article_type_id: parse_i64(params.get("type_id")),
        term_ids: parse_id_list(params.get("term_ids")),
        created_from: non_empty(params.get("created_from")),
        created_to: non_empty(params.get("created_to")),
        updated_from: non_empty(params.get("updated_from")),
        updated_to: non_empty(params.get("updated_to")),
        published_only,
    };
    let scene = if published_only {
        scene::ARTICLE_LIST
    } else {
        scene::ADMIN_ARTICLE_LIST
    };
    let state = Arc::clone(state);
    let started = Instant::now();
    async move {
        let result = state
            .data
            .call(
                &request_id("list"),
                &DataOperation::ArticleList(query),
                ENTRY_BUDGET,
            )
            .await;
        match result {
            Ok(trace) => {
                let protocol::DataOutcome::ArticleList(page) = trace.outcome else {
                    return data_failure(
                        &DataCallError::Unavailable(unexpected_payload().0),
                        "article_list",
                    );
                };
                crate::product_info!(
                    "GET /api/{}/articles scene={} items={} total={} data_calls=1 data_queries={} data_elapsed_ms={} elapsed_ms={}",
                    if published_only { "public" } else { "admin" },
                    scene,
                    page.items.len(),
                    page.total,
                    trace.query_count.unwrap_or_default(),
                    trace.elapsed.as_millis(),
                    started.elapsed().as_millis()
                );
                if published_only {
                    let body = public_list_page(&page);
                    envelope(&Envelope::ok(body), StatusCode::OK)
                } else {
                    // 管理列表只回 `items`/`total`（Go 参考实现同形态）。
                    envelope(
                        &Envelope::ok(serde_json::json!({
                            "items": wire::to_list_items(&page.items),
                            "total": page.total,
                        })),
                        StatusCode::OK,
                    )
                }
            }
            Err(error) => data_failure(&error, "article_list"),
        }
    }
}

/// Mobile 平铺页浏览（SPEC-MOBILE-BROWSE-IA-001，决策记录 #7）：type/topic/tag 三个
/// 维度各单选、维度间 AND；`topic_id` / `tag_id` 需与 term kind 一致，kind 不匹配由
/// Data 按 `INVALID_PAYLOAD` 返回并映射为 400。分页默认与上限沿用
/// `public.article_list`（默认 20 / 上限 100，`protocol::paging` 归一化）。
async fn article_browse_handler(
    state: &Arc<AppState>,
    params: &HashMap<String, String>,
) -> Response {
    let query = ArticleBrowseQuery {
        page: parse_u32(params.get("page")),
        page_size: parse_u32(params.get("pageSize")),
        article_type_id: parse_i64(params.get("type_id")),
        topic_id: parse_i64(params.get("topic_id")),
        tag_id: parse_i64(params.get("tag_id")),
        published_only: true,
    };
    let started = Instant::now();
    let result = state
        .data
        .call(
            &request_id("browse"),
            &DataOperation::ArticleBrowse(query),
            ENTRY_BUDGET,
        )
        .await;
    match result {
        Ok(trace) => {
            let protocol::DataOutcome::ArticleList(page) = trace.outcome else {
                return data_failure(
                    &DataCallError::Unavailable(unexpected_payload().0),
                    "article_browse",
                );
            };
            crate::product_info!(
                "GET /api/public/articles scene={} items={} total={} data_calls=1 data_queries={} data_elapsed_ms={} elapsed_ms={}",
                scene::ARTICLE_BROWSE,
                page.items.len(),
                page.total,
                trace.query_count.unwrap_or_default(),
                trace.elapsed.as_millis(),
                started.elapsed().as_millis()
            );
            envelope(&Envelope::ok(public_list_page(&page)), StatusCode::OK)
        }
        Err(error) => data_failure(&error, "article_browse"),
    }
}

/// 公开列表 / 浏览共用的分页响应体（wire [`wire::ArticleListPage`]，camelCase）。
fn public_list_page(page: &ArticleListPage) -> wire::ArticleListPage {
    let page_number = page.page;
    let page_size = page.page_size;
    wire::ArticleListPage {
        items: wire::to_list_items(&page.items),
        page: page_number,
        page_size,
        total: page.total,
        has_more: has_more(page_number, page_size, page.total),
    }
}

async fn article_detail(
    state: &Arc<AppState>,
    id: i64,
    published_only: bool,
    scene: &str,
) -> Response {
    respond(
        state,
        if published_only {
            "GET /api/public/articles"
        } else {
            "GET /api/admin/articles"
        },
        scene,
        DataOperation::ArticleGet(ArticleGetQuery { id, published_only }),
        |outcome| match outcome {
            protocol::DataOutcome::ArticleDetail(detail) => {
                if published_only {
                    encode(&wire::to_detail(&detail))
                } else {
                    inspected_detail(&detail)
                }
            }
            _ => Err(unexpected_payload()),
        },
    )
    .await
}

// ---------- 管理端点 ----------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdminArticleBody {
    #[serde(default)]
    scene_code: Option<String>,
    #[serde(default)]
    id: Option<i64>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    article_type_id: Option<i64>,
    #[serde(default)]
    term_ids: Option<Vec<i64>>,
    #[serde(default)]
    content_html: Option<String>,
}

async fn admin_articles(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    match method {
        Method::GET => match params.get("sceneCode").map(String::as_str) {
            Some(scene::ADMIN_ARTICLE_LIST) => article_list_handler(&state, &params, false).await,
            Some(scene::ADMIN_ARTICLE_DETAIL) => {
                let id = required_id(&params);
                if id.is_none() {
                    return invalid_id();
                }
                article_detail(
                    &state,
                    id.unwrap_or_default(),
                    false,
                    scene::ADMIN_ARTICLE_DETAIL,
                )
                .await
            }
            _ => unknown_scene_code(),
        },
        Method::POST => {
            let Ok(payload) = serde_json::from_slice::<AdminArticleBody>(&body) else {
                return envelope(
                    &Envelope::<serde_json::Value>::failure(
                        code::INVALID_JSON,
                        "request body is not valid JSON",
                    ),
                    StatusCode::BAD_REQUEST,
                );
            };
            mutate_article(&state, &payload).await
        }
        _ => method_not_allowed(),
    }
}

fn inspected_detail(
    detail: &protocol::ArticleDetail,
) -> Result<serde_json::Value, (String, String)> {
    inspected_detail_with(detail, article_html_core::inspect(&detail.content_html))
}

fn inspected_detail_with(
    detail: &protocol::ArticleDetail,
    html_inspection: article_html_core::Inspection,
) -> Result<serde_json::Value, (String, String)> {
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct InspectedArticle {
        #[serde(flatten)]
        article: wire::ArticleDetail,
        html_inspection: article_html_core::Inspection,
    }
    encode(&InspectedArticle {
        article: wire::to_detail(detail),
        html_inspection,
    })
}

fn invalid_html(inspection: article_html_core::Inspection) -> Response {
    envelope(
        &Envelope {
            code: codes::INVALID_ARTICLE_HTML.to_owned(),
            message: "Article HTML does not satisfy article-html/v1".to_owned(),
            data: Some(serde_json::json!({ "htmlInspection": inspection })),
        },
        StatusCode::UNPROCESSABLE_ENTITY,
    )
}

async fn mutate_article(state: &Arc<AppState>, payload: &AdminArticleBody) -> Response {
    let started = Instant::now();
    let scene = payload.scene_code.as_deref().unwrap_or_default();
    let mut inspection = None;
    let operation = match scene {
        scene::ADMIN_ARTICLE_CREATE => {
            let write = article_write(payload);
            let result = article_html_core::inspect(&write.content_html);
            if !result.valid {
                return invalid_html(result);
            }
            inspection = Some(result);
            DataOperation::ArticleCreate(write)
        }
        scene::ADMIN_ARTICLE_UPDATE => {
            let write = article_write(payload);
            let result = article_html_core::inspect(&write.content_html);
            if !result.valid {
                return invalid_html(result);
            }
            inspection = Some(result);
            DataOperation::ArticleUpdate(write)
        }
        scene::ADMIN_ARTICLE_PUBLISH => {
            let id = payload.id.unwrap_or_default();
            let read = state
                .data
                .call(
                    &request_id(scene),
                    &DataOperation::ArticleGet(ArticleGetQuery {
                        id,
                        published_only: false,
                    }),
                    ENTRY_BUDGET,
                )
                .await;
            let detail = match read {
                Ok(trace) => match trace.outcome {
                    protocol::DataOutcome::ArticleDetail(detail) => detail,
                    _ => {
                        return data_failure(
                            &DataCallError::Unavailable(unexpected_payload().0),
                            scene,
                        );
                    }
                },
                Err(error) => return data_failure(&error, scene),
            };
            let result = article_html_core::inspect(&detail.content_html);
            if !result.valid {
                return invalid_html(result);
            }
            inspection = Some(result);
            DataOperation::ArticlePublishChecked(protocol::ArticlePublishChecked {
                id,
                content_html: detail.content_html,
            })
        }
        scene::ADMIN_ARTICLE_UNPUBLISH => DataOperation::ArticleUnpublish(ArticleId {
            id: payload.id.unwrap_or_default(),
        }),
        _ => return unknown_scene_code(),
    };
    let Some(budget) = ENTRY_BUDGET
        .checked_sub(started.elapsed())
        .filter(|budget| !budget.is_zero())
    else {
        return data_failure(&DataCallError::DeadlineExceeded, scene);
    };
    match state
        .data
        .call(&request_id(scene), &operation, budget)
        .await
    {
        Ok(trace) => {
            let calls = if scene == scene::ADMIN_ARTICLE_PUBLISH {
                2
            } else {
                1
            };
            crate::product_info!(
                "POST /api/admin/articles scene={scene} data_calls={calls} elapsed_ms={}",
                started.elapsed().as_millis()
            );
            match trace.outcome {
                protocol::DataOutcome::ArticleDetail(detail) => match inspected_detail_with(
                    &detail,
                    inspection.unwrap_or_else(|| article_html_core::inspect(&detail.content_html)),
                ) {
                    Ok(value) => envelope(&Envelope::ok(value), StatusCode::OK),
                    Err(_) => {
                        data_failure(&DataCallError::Unavailable(unexpected_payload().0), scene)
                    }
                },
                _ => data_failure(&DataCallError::Unavailable(unexpected_payload().0), scene),
            }
        }
        Err(error) => data_failure(&error, scene),
    }
}

fn article_write(payload: &AdminArticleBody) -> ArticleWrite {
    ArticleWrite {
        id: payload.id.unwrap_or_default(),
        title: payload.title.clone().unwrap_or_default(),
        summary: payload.summary.clone().unwrap_or_default(),
        article_type_id: payload.article_type_id.unwrap_or_default(),
        term_ids: payload.term_ids.clone().unwrap_or_default(),
        content_html: payload.content_html.clone().unwrap_or_default(),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NameBody {
    #[serde(default)]
    scene_code: Option<String>,
    #[serde(default)]
    id: Option<i64>,
    #[serde(default)]
    name: Option<String>,
}

async fn admin_article_types(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    match method {
        Method::GET => {
            if params.get("sceneCode").map(String::as_str) != Some(scene::ADMIN_ARTICLE_TYPE_LIST) {
                return unknown_scene_code();
            }
            respond(
                &state,
                "GET /api/admin/article-types",
                scene::ADMIN_ARTICLE_TYPE_LIST,
                DataOperation::ArticleTypeList(ArticleTypeListQuery::default()),
                |outcome| match outcome {
                    protocol::DataOutcome::ArticleTypes(types) => encode(&wire::to_types(&types)),
                    _ => Err(unexpected_payload()),
                },
            )
            .await
        }
        Method::POST => {
            let Ok(payload) = serde_json::from_slice::<NameBody>(&body) else {
                return envelope(
                    &Envelope::<serde_json::Value>::failure(
                        code::INVALID_JSON,
                        "request body is not valid JSON",
                    ),
                    StatusCode::BAD_REQUEST,
                );
            };
            let operation = match payload.scene_code.as_deref() {
                Some(scene::ADMIN_ARTICLE_TYPE_CREATE) => {
                    DataOperation::ArticleTypeCreate(ArticleTypeName {
                        name: payload.name.unwrap_or_default(),
                    })
                }
                Some(scene::ADMIN_ARTICLE_TYPE_UPDATE) => {
                    DataOperation::ArticleTypeUpdate(ArticleTypeRename {
                        id: payload.id.unwrap_or_default(),
                        name: payload.name.unwrap_or_default(),
                    })
                }
                _ => return unknown_scene_code(),
            };
            respond(
                &state,
                "POST /api/admin/article-types",
                payload.scene_code.as_deref().unwrap_or_default(),
                operation,
                |outcome| match outcome {
                    protocol::DataOutcome::ArticleType(kind) => {
                        let encoded = encode(&wire::to_types(std::slice::from_ref(&kind)))?;
                        Ok(encoded.get(0).cloned().unwrap_or(serde_json::Value::Null))
                    }
                    protocol::DataOutcome::Unit(_) => Ok(serde_json::Value::Null),
                    _ => Err(unexpected_payload()),
                },
            )
            .await
        }
        // Go 参考实现：非 GET/POST 的分类请求按 UNKNOWN_SCENE_CODE 处理。
        _ => unknown_scene_code(),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TermBody {
    #[serde(default)]
    scene_code: Option<String>,
    #[serde(default)]
    id: Option<i64>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    kind: Option<String>,
}

async fn admin_terms(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    match method {
        Method::GET => {
            if params.get("sceneCode").map(String::as_str) != Some(scene::ADMIN_TERM_LIST) {
                return unknown_scene_code();
            }
            respond(
                &state,
                "GET /api/admin/terms",
                scene::ADMIN_TERM_LIST,
                DataOperation::TermList(TermListQuery::default()),
                |outcome| match outcome {
                    protocol::DataOutcome::Terms(terms) => encode(&wire::to_terms(&terms)),
                    _ => Err(unexpected_payload()),
                },
            )
            .await
        }
        Method::POST => {
            let Ok(payload) = serde_json::from_slice::<TermBody>(&body) else {
                return envelope(
                    &Envelope::<serde_json::Value>::failure(
                        code::INVALID_JSON,
                        "request body is not valid JSON",
                    ),
                    StatusCode::BAD_REQUEST,
                );
            };
            let operation = match payload.scene_code.as_deref() {
                Some(scene::ADMIN_TERM_CREATE) => DataOperation::TermCreate(TermWrite {
                    id: 0,
                    name: payload.name.clone().unwrap_or_default(),
                    kind: payload.kind.clone().unwrap_or_default(),
                }),
                Some(scene::ADMIN_TERM_UPDATE) => DataOperation::TermUpdate(TermRename {
                    id: payload.id.unwrap_or_default(),
                    name: payload.name.unwrap_or_default(),
                }),
                _ => return unknown_scene_code(),
            };
            respond(
                &state,
                "POST /api/admin/terms",
                payload.scene_code.as_deref().unwrap_or_default(),
                operation,
                |outcome| match outcome {
                    protocol::DataOutcome::Term(value) => {
                        let encoded = encode(&wire::to_terms(std::slice::from_ref(&value)))?;
                        Ok(encoded.get(0).cloned().unwrap_or(serde_json::Value::Null))
                    }
                    protocol::DataOutcome::Unit(_) => Ok(serde_json::Value::Null),
                    _ => Err(unexpected_payload()),
                },
            )
            .await
        }
        // Go 参考实现：非 GET/POST 的 term 请求按 UNKNOWN_SCENE_CODE 处理。
        _ => unknown_scene_code(),
    }
}

async fn admin_recommendations(
    State(state): State<Arc<AppState>>,
    method: Method,
    body: axum::body::Bytes,
) -> Response {
    if method != Method::POST {
        return method_not_allowed();
    }
    #[derive(Debug, Deserialize)]
    struct Body {
        #[serde(rename = "sceneCode", default)]
        scene_code: Option<String>,
    }
    let Ok(payload) = serde_json::from_slice::<Body>(&body) else {
        return envelope(
            &Envelope::<serde_json::Value>::failure(
                code::INVALID_JSON,
                "request body is not valid JSON",
            ),
            StatusCode::BAD_REQUEST,
        );
    };
    if payload.scene_code.as_deref() != Some(scene::ADMIN_RECOMMENDATION_GENERATE) {
        return unknown_scene_code();
    }
    respond(
        &state,
        "POST /api/admin/recommendations",
        scene::ADMIN_RECOMMENDATION_GENERATE,
        DataOperation::RecommendationGenerate,
        |outcome| match outcome {
            protocol::DataOutcome::Recommendation(items) => encode(&wire::to_details(&items)),
            _ => Err(unexpected_payload()),
        },
    )
    .await
}

// ---------- 公共辅助 ----------

/// 一次 typed operation 调用 + envelope 组装 + 失败码映射。
async fn respond(
    state: &Arc<AppState>,
    label: &str,
    scene: &str,
    operation: DataOperation,
    to_body: impl FnOnce(protocol::DataOutcome) -> Result<serde_json::Value, (String, String)>,
) -> Response {
    let started = Instant::now();
    let result = state
        .data
        .call(&request_id(scene), &operation, ENTRY_BUDGET)
        .await;
    match result {
        Ok(mut trace) => {
            match &mut trace.outcome {
                protocol::DataOutcome::ArticleDetail(detail) if scene == scene::ARTICLE_DETAIL => {
                    if !article_html_core::inspect(&detail.content_html).valid {
                        return envelope(
                            &Envelope::<serde_json::Value>::failure(
                                code::ARTICLE_NOT_FOUND,
                                "article not found",
                            ),
                            StatusCode::NOT_FOUND,
                        );
                    }
                }
                protocol::DataOutcome::Recommendation(items) => {
                    items.retain(|detail| article_html_core::inspect(&detail.content_html).valid);
                }
                _ => {}
            }
            let items = trace.outcome.item_count();
            let queries = trace.query_count.unwrap_or_default();
            crate::product_info!(
                "{label} scene={scene} items={items} data_items={} data_calls=1 data_queries={queries} data_elapsed_ms={} elapsed_ms={}",
                trace.items.unwrap_or_default(),
                trace.elapsed.as_millis(),
                started.elapsed().as_millis()
            );
            match to_body(trace.outcome) {
                Ok(value) => envelope(&Envelope::ok(value), StatusCode::OK),
                Err((code, message)) => envelope(
                    &Envelope::<serde_json::Value>::failure(&code, message),
                    StatusCode::INTERNAL_SERVER_ERROR,
                ),
            }
        }
        Err(error) => data_failure(&error, label),
    }
}

/// Data 失败 → Product 对外 envelope（领域错误码保持兼容）。
fn data_failure(error: &DataCallError, label: &str) -> Response {
    let started = Instant::now();
    let status = match error {
        DataCallError::Backpressure => StatusCode::SERVICE_UNAVAILABLE,
        DataCallError::DeadlineExceeded => StatusCode::GATEWAY_TIMEOUT,
        DataCallError::Unavailable(message) => {
            crate::product_error!("data unavailable in {label}: {message}");
            StatusCode::BAD_GATEWAY
        }
        DataCallError::Failure(failure) => match failure.code.as_str() {
            codes::NOT_FOUND => StatusCode::NOT_FOUND,
            codes::INVALID_SUMMARY => StatusCode::UNPROCESSABLE_ENTITY,
            codes::INVALID_STATE_TRANSITION | codes::DUPLICATE_NAME | codes::ARTICLE_CHANGED => {
                StatusCode::CONFLICT
            }
            codes::INVALID_PAYLOAD => StatusCode::BAD_REQUEST,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        },
    };
    let (code, message) = match error {
        DataCallError::Backpressure => (
            code::BACKPRESSURE.to_owned(),
            "data server is saturated; retry later".to_owned(),
        ),
        DataCallError::DeadlineExceeded => (
            code::DEADLINE_EXCEEDED.to_owned(),
            "data server exceeded the request budget".to_owned(),
        ),
        DataCallError::Unavailable(message) => (code::INTERNAL_ERROR.to_owned(), message.clone()),
        DataCallError::Failure(failure) => (translate_code(&failure.code), failure.message.clone()),
    };
    crate::product_info!(
        "{label} failed code={code} elapsed_ms={}",
        started.elapsed().as_millis()
    );
    envelope(
        &Envelope::<serde_json::Value>::failure(&code, message),
        status,
    )
}

/// 领域错误码 → 对外契约（ARCH-DATA-API 的稳定集合）。
fn translate_code(internal: &str) -> String {
    match internal {
        codes::NOT_FOUND => code::ARTICLE_NOT_FOUND.to_owned(),
        codes::INVALID_SUMMARY => code::INVALID_SUMMARY.to_owned(),
        codes::INVALID_STATE_TRANSITION => code::INVALID_STATE_TRANSITION.to_owned(),
        codes::DUPLICATE_NAME => code::DUPLICATE_NAME.to_owned(),
        codes::INVALID_PAYLOAD => code::INVALID_JSON.to_owned(),
        other => other.to_owned(),
    }
}

fn unknown_scene_code() -> Response {
    envelope(
        &Envelope::<serde_json::Value>::failure(
            code::UNKNOWN_SCENE_CODE,
            "unknown sceneCode for this endpoint",
        ),
        StatusCode::BAD_REQUEST,
    )
}

fn method_not_allowed() -> Response {
    envelope(
        &Envelope::<serde_json::Value>::failure(code::METHOD_NOT_ALLOWED, "method not allowed"),
        StatusCode::METHOD_NOT_ALLOWED,
    )
}

fn invalid_id() -> Response {
    envelope(
        &Envelope::<serde_json::Value>::failure(
            code::INVALID_ID,
            "query parameter 'id' must be an integer",
        ),
        StatusCode::BAD_REQUEST,
    )
}

fn unexpected_payload() -> (String, String) {
    (
        code::INTERNAL_ERROR.to_owned(),
        "data returned an unexpected payload for this operation".to_owned(),
    )
}

fn not_found_plain() -> Response {
    (
        StatusCode::NOT_FOUND,
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        "404 page not found\n",
    )
        .into_response()
}

fn envelope<T: serde::ser::Serialize>(payload: &Envelope<T>, status: StatusCode) -> Response {
    let body = serde_json::to_vec(payload).unwrap_or_default();
    (status, [(header::CONTENT_TYPE, "application/json")], body).into_response()
}

fn request_id(scene: &str) -> String {
    format!("product-{scene}-{}", u128::from(started_unix_millis()))
}

fn started_unix_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or_default()
}

/// envelope 载荷编码（不应失败：所有载荷都是 `Serialize` 的普通结构）。
fn encode<T: serde::ser::Serialize>(value: &T) -> Result<serde_json::Value, (String, String)> {
    serde_json::to_value(value).map_err(|error| {
        crate::product_error!("encode response body failed: {error}");
        (
            code::INTERNAL_ERROR.to_owned(),
            "encode response body failed".to_owned(),
        )
    })
}

/// Go 参考实现的 `atoi`：无法解析按缺省值处理。
fn parse_u32(value: Option<&String>) -> Option<u32> {
    value.and_then(|value| value.parse::<u32>().ok())
}

fn parse_i64(value: Option<&String>) -> Option<i64> {
    value
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|id| *id > 0)
}

/// Go 参考实现的 `i64s`：逗号分隔，忽略非法与非正数。
fn parse_id_list(value: Option<&String>) -> Vec<i64> {
    value
        .map(|value| {
            value
                .split(',')
                .filter_map(|part| part.parse::<i64>().ok())
                .filter(|id| *id > 0)
                .collect()
        })
        .unwrap_or_default()
}

fn non_empty(value: Option<&String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn required_id(params: &HashMap<String, String>) -> Option<i64> {
    params
        .get("id")
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|id| *id > 0)
}
