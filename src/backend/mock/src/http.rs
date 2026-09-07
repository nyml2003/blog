//! Mock 的 HTTP 面：与 `crates/product/src/http.rs` 相同的路由集合、`sceneCode`
//! 分支、envelope、领域错误码与 camelCase 字段；数据来自内存 session 状态。
//!
//! 场景注入点（唯一两处，见 [`scenario::Scenario`]）：
//!
//! 1. [`gate`]：`/api/*` 请求进入业务逻辑**之前**——`slow` 在此延迟，
//!    `server-error` 在此短路返回 `500`（因此写操作不生效）；
//! 2. [`finish`]：响应体序列化**之后**——`malformed-response` 在此截断 JSON
//!    （因此状态仍被修改，但客户端永远拿不到可解析的载荷）。
//!
//! `/healthz` 与 `/mock/diagnostics` 不经过这两处：就绪探测和「现在是什么场景」
//! 的观察通道必须始终可用。

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use axum::Router;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get};
use serde::Deserialize;
use serde_json::Value;

use protocol::envelope::{codes, http_status};
use protocol::scene;
use protocol::wire::code;
use protocol::{
    ArticleBrowseQuery, ArticleGetQuery, ArticleId, ArticleListPage, ArticleListQuery,
    ArticleTypeListQuery, ArticleTypeName, ArticleTypeRename, ArticleWrite, OperationFailure,
    TermListQuery, TermRename, TermWrite, has_more,
};

use crate::bff;
use crate::scenario::{Fault, TRUNCATE_BYTES};
use crate::store::{SESSION_HEADER, SessionScope, Store, scope_from_header};
use protocol::wire::{self, Envelope};

pub struct AppState {
    pub store: Arc<Store>,
    pub bound_addr: String,
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
        .route("/api/public/t-shelf", any(t_shelf))
        // 管理
        .route("/api/admin/articles", any(admin_articles))
        .route("/api/admin/article-types", any(admin_article_types))
        .route("/api/admin/terms", any(admin_terms))
        .route("/api/admin/recommendations", any(admin_recommendations))
        // Mock 自己的诊断面（描述场景与 session，而不是 Product 的 Data 调用计数）。
        .route("/mock/diagnostics", get(diagnostics))
        .fallback(not_found_plain)
        .with_state(state)
}

// ---------- 非业务端点（不被场景影响） ----------

async fn healthz() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        "ok\n",
    )
}

async fn diagnostics(State(state): State<Arc<AppState>>) -> Response {
    let payload = state
        .store
        .diagnostics(&state.bound_addr, state.started.elapsed().as_millis());
    envelope_response(StatusCode::OK, &Envelope::ok(payload), None)
}

// ---------- 场景注入 ----------

/// 场景注入的第一阶段：计数 → 延迟 → `server-error` 短路。
///
/// 返回 `Some(response)` 时请求到此为止（**不会**触碰 session 状态）。
async fn gate(
    state: &Arc<AppState>,
    label: &str,
    scene: &str,
    scope: &SessionScope,
) -> Option<Response> {
    state.store.count_api_request();
    let scenario = state.store.scenario();
    let delay = scenario.delay();
    if !delay.is_zero() {
        crate::mock_info!(
            "{label} scene={scene} session={} delaying_ms={}",
            describe(scope),
            delay.as_millis()
        );
        tokio::time::sleep(delay).await;
    }
    if scenario.fault() == Some(Fault::ServerError) {
        state.store.count_fault_served();
        crate::mock_info!(
            "{label} scene={scene} session={} fault=server-error status=500",
            describe(scope)
        );
        return Some(envelope_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            &Envelope::<Value>::failure(
                code::INTERNAL_ERROR,
                format!(
                    "mock scenario '{}' is active; no data is served",
                    scenario.name()
                ),
            ),
            Some(Fault::ServerError),
        ));
    }
    None
}

