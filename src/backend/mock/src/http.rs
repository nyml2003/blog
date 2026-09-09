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
use axum::extract::{DefaultBodyLimit, Query, State};
use axum::http::{HeaderMap, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get};
use serde::Deserialize;
use serde_json::Value;

use protocol::envelope::{codes, http_status};
use protocol::scene;
use protocol::wire::code;
use protocol::{
    ArticleBrowseQuery, ArticleGetQuery, ArticleListPage, ArticleListQuery, ArticleTypeListQuery,
    OperationFailure, TermListQuery, has_more,
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
        .route(scene::PUBLIC_TAXONOMY_ENDPOINT, any(public_taxonomy))
        .route(
            scene::MOBILE_CATEGORY_SHELF_ENDPOINT,
            any(mobile_category_shelf),
        )
        .route(scene::PUBLIC_SITE_ROUTES_ENDPOINT, any(public_site_routes))
        // 管理
        .route(
            scene::ADMIN_SESSION_ENDPOINT,
            any(admin_session).layer(DefaultBodyLimit::max(8 * 1024)),
        )
        .route("/api/admin/articles", any(admin_articles))
        .route("/api/admin/article-types", any(admin_article_types))
        .route("/api/admin/terms", any(admin_terms))
        .route("/api/admin/recommendations", any(admin_recommendations))
        .route(
            scene::ADMIN_CONTENT_WORKSPACE_ENDPOINT,
            any(admin_content_workspace),
        )
        .route(
            scene::ADMIN_CONTENT_ARTICLES_ENDPOINT,
            any(admin_content_articles),
        )
        .route(
            scene::ADMIN_CONTENT_ARTICLE_REMOVE_ENDPOINT,
            any(admin_content_article_remove),
        )
        .route(
            scene::ADMIN_CONTENT_TAXONOMY_ENDPOINT,
            any(admin_content_taxonomy_save),
        )
        .route(
            scene::ADMIN_CONTENT_TAXONOMY_ANALYZE_ENDPOINT,
            any(admin_content_taxonomy_analyze),
        )
        .route(
            scene::ADMIN_CONTENT_TAXONOMY_REVIEW_ENDPOINT,
            any(admin_content_taxonomy_review),
        )
        .route(
            scene::ADMIN_CONTENT_PREVIEW_ENDPOINT,
            any(admin_content_preview),
        )
        .route(
            scene::ADMIN_CONTENT_SUBMIT_ENDPOINT,
            any(admin_content_submit),
        )
        .route(
            scene::ADMIN_CONTENT_ABANDON_ENDPOINT,
            any(admin_content_abandon),
        )
        .route(scene::ADMIN_CONTENT_SYNC_ENDPOINT, any(admin_content_sync))
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdminSessionBody {
    #[serde(default)]
    scene_code: Option<String>,
}

async fn admin_session(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    let label = "admin session bypass";
    let scope = session_scope(&headers);
    let body_scene = serde_json::from_slice::<AdminSessionBody>(&body)
        .ok()
        .and_then(|payload| payload.scene_code);
    let requested_scene = params
        .get("sceneCode")
        .map(String::as_str)
        .or(body_scene.as_deref())
        .unwrap_or_default();
    if let Some(response) = gate(&state, label, requested_scene, &scope).await {
        return response;
    }
    let valid = match method {
        Method::POST => {
            if body_scene.is_none() {
                return invalid_json(&state, label);
            }
            scene::supports(
                Method::POST.as_str(),
                scene::ADMIN_SESSION_ENDPOINT,
                requested_scene,
            )
        }
        Method::DELETE => scene::supports(
            Method::DELETE.as_str(),
            scene::ADMIN_SESSION_ENDPOINT,
            requested_scene,
        ),
        _ => return method_not_allowed(&state, label),
    };
    if !valid {
        return unknown_scene_code(&state, label);
    }
    finish(&state, label, StatusCode::OK, &Envelope::ok(Value::Null))
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
            if !scene::supports(
                "POST",
                scene::ADMIN_ARTICLES_ENDPOINT,
                payload.scene_code.as_deref().unwrap_or_default(),
            ) {
                return unknown_scene_code(&state, label);
            }
            retired_content_write(&state, label)
        }
        _ => method_not_allowed(&state, label),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NameBody {
    #[serde(default)]
    scene_code: Option<String>,
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
            if !scene::supports(
                "POST",
                scene::ADMIN_ARTICLE_TYPES_ENDPOINT,
                payload.scene_code.as_deref().unwrap_or_default(),
            ) {
                return unknown_scene_code(&state, label);
            }
            retired_content_write(&state, label)
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
            if !scene::supports(
                "POST",
                scene::ADMIN_TERMS_ENDPOINT,
                payload.scene_code.as_deref().unwrap_or_default(),
            ) {
                return unknown_scene_code(&state, label);
            }
            retired_content_write(&state, label)
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
    retired_content_write(&state, label)
}

async fn public_taxonomy(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let scope = session_scope(&headers);
    let label = "GET /api/public/taxonomy";
    if let Some(response) = gate(
        &state,
        label,
        params.get("sceneCode").map_or("", String::as_str),
        &scope,
    )
    .await
    {
        return response;
    }
    if method != Method::GET {
        return method_not_allowed(&state, label);
    }
    if !scene::supports(
        "GET",
        scene::PUBLIC_TAXONOMY_ENDPOINT,
        params.get("sceneCode").map_or("", String::as_str),
    ) {
        return unknown_scene_code(&state, label);
    }
    let value = state.store.read(&scope, |domain| {
        taxonomy_json(&domain.content_workspace().1.taxonomy)
    });
    finish(&state, label, StatusCode::OK, &Envelope::ok(value))
}

/// 页面路由清单（SPEC-SITE-ROUTES-001）：与 Product 共用 protocol 内嵌清单，Mock 侧等价实现。
async fn public_site_routes(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let scope = session_scope(&headers);
    let label = "GET /api/public/site-routes";
    if let Some(response) = gate(
        &state,
        label,
        params.get("sceneCode").map_or("", String::as_str),
        &scope,
    )
    .await
    {
        return response;
    }
    if method != Method::GET {
        return method_not_allowed(&state, label);
    }
    if !scene::supports(
        "GET",
        scene::PUBLIC_SITE_ROUTES_ENDPOINT,
        params.get("sceneCode").map_or("", String::as_str),
    ) {
        return unknown_scene_code(&state, label);
    }
    let outcome = protocol::site_routes::site_routes_payload()
        .and_then(|payload| serde_json::to_value(&payload).map_err(|error| error.to_string()));
    match outcome {
        Ok(value) => finish(&state, label, StatusCode::OK, &Envelope::ok(value)),
        Err(error) => {
            crate::mock_error!("{label} site routes manifest error={error}");
            finish(
                &state,
                label,
                StatusCode::INTERNAL_SERVER_ERROR,
                &Envelope::<Value>::failure(code::INTERNAL_ERROR, "site routes unavailable"),
            )
        }
    }
}

async fn mobile_category_shelf(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let scope = session_scope(&headers);
    let label = "GET /api/public/mobile/category-shelf";
    if let Some(response) = gate(
        &state,
        label,
        params.get("sceneCode").map_or("", String::as_str),
        &scope,
    )
    .await
    {
        return response;
    }
    if method != Method::GET {
        return method_not_allowed(&state, label);
    }
    if !scene::supports(
        "GET",
        scene::MOBILE_CATEGORY_SHELF_ENDPOINT,
        params.get("sceneCode").map_or("", String::as_str),
    ) {
        return unknown_scene_code(&state, label);
    }
    let selected = match params.get("category_id") {
        Some(value) => match value.parse::<i64>() {
            Ok(id) if id > 0 => Some(id),
            _ => return invalid_json(&state, label),
        },
        None => None,
    };
    let result = state.store.read(&scope, |domain| domain.content_category_shelf(selected).map(|articles| { let taxonomy = taxonomy_json(&domain.content_workspace().1.taxonomy); let articles: Vec<_> = articles.into_iter().map(content_article_json).collect(); serde_json::json!({"taxonomy":taxonomy,"selectedCategoryId":selected,"total":articles.len(),"articles":articles}) }));
    match result {
        Ok(value) => finish(&state, label, StatusCode::OK, &Envelope::ok(value)),
        Err(failure) => domain_failure(&state, label, &failure, Instant::now()),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContentTaxonomyBody {
    #[serde(default)]
    scene_code: Option<String>,
    expected_version: u64,
    taxonomy: WireTaxonomy,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContentVersionBody {
    #[serde(default)]
    scene_code: Option<String>,
    expected_version: u64,
    #[serde(default)]
    article_ids: Vec<i64>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WireTaxonomy {
    version: u32,
    next_category_id: i64,
    next_tag_id: i64,
    categories: Vec<WireCategory>,
    tags: Vec<WireTag>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WireCategory {
    id: i64,
    name: String,
    parent_id: Option<i64>,
    position: i32,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WireTag {
    id: i64,
    name: String,
}
impl From<WireTaxonomy> for protocol::Taxonomy {
    fn from(value: WireTaxonomy) -> Self {
        Self {
            version: value.version,
            next_category_id: value.next_category_id,
            next_tag_id: value.next_tag_id,
            categories: value
                .categories
                .into_iter()
                .map(|v| protocol::Category {
                    id: v.id,
                    name: v.name,
                    parent_id: v.parent_id,
                    position: v.position,
                })
                .collect(),
            tags: value
                .tags
                .into_iter()
                .map(|v| protocol::Tag {
                    id: v.id,
                    name: v.name,
                })
                .collect(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContentArticleInput {
    #[serde(default)]
    id: Option<i64>,
    title: String,
    summary: String,
    category_ids: Vec<i64>,
    tag_ids: Vec<i64>,
    content_html: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContentArticleSaveBody {
    scene_code: String,
    expected_version: u64,
    article: ContentArticleInput,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContentArticleRemoveBody {
    scene_code: String,
    expected_version: u64,
    article_id: i64,
}

async fn admin_content_workspace(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let scope = session_scope(&headers);
    let label = "GET /api/admin/content/workspace";
    if let Some(response) = gate(
        &state,
        label,
        params.get("sceneCode").map_or("", String::as_str),
        &scope,
    )
    .await
    {
        return response;
    }
    if method != Method::GET {
        return method_not_allowed(&state, label);
    }
    if !scene::supports(
        "GET",
        scene::ADMIN_CONTENT_WORKSPACE_ENDPOINT,
        params.get("sceneCode").map_or("", String::as_str),
    ) {
        return unknown_scene_code(&state, label);
    }
    let value = state.store.read(&scope, workspace_json);
    finish(&state, label, StatusCode::OK, &Envelope::ok(value))
}

async fn admin_content_articles(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    let scope = session_scope(&headers);
    let label = "ADMIN /api/admin/content/articles";
    let query_scene = params.get("sceneCode").map_or("", String::as_str);
    if method == Method::GET {
        if let Some(response) = gate(&state, label, query_scene, &scope).await {
            return response;
        }
        if query_scene == scene::ADMIN_CONTENT_ARTICLE_LIST
            && scene::supports("GET", scene::ADMIN_CONTENT_ARTICLES_ENDPOINT, query_scene)
        {
            let value = state.store.read(&scope, |domain| {
                let (version, snapshot, _) = domain.content_workspace();
                serde_json::json!({
                    "version": version,
                    "articles": snapshot.articles.iter().map(content_article_json).collect::<Vec<_>>(),
                })
            });
            return finish(&state, label, StatusCode::OK, &Envelope::ok(value));
        }
        if query_scene == scene::ADMIN_CONTENT_ARTICLE_DETAIL
            && scene::supports("GET", scene::ADMIN_CONTENT_ARTICLES_ENDPOINT, query_scene)
        {
            let Some(id) = params.get("id").and_then(|value| value.parse::<i64>().ok()) else {
                return invalid_id(&state, label);
            };
            let value = state.store.read(&scope, |domain| {
                let (version, snapshot, _) = domain.content_workspace();
                snapshot
                    .articles
                    .iter()
                    .find(|article| article.meta.id == id)
                    .map(|article| {
                        serde_json::json!({
                            "version": version,
                            "article": content_article_json(article),
                        })
                    })
            });
            return match value {
                Some(value) => finish(&state, label, StatusCode::OK, &Envelope::ok(value)),
                None => domain_failure(
                    &state,
                    label,
                    &OperationFailure::new(codes::NOT_FOUND, "article not found"),
                    Instant::now(),
                ),
            };
        }
        return unknown_scene_code(&state, label);
    }
    if method != Method::POST {
        return method_not_allowed(&state, label);
    }
    let Ok(payload) = serde_json::from_slice::<ContentArticleSaveBody>(&body) else {
        return invalid_json(&state, label);
    };
    if !scene::supports(
        "POST",
        scene::ADMIN_CONTENT_ARTICLES_ENDPOINT,
        &payload.scene_code,
    ) {
        return unknown_scene_code(&state, label);
    }
    if let Some(response) = gate(&state, label, &payload.scene_code, &scope).await {
        return response;
    }
    let started = Instant::now();
    let result = state.store.write(&scope, |domain| {
        let article = payload.article;
        let saved = domain.content_save_article(
            payload.expected_version,
            crate::domain::ContentArticleDraft {
                id: article.id,
                title: article.title,
                summary: article.summary,
                category_ids: article.category_ids,
                tag_ids: article.tag_ids,
                content_html: article.content_html,
            },
        )?;
        Ok(serde_json::json!({
            "workspace": workspace_json(domain),
            "article": content_article_json(&saved),
        }))
    });
    write_response(&state, label, &payload.scene_code, &scope, result, started)
}

async fn admin_content_article_remove(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    body: axum::body::Bytes,
) -> Response {
    let scope = session_scope(&headers);
    let label = "POST /api/admin/content/articles/remove";
    if method != Method::POST {
        return method_not_allowed(&state, label);
    }
    let Ok(payload) = serde_json::from_slice::<ContentArticleRemoveBody>(&body) else {
        return invalid_json(&state, label);
    };
    if !scene::supports(
        "POST",
        scene::ADMIN_CONTENT_ARTICLE_REMOVE_ENDPOINT,
        &payload.scene_code,
    ) {
        return unknown_scene_code(&state, label);
    }
    if let Some(response) = gate(&state, label, &payload.scene_code, &scope).await {
        return response;
    }
    let started = Instant::now();
    let result = state.store.write(&scope, |domain| {
        domain.content_remove_article(payload.expected_version, payload.article_id)?;
        Ok(workspace_json(domain))
    });
    write_response(&state, label, &payload.scene_code, &scope, result, started)
}
async fn admin_content_taxonomy_save(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    body: axum::body::Bytes,
) -> Response {
    let scope = session_scope(&headers);
    let label = "POST /api/admin/content/taxonomy";
    if method != Method::POST {
        return method_not_allowed(&state, label);
    }
    let Ok(payload) = serde_json::from_slice::<ContentTaxonomyBody>(&body) else {
        return invalid_json(&state, label);
    };
    let scene_name = payload.scene_code.as_deref().unwrap_or_default();
    if !scene::supports("POST", scene::ADMIN_CONTENT_TAXONOMY_ENDPOINT, scene_name) {
        return unknown_scene_code(&state, label);
    }
    if let Some(response) = gate(&state, label, scene_name, &scope).await {
        return response;
    }
    let result = state.store.write(&scope, |domain| {
        domain
            .content_save_taxonomy(payload.expected_version, payload.taxonomy.into())
            .map(|_| workspace_json(domain))
    });
    write_response(&state, label, scene_name, &scope, result, Instant::now())
}
async fn admin_content_taxonomy_analyze(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    body: axum::body::Bytes,
) -> Response {
    content_version_mutation(
        state,
        headers,
        method,
        body,
        ContentMutationRoute {
            endpoint: scene::ADMIN_CONTENT_TAXONOMY_ANALYZE_ENDPOINT,
            scene: scene::ADMIN_CONTENT_TAXONOMY_ANALYZE,
            label: "POST /api/admin/content/taxonomy/analyze",
        },
        |domain, body| {
            if body.article_ids.iter().any(|id| {
                !domain
                    .content_workspace()
                    .1
                    .articles
                    .iter()
                    .any(|article| article.meta.id == *id)
            }) {
                return Err(OperationFailure::new(
                    codes::INVALID_PAYLOAD,
                    "articleIds contains an unknown article",
                ));
            }
            domain.content_analyze(body.expected_version)
        },
    )
    .await
}
async fn admin_content_taxonomy_review(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    body: axum::body::Bytes,
) -> Response {
    content_version_mutation(
        state,
        headers,
        method,
        body,
        ContentMutationRoute {
            endpoint: scene::ADMIN_CONTENT_TAXONOMY_REVIEW_ENDPOINT,
            scene: scene::ADMIN_CONTENT_TAXONOMY_REVIEW,
            label: "POST /api/admin/content/taxonomy/review",
        },
        |domain, body| domain.content_review(body.expected_version),
    )
    .await
}
async fn admin_content_submit(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    body: axum::body::Bytes,
) -> Response {
    content_version_mutation(
        state,
        headers,
        method,
        body,
        ContentMutationRoute {
            endpoint: scene::ADMIN_CONTENT_SUBMIT_ENDPOINT,
            scene: scene::ADMIN_CONTENT_SUBMIT,
            label: "POST /api/admin/content/submit",
        },
        |domain, body| domain.content_submit(body.expected_version),
    )
    .await
}
async fn admin_content_abandon(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    body: axum::body::Bytes,
) -> Response {
    content_version_mutation(
        state,
        headers,
        method,
        body,
        ContentMutationRoute {
            endpoint: scene::ADMIN_CONTENT_ABANDON_ENDPOINT,
            scene: scene::ADMIN_CONTENT_ABANDON,
            label: "POST /api/admin/content/abandon",
        },
        |domain, body| domain.content_abandon(body.expected_version),
    )
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContentSyncBody {
    #[serde(default)]
    scene_code: Option<String>,
}

async fn admin_content_sync(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    let scope = session_scope(&headers);
    let label = "POST /api/admin/content/sync";
    if method == Method::GET {
        if params.get("sceneCode").map(String::as_str) != Some(scene::ADMIN_CONTENT_SYNC_STATUS) {
            return unknown_scene_code(&state, label);
        }
        return finish(
            &state,
            label,
            StatusCode::OK,
            &Envelope::ok(serde_json::json!({ "status": "idle" })),
        );
    }
    if method != Method::POST {
        return method_not_allowed(&state, label);
    }
    let Ok(payload) = serde_json::from_slice::<ContentSyncBody>(&body) else {
        return invalid_json(&state, label);
    };
    if payload.scene_code.as_deref() != Some(scene::ADMIN_CONTENT_SYNC) {
        return unknown_scene_code(&state, label);
    }
    if let Some(response) = gate(&state, label, scene::ADMIN_CONTENT_SYNC, &scope).await {
        return response;
    }
    finish(
        &state,
        label,
        StatusCode::OK,
        &Envelope::ok(serde_json::json!({
            "status": "succeeded",
            "commit": "mock-main-1",
            "articleCount": state.store.read(&scope, |domain| domain.content_workspace().1.articles.len()),
        })),
    )
}

#[derive(Clone, Copy)]
struct ContentMutationRoute {
    endpoint: &'static str,
    scene: &'static str,
    label: &'static str,
}

async fn content_version_mutation(
    state: Arc<AppState>,
    headers: HeaderMap,
    method: Method,
    body: axum::body::Bytes,
    route: ContentMutationRoute,
    mutation: impl FnOnce(
        &mut crate::domain::DomainState,
        &ContentVersionBody,
    ) -> Result<(), OperationFailure>,
) -> Response {
    let scope = session_scope(&headers);
    if method != Method::POST {
        return method_not_allowed(&state, route.label);
    }
    let Ok(payload) = serde_json::from_slice::<ContentVersionBody>(&body) else {
        return invalid_json(&state, route.label);
    };
    if payload.scene_code.as_deref() != Some(route.scene)
        || !scene::supports("POST", route.endpoint, route.scene)
    {
        return unknown_scene_code(&state, route.label);
    }
    if let Some(response) = gate(&state, route.label, route.scene, &scope).await {
        return response;
    }
    let result = state.store.write(&scope, |domain| {
        mutation(domain, &payload).map(|_| workspace_json(domain))
    });
    write_response(
        &state,
        route.label,
        route.scene,
        &scope,
        result,
        Instant::now(),
    )
}
async fn admin_content_preview(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let scope = session_scope(&headers);
    let label = "GET /api/admin/content/preview";
    if let Some(response) = gate(
        &state,
        label,
        params.get("sceneCode").map_or("", String::as_str),
        &scope,
    )
    .await
    {
        return response;
    }
    if method != Method::GET {
        return method_not_allowed(&state, label);
    }
    if !scene::supports(
        "GET",
        scene::ADMIN_CONTENT_PREVIEW_ENDPOINT,
        params.get("sceneCode").map_or("", String::as_str),
    ) {
        return unknown_scene_code(&state, label);
    }
    let value=state.store.read(&scope,|domain|{let(version,current,_)=domain.content_workspace();let taxonomy=domain.content_pending().map_or(&current.taxonomy,|pending|&pending.taxonomy);serde_json::json!({"version":version,"taxonomy":taxonomy_json(taxonomy),"changedArticles":[],"diff":"","warnings":[]})});
    finish(&state, label, StatusCode::OK, &Envelope::ok(value))
}

fn taxonomy_json(value: &protocol::Taxonomy) -> Value {
    serde_json::json!({"version":value.version,"nextCategoryId":value.next_category_id,"nextTagId":value.next_tag_id,"categories":value.categories.iter().map(|v|serde_json::json!({"id":v.id,"name":v.name,"parentId":v.parent_id,"position":v.position})).collect::<Vec<_>>(),"tags":value.tags.iter().map(|v|serde_json::json!({"id":v.id,"name":v.name})).collect::<Vec<_>>()})
}
fn content_article_json(value: &protocol::ContentSnapshotArticle) -> Value {
    serde_json::json!({"id":value.meta.id,"title":value.meta.title,"summary":value.meta.summary,"updatedAt":value.meta.updated_at,"createdAt":value.meta.created_at,"publishedAt":value.meta.published_at,"categoryIds":value.meta.category_ids,"tagIds":value.meta.tag_ids,"contentHtml":value.content_html})
}
fn workspace_json(domain: &crate::domain::DomainState) -> Value {
    let (version, snapshot, pull) = domain.content_workspace();
    serde_json::json!({"version":version,"status":if pull.is_some(){"submitted"}else if version>0{"saved"}else{"clean"},"taxonomy":taxonomy_json(&snapshot.taxonomy),"articles":snapshot.articles.iter().map(content_article_json).collect::<Vec<_>>(),"pullRequest":pull.map(|number|serde_json::json!({"number":number,"branch":"content/mock-1","commit":"mock-commit-1"}))})
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

fn retired_content_write(state: &Arc<AppState>, label: &str) -> Response {
    finish(
        state,
        label,
        StatusCode::GONE,
        &Envelope::<Value>::failure(
            code::CONTENT_WRITE_RETIRED,
            "direct content writes are retired; use the versioned content workspace",
        ),
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
    }
}