/// 场景注入的第二阶段：`malformed-response` 截断序列化后的 JSON body。
fn finish(
    state: &Arc<AppState>,
    label: &str,
    status: StatusCode,
    payload: &Envelope<Value>,
) -> Response {
    let fault = match state.store.scenario().fault() {
        Some(Fault::MalformedResponse) => {
            state.store.count_fault_served();
            crate::mock_info!(
                "{label} status={} fault=malformed-response truncate_bytes={TRUNCATE_BYTES}",
                status.as_u16()
            );
            Some(Fault::MalformedResponse)
        }
        other => other,
    };
    envelope_response(status, payload, fault)
}

/// 序列化 envelope（`malformed-response` 场景在这里截断）。
fn envelope_response(
    status: StatusCode,
    payload: &Envelope<Value>,
    fault: Option<Fault>,
) -> Response {
    let mut body = serde_json::to_vec(payload).unwrap_or_default();
    if fault == Some(Fault::MalformedResponse) {
        let keep = body.len().saturating_sub(TRUNCATE_BYTES);
        body.truncate(keep);
    }
    (status, [(header::CONTENT_TYPE, "application/json")], body).into_response()
}

// ---------- 公开端点 ----------

async fn public_articles(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let started = Instant::now();
    let scope = session_scope(&headers);
    let label = "GET /api/public/articles";
    if let Some(response) = gate(
        &state,
        label,
        params
            .get("sceneCode")
            .map(String::as_str)
            .unwrap_or_default(),
        &scope,
    )
    .await
    {
        return response;
    }
    if method != Method::GET {
        return method_not_allowed(&state, label);
    }
    match params.get("sceneCode").map(String::as_str) {
        Some(scene::ARTICLE_LIST) => article_list(&state, label, &scope, &params, true, started),
        Some(scene::ARTICLE_BROWSE) => article_browse(&state, label, &scope, &params, started),
        Some(scene::ARTICLE_DETAIL) => match required_id(&params) {
            Some(id) => article_detail(
                &state,
                label,
                &scope,
                id,
                true,
                scene::ARTICLE_DETAIL,
                started,
            ),
            None => invalid_id(&state, label),
        },
        _ => unknown_scene_code(&state, label),
    }
}

async fn public_article_types(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let started = Instant::now();
    let scope = session_scope(&headers);
    let label = "GET /api/public/article-types";
    if let Some(response) = gate(&state, label, scene::ARTICLE_TYPE_LIST, &scope).await {
        return response;
    }
    // 与 Product 一致：非 GET 或 sceneCode 不符都按 UNKNOWN_SCENE_CODE 处理。
    if method != Method::GET
        || params.get("sceneCode").map(String::as_str) != Some(scene::ARTICLE_TYPE_LIST)
    {
        return unknown_scene_code(&state, label);
    }
    let types = state.store.read(&scope, |domain| {
        domain.article_type_list(&ArticleTypeListQuery::default())
    });
    crate::mock_info!(
        "{label} scene={} session={} items={} elapsed_ms={}",
        scene::ARTICLE_TYPE_LIST,
        describe(&scope),
        types.len(),
        started.elapsed().as_millis()
    );
    ok(&state, label, StatusCode::OK, &wire::to_types(&types))
}

async fn public_terms(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let started = Instant::now();
    let scope = session_scope(&headers);
    let label = "GET /api/public/terms";
    if let Some(response) = gate(&state, label, scene::TERM_LIST, &scope).await {
        return response;
    }
    if method != Method::GET
        || params.get("sceneCode").map(String::as_str) != Some(scene::TERM_LIST)
    {
        return unknown_scene_code(&state, label);
    }
    let kind = params.get("kind").filter(|kind| !kind.is_empty()).cloned();
    let terms = state
        .store
        .read(&scope, |domain| domain.term_list(&TermListQuery { kind }));
    crate::mock_info!(
        "{label} scene={} session={} items={} elapsed_ms={}",
        scene::TERM_LIST,
        describe(&scope),
        terms.len(),
        started.elapsed().as_millis()
    );
    ok(&state, label, StatusCode::OK, &wire::to_terms(&terms))
}

async fn public_recommendations(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let started = Instant::now();
    let scope = session_scope(&headers);
    let label = "GET /api/public/recommendations";
    if let Some(response) = gate(&state, label, scene::RECOMMENDATION_CURRENT, &scope).await {
        return response;
    }
    if method != Method::GET
        || params.get("sceneCode").map(String::as_str) != Some(scene::RECOMMENDATION_CURRENT)
    {
        return unknown_scene_code(&state, label);
    }
    let items = state
        .store
        .read(&scope, |domain| domain.recommendation_current());
    crate::mock_info!(
        "{label} scene={} session={} items={} elapsed_ms={}",
        scene::RECOMMENDATION_CURRENT,
        describe(&scope),
        items.len(),
        started.elapsed().as_millis()
    );
    ok(&state, label, StatusCode::OK, &wire::to_details(&items))
}

/// mobile shelf BFF：分组/空分区隐藏/推荐截断都在服务端完成（ARCH-DATA-API）。
async fn mobile_article_shelf(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let started = Instant::now();
    let scope = session_scope(&headers);
    let label = "GET /api/public/mobile/article-shelf";
    if let Some(response) = gate(&state, label, scene::MOBILE_ARTICLE_SHELF, &scope).await {
        return response;
    }
    if method != Method::GET
        || params.get("sceneCode").map(String::as_str) != Some(scene::MOBILE_ARTICLE_SHELF)
    {
        return unknown_scene_code(&state, label);
    }
    let request = bff::mobile_shelf::MobileShelfRequest {
        article_type_id: parse_i64(params.get("type_id")),
        term_ids: parse_id_list(params.get("term_ids")),
        created_from: non_empty(params.get("created_from")),
        created_to: non_empty(params.get("created_to")),
        updated_from: non_empty(params.get("updated_from")),
        updated_to: non_empty(params.get("updated_to")),
    };
    let shelf = state
        .store
        .read(&scope, |domain| bff::mobile_shelf::load(domain, request));
    crate::mock_info!(
        "{label} scene={} session={} items={} total={} sections={} elapsed_ms={}",
        scene::MOBILE_ARTICLE_SHELF,
        describe(&scope),
        shelf
            .sections
            .iter()
            .map(|section| section.articles.len())
            .sum::<usize>(),
        shelf.total,
        shelf.sections.len(),
        started.elapsed().as_millis()
    );
    ok(&state, label, StatusCode::OK, &shelf)
}

/// 公开端 T 型货架：首次请求同时返回完整类型筛选项和默认货架；切换后按
/// `filter_id` 重新读取当前 surface 下的文章。
async fn t_shelf(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let started = Instant::now();
    let scope = session_scope(&headers);
    let label = "GET /api/public/t-shelf";
    if let Some(response) = gate(&state, label, scene::T_SHELF, &scope).await {
        return response;
    }
    if method != Method::GET || params.get("sceneCode").map(String::as_str) != Some(scene::T_SHELF)
    {
        return unknown_scene_code(&state, label);
    }
    let request = match bff::t_shelf::request(
        params.get("surface").map(String::as_str),
        params.get("filter_id").map(String::as_str),
    ) {
        Ok(request) => request,
        Err(failure) => return domain_failure(&state, label, &failure, started),
    };
    let outcome = state
        .store
        .read(&scope, |domain| bff::t_shelf::load(domain, &request));
    match outcome {
        Ok(shelf) => {
            crate::mock_info!(
                "{label} scene={} session={} items={} total={} elapsed_ms={}",
                scene::T_SHELF,
                describe(&scope),
                shelf.articles.len(),
                shelf.total,
                started.elapsed().as_millis()
            );
            ok(&state, label, StatusCode::OK, &shelf)
        }
        Err(failure) => domain_failure(&state, label, &failure, started),
    }
}

// ---------- 文章（公开 + 管理共用实现） ----------

fn article_list(
    state: &Arc<AppState>,
    label: &str,
    scope: &SessionScope,
    params: &HashMap<String, String>,
    published_only: bool,
    started: Instant,
) -> Response {
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
    match state
        .store
        .read(scope, |domain| domain.article_list(&query))
    {
        Ok(page) => {
            crate::mock_info!(
                "{label} scene={scene} session={} items={} total={} elapsed_ms={}",
                describe(scope),
                page.items.len(),
                page.total,
                started.elapsed().as_millis()
            );
            let body = if published_only {
                public_list_page(&page)
            } else {
                // 管理列表只回 `items`/`total`（与 Product 相同形态）。
                serde_json::json!({
                    "items": wire::to_list_items(&page.items),
                    "total": page.total,
                })
            };
            finish(state, label, StatusCode::OK, &Envelope::ok(body))
        }
        Err(failure) => domain_failure(state, label, &failure, started),
    }
}

/// Mobile 平铺页浏览（SPEC-MOBILE-BROWSE-IA-001）：type/topic/tag 三个维度各单选、
/// 维度间 AND；`topic_id` / `tag_id` 需与 term kind 一致，否则参数错误。
fn article_browse(
    state: &Arc<AppState>,
    label: &str,
    scope: &SessionScope,
    params: &HashMap<String, String>,
    started: Instant,
) -> Response {
    let query = ArticleBrowseQuery {
        page: parse_u32(params.get("page")),
        page_size: parse_u32(params.get("pageSize")),
        article_type_id: parse_i64(params.get("type_id")),
        topic_id: parse_i64(params.get("topic_id")),
        tag_id: parse_i64(params.get("tag_id")),
        published_only: true,
    };
    match state
        .store
        .read(scope, |domain| domain.article_browse(&query))
    {
        Ok(page) => {
            crate::mock_info!(
                "{label} scene={} session={} items={} total={} elapsed_ms={}",
                scene::ARTICLE_BROWSE,
                describe(scope),
                page.items.len(),
                page.total,
                started.elapsed().as_millis()
            );
            finish(
                state,
                label,
                StatusCode::OK,
                &Envelope::ok(public_list_page(&page)),
            )
        }
        Err(failure) => domain_failure(state, label, &failure, started),
    }
}

/// 公开列表 / 浏览共用的响应体（wire [`wire::ArticleListPage`]，camelCase）。
fn public_list_page(page: &ArticleListPage) -> Value {
    serde_json::to_value(wire::ArticleListPage {
        has_more: has_more(page.page, page.page_size, page.total),
        items: wire::to_list_items(&page.items),
        page: page.page,
        page_size: page.page_size,
        total: page.total,
    })
    .unwrap_or(Value::Null)
}

fn article_detail(
    state: &Arc<AppState>,
    label: &str,
    scope: &SessionScope,
    id: i64,
    published_only: bool,
    scene: &str,
    started: Instant,
) -> Response {
    let query = ArticleGetQuery { id, published_only };
    match state.store.read(scope, |domain| domain.article_get(&query)) {
        Ok(detail) => {
            crate::mock_info!(
                "{label} scene={scene} session={} id={} elapsed_ms={}",
                describe(scope),
                detail.id,
                started.elapsed().as_millis()
            );
            if published_only {
                ok(state, label, StatusCode::OK, &wire::to_detail(&detail))
            } else {
                ok(state, label, StatusCode::OK, &to_detail_value(detail))
            }
        }
        Err(failure) => domain_failure(state, label, &failure, started),
    }
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
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    let started = Instant::now();
    let scope = session_scope(&headers);
    let label = "POST /api/admin/articles";
    let read_label = "GET /api/admin/articles";
    if let Some(response) = gate(
        &state,
        if method == Method::GET {
            read_label
        } else {
            label
        },
        params
            .get("sceneCode")
            .map(String::as_str)
            .unwrap_or_default(),
        &scope,
    )
    .await
    {
        return response;
    }
    match method {
        Method::GET => match params.get("sceneCode").map(String::as_str) {
            Some(scene::ADMIN_ARTICLE_LIST) => {
                article_list(&state, read_label, &scope, &params, false, started)
            }
            Some(scene::ADMIN_ARTICLE_DETAIL) => match required_id(&params) {
                Some(id) => article_detail(
                    &state,
                    read_label,
                    &scope,
                    id,
                    false,
                    scene::ADMIN_ARTICLE_DETAIL,
                    started,
                ),
                None => invalid_id(&state, read_label),
            },
            _ => unknown_scene_code(&state, read_label),
        },
        Method::POST => {
            let Ok(payload) = serde_json::from_slice::<AdminArticleBody>(&body) else {
                return invalid_json(&state, label);
            };
            let scene_name = payload.scene_code.as_deref().unwrap_or_default();
            let outcome = match payload.scene_code.as_deref() {
                Some(scene::ADMIN_ARTICLE_CREATE) => state.store.write(&scope, |domain| {
                    domain
                        .article_create(&article_write(&payload))
                        .map(to_detail_value)
                }),
                Some(scene::ADMIN_ARTICLE_UPDATE) => state.store.write(&scope, |domain| {
                    domain
                        .article_update(&article_write(&payload))
                        .map(to_detail_value)
                }),
                Some(scene::ADMIN_ARTICLE_PUBLISH) => state.store.write(&scope, |domain| {
                    domain
                        .article_publish(&ArticleId {
                            id: payload.id.unwrap_or_default(),
                        })
                        .map(to_detail_value)
                }),
                Some(scene::ADMIN_ARTICLE_UNPUBLISH) => state.store.write(&scope, |domain| {
                    domain
                        .article_unpublish(&ArticleId {
                            id: payload.id.unwrap_or_default(),
                        })
                        .map(to_detail_value)
                }),
                _ => return unknown_scene_code(&state, label),
            };
            write_response(&state, label, scene_name, &scope, outcome, started)
        }
        _ => method_not_allowed(&state, label),
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
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    let started = Instant::now();
    let scope = session_scope(&headers);
    let label = "POST /api/admin/article-types";
    let read_label = "GET /api/admin/article-types";
    if let Some(response) = gate(
        &state,
        if method == Method::GET {
            read_label
        } else {
            label
        },
        params
            .get("sceneCode")
            .map(String::as_str)
            .unwrap_or_default(),
        &scope,
    )
    .await
    {
        return response;
    }
    match method {
        Method::GET => {
            if params.get("sceneCode").map(String::as_str) != Some(scene::ADMIN_ARTICLE_TYPE_LIST) {
                return unknown_scene_code(&state, read_label);
            }
            let types = state.store.read(&scope, |domain| {
                domain.article_type_list(&ArticleTypeListQuery::default())
            });
            crate::mock_info!(
                "{read_label} scene={} session={} items={} elapsed_ms={}",
                scene::ADMIN_ARTICLE_TYPE_LIST,
                describe(&scope),
                types.len(),
                started.elapsed().as_millis()
            );
            ok(&state, read_label, StatusCode::OK, &wire::to_types(&types))
        }
        Method::POST => {
            let Ok(payload) = serde_json::from_slice::<NameBody>(&body) else {
                return invalid_json(&state, label);
            };
            let scene_name = payload.scene_code.as_deref().unwrap_or_default();
            let outcome = match payload.scene_code.as_deref() {
                Some(scene::ADMIN_ARTICLE_TYPE_CREATE) => state.store.write(&scope, |domain| {
                    domain
                        .article_type_create(&ArticleTypeName {
                            name: payload.name.unwrap_or_default(),
                        })
                        .map(|kind| {
                            serde_json::to_value(&wire::to_types(std::slice::from_ref(&kind))[0])
                                .unwrap_or(Value::Null)
                        })
                }),
                Some(scene::ADMIN_ARTICLE_TYPE_UPDATE) => state.store.write(&scope, |domain| {
                    domain
                        .article_type_update(&ArticleTypeRename {
                            id: payload.id.unwrap_or_default(),
                            name: payload.name.unwrap_or_default(),
                        })
                        .map(|_| Value::Null)
                }),
                _ => return unknown_scene_code(&state, label),
            };
            write_response(&state, label, scene_name, &scope, outcome, started)
        }
        // 与 Product 一致：非 GET/POST 的分类请求按 UNKNOWN_SCENE_CODE 处理。
        _ => unknown_scene_code(&state, label),
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
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    let started = Instant::now();
    let scope = session_scope(&headers);
    let label = "POST /api/admin/terms";
    let read_label = "GET /api/admin/terms";
    if let Some(response) = gate(
        &state,
        if method == Method::GET {
            read_label
        } else {
            label
        },
        params
            .get("sceneCode")
            .map(String::as_str)
            .unwrap_or_default(),
        &scope,
    )
    .await
    {
        return response;
    }
    match method {
        Method::GET => {
            if params.get("sceneCode").map(String::as_str) != Some(scene::ADMIN_TERM_LIST) {
                return unknown_scene_code(&state, read_label);
            }
            let terms = state
                .store
                .read(&scope, |domain| domain.term_list(&TermListQuery::default()));
            crate::mock_info!(
                "{read_label} scene={} session={} items={} elapsed_ms={}",
                scene::ADMIN_TERM_LIST,
                describe(&scope),
                terms.len(),
                started.elapsed().as_millis()
            );
            ok(&state, read_label, StatusCode::OK, &wire::to_terms(&terms))
        }
        Method::POST => {
            let Ok(payload) = serde_json::from_slice::<TermBody>(&body) else {
                return invalid_json(&state, label);
            };
            let scene_name = payload.scene_code.as_deref().unwrap_or_default();
            let outcome = match payload.scene_code.as_deref() {
                Some(scene::ADMIN_TERM_CREATE) => state.store.write(&scope, |domain| {
                    domain
                        .term_create(&TermWrite {
                            id: 0,
                            name: payload.name.clone().unwrap_or_default(),
                            kind: payload.kind.clone().unwrap_or_default(),
                        })
                        .map(|term| {
                            serde_json::to_value(&wire::to_terms(std::slice::from_ref(&term))[0])
                                .unwrap_or(Value::Null)
                        })
                }),
                Some(scene::ADMIN_TERM_UPDATE) => state.store.write(&scope, |domain| {
                    domain
                        .term_update(&TermRename {
                            id: payload.id.unwrap_or_default(),
                            name: payload.name.unwrap_or_default(),
                        })
                        .map(|_| Value::Null)
                }),
                _ => return unknown_scene_code(&state, label),
            };
            write_response(&state, label, scene_name, &scope, outcome, started)
        }
        // 与 Product 一致：非 GET/POST 的 term 请求按 UNKNOWN_SCENE_CODE 处理。
        _ => unknown_scene_code(&state, label),
    }
}

async fn admin_recommendations(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    body: axum::body::Bytes,
) -> Response {
    let started = Instant::now();
    let scope = session_scope(&headers);
    let label = "POST /api/admin/recommendations";
    if let Some(response) = gate(&state, label, scene::ADMIN_RECOMMENDATION_GENERATE, &scope).await
    {
        return response;
    }
    if method != Method::POST {
        return method_not_allowed(&state, label);
    }
    #[derive(Debug, Deserialize)]
    struct Body {
        #[serde(rename = "sceneCode", default)]
        scene_code: Option<String>,
    }
    let Ok(payload) = serde_json::from_slice::<Body>(&body) else {
        return invalid_json(&state, label);
    };
    if payload.scene_code.as_deref() != Some(scene::ADMIN_RECOMMENDATION_GENERATE) {
        return unknown_scene_code(&state, label);
    }
    // 管理端「刷新」：以最近更新的 6 篇已发布文章重建生效集合，并在当前 session 可见。
    let outcome = state.store.write(&scope, |domain| {
        Ok(to_details_value(&domain.recommendation_generate()))
    });
    write_response(
        &state,
        label,
        scene::ADMIN_RECOMMENDATION_GENERATE,
        &scope,
        outcome,
        started,
    )
}

// ---------- 公共辅助 ----------

/// 写操作统一收口：日志 + envelope（成功或领域失败码）。
#[allow(clippy::too_many_arguments)]
fn write_response(
    state: &Arc<AppState>,
    label: &str,
    scene: &str,
    scope: &SessionScope,
    outcome: Result<Value, OperationFailure>,
    started: Instant,
) -> Response {
    match outcome {
        Ok(value) => {
            crate::mock_info!(
                "{label} scene={scene} session={} write_attempts={} elapsed_ms={}",
                describe(scope),
                state.store.counters().write_attempts(),
                started.elapsed().as_millis()
            );
            finish(state, label, StatusCode::OK, &Envelope::ok(value))
        }
        Err(failure) => domain_failure(state, label, &failure, started),
    }
}

/// Data 领域失败码 → 对外契约（ARCH-DATA-API 的稳定集合 + Product 的映射）。
fn domain_failure(
    state: &Arc<AppState>,
    label: &str,
    failure: &OperationFailure,
    started: Instant,
) -> Response {
    let status = StatusCode::from_u16(http_status(&failure.code))
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    crate::mock_info!(
        "{label} failed code={} status={} elapsed_ms={}",
        failure.code,
        status.as_u16(),
        started.elapsed().as_millis()
    );
    finish(
        state,
        label,
        status,
        &Envelope::<Value> {
            code: translate_code(&failure.code),
            message: failure.message.clone(),
            data: failure.data.clone(),
        },
    )
}

fn ok(
    state: &Arc<AppState>,
    label: &str,
    status: StatusCode,
    body: &impl serde::ser::Serialize,
) -> Response {
    let value = serde_json::to_value(body).unwrap_or(Value::Null);
    finish(state, label, status, &Envelope::ok(value))
}

/// 领域错误码 → 对外契约（与 `crates/product/src/http.rs` 的 `translate_code` 一致）。
fn translate_code(internal: &str) -> String {
    match internal {
        codes::NOT_FOUND => code::ARTICLE_NOT_FOUND.to_owned(),
        codes::INVALID_PAYLOAD => code::INVALID_JSON.to_owned(),
        other => other.to_owned(),
    }
}

fn to_detail_value(detail: protocol::ArticleDetail) -> Value {
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct InspectedArticle {
        #[serde(flatten)]
        article: wire::ArticleDetail,
        html_inspection: article_html_core::Inspection,
    }
    serde_json::to_value(InspectedArticle {
        article: wire::to_detail(&detail),
        html_inspection: article_html_core::inspect(&detail.content_html),
    })
    .unwrap_or(Value::Null)
}

fn to_details_value(details: &[protocol::ArticleDetail]) -> Value {
    serde_json::to_value(wire::to_details(details)).unwrap_or(Value::Null)
}

fn unknown_scene_code(state: &Arc<AppState>, label: &str) -> Response {
    finish(
        state,
        label,
        StatusCode::BAD_REQUEST,
        &Envelope::<Value>::failure(
            code::UNKNOWN_SCENE_CODE,
            "unknown sceneCode for this endpoint",
        ),
    )
}

fn method_not_allowed(state: &Arc<AppState>, label: &str) -> Response {
    finish(
        state,
        label,
        StatusCode::METHOD_NOT_ALLOWED,
        &Envelope::<Value>::failure(code::METHOD_NOT_ALLOWED, "method not allowed"),
    )
}

fn invalid_id(state: &Arc<AppState>, label: &str) -> Response {
    finish(
        state,
        label,
        StatusCode::BAD_REQUEST,
        &Envelope::<Value>::failure(code::INVALID_ID, "query parameter 'id' must be an integer"),
    )
}

fn invalid_json(state: &Arc<AppState>, label: &str) -> Response {
    finish(
        state,
        label,
        StatusCode::BAD_REQUEST,
        &Envelope::<Value>::failure(code::INVALID_JSON, "request body is not valid JSON"),
    )
}

async fn not_found_plain() -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        "404 page not found\n",
    )
}

fn session_scope(headers: &HeaderMap) -> SessionScope {
    scope_from_header(
        headers
            .get(SESSION_HEADER)
            .and_then(|value| value.to_str().ok()),
    )
}

fn describe(scope: &SessionScope) -> &'static str {
    match scope {
        // 日志里不回显 session id 本身（dev 值可读性足够，且避免日志里出现任意请求头内容）。
        SessionScope::Anonymous => "anonymous",
        SessionScope::Named(_) => "named",
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use protocol::ArticleWrite;

    fn state(scenario: crate::scenario::Scenario) -> Arc<AppState> {
        Arc::new(AppState {
            store: Arc::new(Store::new(scenario)),
            bound_addr: "127.0.0.1:9090".to_owned(),
            started: Instant::now(),
        })
    }

    fn params(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
            .collect()
    }

    #[test]
    fn translate_keeps_the_product_error_surface() {
        assert_eq!(translate_code(codes::NOT_FOUND), code::ARTICLE_NOT_FOUND);
        assert_eq!(translate_code(codes::INVALID_PAYLOAD), code::INVALID_JSON);
        assert_eq!(
            translate_code(codes::INVALID_STATE_TRANSITION),
            code::INVALID_STATE_TRANSITION
        );
        assert_eq!(translate_code(codes::DUPLICATE_NAME), code::DUPLICATE_NAME);
        assert_eq!(
            translate_code(codes::INVALID_SUMMARY),
            code::INVALID_SUMMARY
        );
    }

    #[test]
    fn domain_failures_map_to_the_same_http_status_as_product() {
        let app = state(crate::scenario::Scenario::Default);
        for (internal, expected) in [
            (codes::NOT_FOUND, 404),
            (codes::INVALID_SUMMARY, 422),
            (codes::INVALID_STATE_TRANSITION, 409),
            (codes::DUPLICATE_NAME, 409),
            (codes::INVALID_PAYLOAD, 400),
        ] {
            let response = domain_failure(
                &app,
                "test",
                &OperationFailure::new(internal, "message"),
                Instant::now(),
            );
            assert_eq!(response.status().as_u16(), expected, "{internal}");
        }
    }

    #[test]
    fn list_projection_matches_the_product_page_shape() {
        let app = state(crate::scenario::Scenario::Default);
        let response = article_list(
            &app,
            "test",
            &SessionScope::Anonymous,
            &params(&[("page", "1"), ("pageSize", "4")]),
            true,
            Instant::now(),
        );
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[test]
    fn query_helpers_follow_the_go_reference_behavior() {
        assert_eq!(parse_u32(Some(&"7".to_owned())), Some(7));
        assert_eq!(parse_u32(Some(&"abc".to_owned())), None);
        assert_eq!(parse_i64(Some(&"3".to_owned())), Some(3));
        assert_eq!(parse_i64(Some(&"0".to_owned())), None, "non-positive ids");
        assert_eq!(
            parse_id_list(Some(&"1,x,2".to_owned())),
            vec![1, 2],
            "invalid parts are ignored"
        );
        assert_eq!(non_empty(Some(&"  ".to_owned())), None);
        assert_eq!(required_id(&params(&[("id", "12")])), Some(12));
        assert_eq!(required_id(&params(&[("id", "x")])), None);
        let write = article_write(&AdminArticleBody {
            scene_code: None,
            id: Some(4),
            title: Some("t".to_owned()),
            summary: None,
            article_type_id: None,
            term_ids: Some(vec![1]),
            content_html: None,
        });
        assert_eq!(
            write,
            ArticleWrite {
                id: 4,
                title: "t".to_owned(),
                summary: String::new(),
                article_type_id: 0,
                term_ids: vec![1],
                content_html: String::new(),
            }
        );
    }
}
