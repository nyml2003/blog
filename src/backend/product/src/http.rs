//! Product 的 HTTP 面：公开 API、管理 API、BFF 与静态挂载（`web/dist`）。
//!
//! 外部契约（ARCH-DATA-API，见 `docs/architecture/data-and-api.md`）：
//! - 业务接口只用 `GET`/`POST`；`sceneCode` 采用 `端点.场景` 命名；
//! - 响应 `{ code, message, data }`，字段 camelCase；
//! - 公开查询隐含 `status = 'published'`，草稿/下线文章不泄露管理状态；
//! - 同一筛选维度 OR，不同维度 AND；默认排序 `updated_at DESC, id DESC`；
//! - 状态机 `draft -> published -> draft`；时间字段由服务端维护。
//!
//! Product→Data 调用数与结果条目数无关；发布先读原文，再按原文条件提交。

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::body::Body;
use axum::extract::rejection::JsonRejection;
use axum::extract::{ConnectInfo, DefaultBodyLimit, Json, Query, Request, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get, post};
use serde::Deserialize;

use crate::bff;
use crate::cli::AdminMode;
use crate::content_contract::{ContentSnapshot, TaxonomyFile};
use crate::content_service::{ContentService, ContentServiceError};
use crate::content_workspace::{ArticleDraft, WorkspaceError, WorkspaceStatus, WorkspaceView};
use crate::data_client::{DataCallError, DataClient};
use crate::github::ConfiguredRemote;
use crate::static_files::StaticFiles;
use crate::taxonomy_changes::AppliedTaxonomyChanges;
use product::auth::{
    AuthEvent, AuthEventKind, AuthOutcome, AuthReason, Clock, LoginOutcome, LoginVerification,
    OsRandomSource, ProductionAuthRuntime, RecoveryCode, SecretString, SystemClock,
    VerifiedRequestOrigin, clear_session_cookie, extract_session_cookie, safe_admin_next,
    session_cookie,
};
use protocol::envelope::codes;
use protocol::scene;
use protocol::wire::code;
use protocol::wire::{self, Envelope};
use protocol::{
    ArticleBrowseQuery, ArticleGetQuery, ArticleListPage, ArticleListQuery, ArticleTypeListQuery,
    Category, DataOperation, Tag, TermListQuery, has_more,
};

/// 入口绝对 deadline；Data 收到的是剩余预算（deadline 沿链路传播）。
pub const ENTRY_BUDGET: Duration = Duration::from_secs(5);
async fn record_share_attribution(
    state: &AppState,
    article_id: i64,
    token: &str,
    budget: Duration,
) {
    if token != format!("article-{article_id}") {
        crate::product_error!("share attribution rejected article_id={article_id}");
        return;
    }
    let Ok(created_at_epoch) = SystemTime::now().duration_since(UNIX_EPOCH) else {
        crate::product_error!("share attribution clock is before unix epoch");
        return;
    };
    let result = state
        .data
        .call(
            "mobile-share-attribution",
            &DataOperation::ShareAttributionRecord(protocol::ShareAttributionRecord {
                token: token.to_owned(),
                article_id,
                created_at_epoch: created_at_epoch.as_secs() as i64,
            }),
            budget,
        )
        .await;
    match result {
        Ok(_) => crate::product_info!("share attribution recorded article_id={article_id}"),
        Err(error) => crate::product_error!(
            "share attribution persistence failed article_id={article_id} error={error:?}"
        ),
    }
}

pub struct AppState {
    pub data: DataClient,
    pub content: ContentService<ConfiguredRemote>,
    pub bound_addr: String,
    pub web_dir: Option<std::path::PathBuf>,
    pub static_files: Option<StaticFiles>,
    pub started: Instant,
    pub auth: Arc<ProductionAuthRuntime>,
    pub admin: AdminMode,
}

pub fn router(state: Arc<AppState>) -> Router {
    let app = Router::new()
        .route("/healthz", get(healthz))
        // 公开
        .route(scene::PUBLIC_ARTICLES_ENDPOINT, any(public_articles))
        .route(
            scene::PUBLIC_ARTICLE_TYPES_ENDPOINT,
            any(public_article_types),
        )
        .route(scene::PUBLIC_TERMS_ENDPOINT, any(public_terms))
        .route(
            scene::PUBLIC_RECOMMENDATIONS_ENDPOINT,
            any(public_recommendations),
        )
        .route(
            scene::MOBILE_ARTICLE_SHELF_ENDPOINT,
            any(mobile_article_shelf),
        )
        .route(scene::T_SHELF_ENDPOINT, any(t_shelf))
        .route(scene::PUBLIC_TAXONOMY_ENDPOINT, any(public_taxonomy))
        .route(
            scene::MOBILE_CATEGORY_SHELF_ENDPOINT,
            any(mobile_category_shelf),
        )
        .route(scene::PUBLIC_SITE_ROUTES_ENDPOINT, any(public_site_routes))
        .route(scene::MOBILE_PAGE_ENDPOINT, any(mobile_page))
        // 管理
        .route(
            scene::ADMIN_SESSION_ENDPOINT,
            post(admin_session_create)
                .delete(admin_session_delete)
                .layer(DefaultBodyLimit::max(8 * 1024)),
        )
        .route(scene::ADMIN_ARTICLES_ENDPOINT, any(admin_articles))
        .route(
            scene::ADMIN_ARTICLE_TYPES_ENDPOINT,
            any(admin_article_types),
        )
        .route(scene::ADMIN_TERMS_ENDPOINT, any(admin_terms))
        .route(
            scene::ADMIN_RECOMMENDATIONS_ENDPOINT,
            any(admin_recommendations),
        )
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
        .route("/product/diagnostics", get(diagnostics))
        // MODE-004：`web/dist` 静态挂载（页面 + 静态资源 + `/api` 同源）。
        .fallback(fallback)
        .with_state(state.clone());
    app.layer(middleware::from_fn_with_state(state, admin_auth_gate))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AdminSessionLoginRequest {
    scene_code: String,
    password: SecretString,
    verification: AdminSessionVerification,
}

impl std::fmt::Debug for AdminSessionLoginRequest {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("AdminSessionLoginRequest")
            .field("scene_code", &self.scene_code)
            .field("password", &"[REDACTED]")
            .field("verification", &self.verification)
            .finish()
    }
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
enum AdminSessionVerification {
    Totp { code: SecretString },
    Recovery { code: SecretString },
}

impl std::fmt::Debug for AdminSessionVerification {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Totp { .. } => formatter.write_str("Totp([REDACTED])"),
            Self::Recovery { .. } => formatter.write_str("Recovery([REDACTED])"),
        }
    }
}

enum OwnedLoginVerification {
    Totp(SecretString),
    Recovery(RecoveryCode),
}

impl std::fmt::Debug for OwnedLoginVerification {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Totp(_) => formatter.write_str("Totp([REDACTED])"),
            Self::Recovery(_) => formatter.write_str("Recovery([REDACTED])"),
        }
    }
}

#[cfg(test)]
mod admin_session_secret_tests {
    use super::*;

    #[test]
    fn login_request_debug_redacts_password_and_factor_inputs() {
        for body in [
            r#"{"sceneCode":"admin.session.create","password":"password-marker","verification":{"kind":"totp","code":"123456"}}"#,
            r#"{"sceneCode":"admin.session.create","password":"password-marker","verification":{"kind":"recovery","code":"AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GG"}}"#,
        ] {
            let request: AdminSessionLoginRequest = serde_json::from_str(body).unwrap();
            let debug = format!("{request:?}");
            assert!(!debug.contains("password-marker"));
            assert!(!debug.contains("123456"));
            assert!(!debug.contains("AAAA-BBBB"));
            assert!(debug.contains("[REDACTED]"));
        }
    }
}

async fn admin_session_create(
    State(state): State<Arc<AppState>>,
    connect_info: ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    payload: Result<Json<AdminSessionLoginRequest>, JsonRejection>,
) -> Response {
    let origin = verified_request_origin(&state.auth, &headers, Some(connect_info));
    let Json(payload) = match payload {
        Ok(payload) => payload,
        Err(rejection) => {
            let status = if rejection.status() == StatusCode::PAYLOAD_TOO_LARGE {
                StatusCode::PAYLOAD_TOO_LARGE
            } else {
                StatusCode::BAD_REQUEST
            };
            return auth_failure(code::INVALID_JSON, "invalid admin session request", status);
        }
    };
    let AdminSessionLoginRequest {
        scene_code,
        password,
        verification,
    } = payload;
    if !scene::supports(
        Method::POST.as_str(),
        scene::ADMIN_SESSION_ENDPOINT,
        &scene_code,
    ) {
        return unknown_scene_code();
    }
    let Some(engine) = state.auth.engine().cloned() else {
        log_auth_event(
            AuthEventKind::Login,
            AuthOutcome::Unavailable,
            AuthReason::MissingConfiguration,
            Some(origin.client_ip()),
        );
        return auth_failure(
            code::ADMIN_AUTH_UNAVAILABLE,
            "admin authentication is unavailable",
            StatusCode::SERVICE_UNAVAILABLE,
        );
    };
    let verification = match verification {
        AdminSessionVerification::Totp { code } => OwnedLoginVerification::Totp(code),
        AdminSessionVerification::Recovery { code } => {
            // A malformed code follows the same Argon2 and recovery-file scan path.
            let code = RecoveryCode::parse_secret(code).unwrap_or_else(|| {
                RecoveryCode::parse_secret(SecretString::new("AAAAAAAAAAAAAAAAAAAAAAAAAA"))
                    .expect("fixed recovery placeholder is valid")
            });
            OwnedLoginVerification::Recovery(code)
        }
    };
    let ip = origin.client_ip();
    let now = SystemClock.unix_seconds();
    let decision = tokio::task::spawn_blocking(move || {
        let mut random = OsRandomSource;
        let verification = match &verification {
            OwnedLoginVerification::Totp(code) => LoginVerification::Totp(code.expose()),
            OwnedLoginVerification::Recovery(code) => LoginVerification::Recovery(code),
        };
        engine.login(ip, &password, verification, now, &mut random)
    })
    .await;
    match decision {
        Ok(Ok(LoginOutcome::Authenticated(token))) => {
            log_auth_event(
                AuthEventKind::Login,
                AuthOutcome::Success,
                AuthReason::None,
                Some(ip),
            );
            let Ok(max_age_seconds) = state
                .auth
                .engine()
                .expect("configured engine remains available")
                .session_ttl_seconds()
            else {
                return auth_failure(
                    code::ADMIN_AUTH_UNAVAILABLE,
                    "admin authentication is unavailable",
                    StatusCode::SERVICE_UNAVAILABLE,
                );
            };
            let Some(cookie) = session_cookie(token.expose(), origin, max_age_seconds) else {
                return auth_failure(
                    code::ADMIN_AUTH_UNAVAILABLE,
                    "admin authentication is unavailable",
                    StatusCode::SERVICE_UNAVAILABLE,
                );
            };
            auth_ok_with_cookie(cookie)
        }
        Ok(Ok(LoginOutcome::Invalid)) => {
            log_auth_event(
                AuthEventKind::Login,
                AuthOutcome::Denied,
                AuthReason::InvalidCredentials,
                Some(ip),
            );
            auth_failure(
                code::ADMIN_AUTH_INVALID,
                "invalid admin credentials",
                StatusCode::UNAUTHORIZED,
            )
        }
        Ok(Ok(LoginOutcome::RateLimited {
            retry_after_seconds,
        })) => {
            log_auth_event(
                AuthEventKind::RateLimit,
                AuthOutcome::Denied,
                AuthReason::Cooldown,
                Some(ip),
            );
            auth_failure_with_retry_after(retry_after_seconds)
        }
        Ok(Err(_)) | Err(_) => {
            log_auth_event(
                AuthEventKind::Login,
                AuthOutcome::Unavailable,
                AuthReason::PersistenceFailure,
                Some(ip),
            );
            auth_failure(
                code::ADMIN_AUTH_UNAVAILABLE,
                "admin authentication is unavailable",
                StatusCode::SERVICE_UNAVAILABLE,
            )
        }
    }
}

async fn admin_session_delete(
    State(state): State<Arc<AppState>>,
    connect_info: ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if !scene::supports(
        Method::DELETE.as_str(),
        scene::ADMIN_SESSION_ENDPOINT,
        params
            .get("sceneCode")
            .map(String::as_str)
            .unwrap_or_default(),
    ) {
        return unknown_scene_code();
    }
    let origin = verified_request_origin(&state.auth, &headers, Some(connect_info));
    if let (Some(engine), Some(token)) = (
        state.auth.engine(),
        headers
            .get(header::COOKIE)
            .and_then(|value| value.to_str().ok())
            .and_then(extract_session_cookie),
    ) {
        let _ = engine.logout(token);
    }
    log_auth_event(
        AuthEventKind::Logout,
        AuthOutcome::Success,
        AuthReason::None,
        Some(origin.client_ip()),
    );
    auth_ok_with_cookie(clear_session_cookie(origin))
}

async fn admin_auth_gate(
    State(state): State<Arc<AppState>>,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path();
    let admin_surface =
        path == "/admin" || path.starts_with("/admin/") || path.starts_with("/api/admin/");
    match state.admin {
        AdminMode::Off if admin_surface => return admin_not_found(),
        AdminMode::Bypass => return next.run(request).await,
        AdminMode::Off | AdminMode::On => {}
    }
    let protected_api = path.starts_with("/api/admin/") && path != scene::ADMIN_SESSION_ENDPOINT;
    let protected_page =
        (path == "/admin" || path.starts_with("/admin/")) && path != "/admin/login.html";
    if !protected_api && !protected_page {
        return next.run(request).await;
    }

    let origin = verified_request_origin_from_request(&state.auth, &request);
    let Some(engine) = state.auth.engine() else {
        return if protected_page {
            admin_login_redirect(request.uri())
        } else {
            auth_failure(
                code::ADMIN_AUTH_UNAVAILABLE,
                "admin authentication is unavailable",
                StatusCode::SERVICE_UNAVAILABLE,
            )
        };
    };
    let token = request
        .headers()
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(extract_session_cookie);
    let authentication = match token {
        Some(token) => match engine.authenticate_session(token, SystemClock.unix_seconds()) {
            Ok(Some(authentication)) => Some((token.to_owned(), authentication)),
            Ok(None) => None,
            Err(_) => {
                return auth_failure(
                    code::ADMIN_AUTH_UNAVAILABLE,
                    "admin authentication is unavailable",
                    StatusCode::SERVICE_UNAVAILABLE,
                );
            }
        },
        None => None,
    };
    let Some((token, authentication)) = authentication else {
        return if protected_page {
            admin_login_redirect(request.uri())
        } else {
            auth_failure(
                code::ADMIN_AUTH_REQUIRED,
                "admin authentication is required",
                StatusCode::UNAUTHORIZED,
            )
        };
    };

    let mut response = next.run(request).await;
    if let Some(cookie) = session_cookie(&token, origin, authentication.refresh_max_age_seconds)
        && let Ok(value) = HeaderValue::from_str(&cookie)
    {
        response.headers_mut().append(header::SET_COOKIE, value);
    }
    response
}

fn admin_not_found() -> Response {
    (
        StatusCode::NOT_FOUND,
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        "404 page not found\n",
    )
        .into_response()
}

fn verified_request_origin_from_request(
    auth: &ProductionAuthRuntime,
    request: &Request,
) -> VerifiedRequestOrigin {
    let connect_info = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .copied();
    verified_request_origin(auth, request.headers(), connect_info)
}

fn verified_request_origin(
    auth: &ProductionAuthRuntime,
    headers: &HeaderMap,
    connect_info: Option<ConnectInfo<SocketAddr>>,
) -> VerifiedRequestOrigin {
    let peer_ip = connect_info
        .map(|ConnectInfo(address)| address.ip())
        .unwrap_or(IpAddr::V4(std::net::Ipv4Addr::LOCALHOST));
    if !auth.is_trusted_proxy(peer_ip) {
        return VerifiedRequestOrigin::direct(peer_ip, false);
    }
    let forwarded_ip = single_header(headers, "x-forwarded-for")
        .filter(|value| !value.contains(','))
        .and_then(|value| value.trim().parse::<IpAddr>().ok());
    let forwarded_secure = match single_header(headers, "x-forwarded-proto") {
        Some("https") => Some(true),
        Some("http") => Some(false),
        _ => None,
    };
    match (forwarded_ip, forwarded_secure) {
        (Some(ip), Some(secure)) => VerifiedRequestOrigin::from_trusted_proxy(ip, secure),
        _ => VerifiedRequestOrigin::direct(peer_ip, false),
    }
}

fn single_header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    let mut values = headers.get_all(name).iter();
    let value = values.next()?.to_str().ok()?;
    values.next().is_none().then_some(value)
}

fn admin_login_redirect(uri: &axum::http::Uri) -> Response {
    let original = uri
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or(uri.path());
    let location = safe_admin_next(original)
        .map(|next| format!("/admin/login.html?next={next}"))
        .unwrap_or_else(|| "/admin/login.html".to_owned());
    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, location)
        .body(Body::empty())
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

fn auth_failure(code: &str, message: &str, status: StatusCode) -> Response {
    envelope(
        &Envelope::<serde_json::Value>::failure(code, message),
        status,
    )
}

fn auth_failure_with_retry_after(retry_after_seconds: u64) -> Response {
    let mut response = auth_failure(
        code::ADMIN_AUTH_RATE_LIMITED,
        "admin authentication is temporarily rate limited",
        StatusCode::TOO_MANY_REQUESTS,
    );
    if let Ok(value) = HeaderValue::from_str(&retry_after_seconds.to_string()) {
        response.headers_mut().insert(header::RETRY_AFTER, value);
    }
    response
}

fn auth_ok_with_cookie(cookie: String) -> Response {
    let mut response = envelope(&Envelope::ok(serde_json::Value::Null), StatusCode::OK);
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        response.headers_mut().append(header::SET_COOKIE, value);
    }
    response
}

fn log_auth_event(
    kind: AuthEventKind,
    outcome: AuthOutcome,
    reason: AuthReason,
    client_ip: Option<IpAddr>,
) {
    crate::product_info!(
        "{}",
        AuthEvent {
            kind,
            outcome,
            reason,
            client_ip,
        }
    );
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
    let accept_encoding = request
        .headers()
        .get(header::ACCEPT_ENCODING)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    match &state.static_files {
        Some(files) => {
            files
                .serve(&method, &path, accept_encoding.as_deref())
                .await
        }
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
    let scene_code = params.get("sceneCode").map(String::as_str);
    if !scene::supports(
        method.as_str(),
        scene::PUBLIC_ARTICLES_ENDPOINT,
        scene_code.unwrap_or_default(),
    ) {
        return unknown_scene_code();
    }
    match scene_code {
        Some(scene::ARTICLE_LIST) | Some(scene::ARTICLE_SEARCH) => {
            article_list_handler(&state, &params, true).await
        }
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

/// 页面级 Mobile BFF：一次请求聚合导航模块和页面模块。
async fn mobile_page(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if !scene::supports(
        method.as_str(),
        scene::MOBILE_PAGE_ENDPOINT,
        params
            .get("sceneCode")
            .map(String::as_str)
            .unwrap_or_default(),
    ) {
        return unknown_scene_code();
    }
    let page = params.get("page").map(String::as_str).unwrap_or_default();
    let started = Instant::now();
    let article_id = parse_i64(params.get("id"));
    if let (Some(id), Some(token)) = (article_id, params.get("share")) {
        record_share_attribution(
            &state,
            id,
            token,
            ENTRY_BUDGET.saturating_sub(started.elapsed()),
        )
        .await;
    }
    let mut modules = vec![serde_json::json!({
        "moduleKey": "mobile.navigation",
        "data": {
            "leftIcons": if page == "article-detail" { vec!["back"] } else { Vec::<&str>::new() },
            "rightIcons": if page == "article-detail" {
                vec!["favorite", "share", "more"]
            } else {
                vec!["search", "more"]
            },
            "shareUrl": article_id.map(|id| format!("/m/articles/detail.html?id={id}&share=article-{id}")),
        }
    })];
    if page == "article-detail" {
        let Some(id) = article_id else {
            return invalid_id();
        };
        let result = state
            .data
            .call(
                &request_id("mobile-page-article"),
                &DataOperation::ArticleGet(ArticleGetQuery {
                    id,
                    published_only: true,
                }),
                ENTRY_BUDGET,
            )
            .await;
        match result {
            Ok(trace) => match trace.outcome {
                protocol::DataOutcome::ArticleDetail(detail) => modules.push(serde_json::json!({
                    "moduleKey": "mobile.article-detail",
                    "data": wire::to_detail(&detail),
                })),
                _ => crate::product_error!(
                    "mobile page module omitted page=article-detail reason=unexpected_payload"
                ),
            },
            Err(error) => crate::product_error!(
                "mobile page module omitted page=article-detail error={error:?}"
            ),
        }
    } else if page == "home" {
        let plan = match bff::t_shelf::plan(
            params.get("surface").map(String::as_str),
            params.get("filter_id").map(String::as_str),
        ) {
            Ok(plan) => plan,
            Err(failure) => return data_failure(&DataCallError::Failure(failure), "mobile_page"),
        };
        let mut outcomes = Vec::with_capacity(plan.operations.len());
        for (index, operation) in plan.operations.iter().enumerate() {
            let remaining = ENTRY_BUDGET.saturating_sub(started.elapsed());
            let result = state
                .data
                .call(
                    &request_id(&format!("mobile-page-home-{index}")),
                    operation,
                    remaining,
                )
                .await;
            match result {
                Ok(trace) => outcomes.push(trace.outcome),
                Err(error) => {
                    crate::product_error!("mobile page module omitted page=home error={error:?}");
                    outcomes.clear();
                    break;
                }
            }
        }
        match bff::t_shelf::assemble(&plan, protocol::wire::ArticleCardSurface::Mobile, outcomes) {
            Ok(value) => {
                modules.push(serde_json::json!({ "moduleKey": "mobile.t-shelf", "data": value }))
            }
            Err(failure) => {
                crate::product_error!("mobile page module omitted page=home error={failure:?}")
            }
        }
    } else if page == "articles" || page == "article-list" {
        let snapshot = match loaded_content_snapshot(&state, scene::MOBILE_PAGE).await {
            Ok(value) => value,
            Err(_response) => {
                crate::product_error!(
                    "mobile page module omitted page={page} reason=content_snapshot"
                );
                return envelope(
                    &Envelope::ok(serde_json::json!({ "modules": modules })),
                    StatusCode::OK,
                );
            }
        };
        let selected = match params.get("category_id") {
            Some(value) => match value.parse::<i64>() {
                Ok(id) if id > 0 => Some(id),
                _ => return invalid_payload("category_id must be a positive integer".into()),
            },
            None => None,
        };
        let shelf = match bff::category_shelf::assemble(&snapshot, selected) {
            Ok(value) => value,
            Err(error) => {
                crate::product_error!("mobile page module omitted page={page} error={error}");
                return envelope(
                    &Envelope::ok(serde_json::json!({ "modules": modules })),
                    StatusCode::OK,
                );
            }
        };
        let articles: Vec<_> = shelf
            .articles
            .iter()
            .map(|article| mobile_article_card_json(article))
            .collect();
        modules.push(serde_json::json!({
            "moduleKey": "mobile.category-shelf",
            "data": {
                "taxonomy": taxonomy_json(&snapshot.taxonomy),
                "selectedCategoryId": shelf.selected_category_id,
                "articles": articles,
                "total": articles.len()
            }
        }));
    } else if page == "settings" {
        modules.push(serde_json::json!({ "moduleKey": "mobile.settings", "data": {} }));
    }
    envelope(
        &Envelope::ok(serde_json::json!({ "modules": modules })),
        StatusCode::OK,
    )
}

async fn public_article_types(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if !scene::supports(
        method.as_str(),
        scene::PUBLIC_ARTICLE_TYPES_ENDPOINT,
        params
            .get("sceneCode")
            .map(String::as_str)
            .unwrap_or_default(),
    ) {
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
    if !scene::supports(
        method.as_str(),
        scene::PUBLIC_TERMS_ENDPOINT,
        params
            .get("sceneCode")
            .map(String::as_str)
            .unwrap_or_default(),
    ) {
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
    if !scene::supports(
        method.as_str(),
        scene::PUBLIC_RECOMMENDATIONS_ENDPOINT,
        params
            .get("sceneCode")
            .map(String::as_str)
            .unwrap_or_default(),
    ) {
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
    if !scene::supports(
        method.as_str(),
        scene::MOBILE_ARTICLE_SHELF_ENDPOINT,
        params
            .get("sceneCode")
            .map(String::as_str)
            .unwrap_or_default(),
    ) {
        return unknown_scene_code();
    }
    let plan = bff::mobile_shelf::plan(bff::mobile_shelf::MobileShelfRequest {
        article_type_id: parse_i64(params.get("type_id")),
        term_ids: parse_id_list(params.get("term_ids")),
        created_from: non_empty(params.get("created_from")),
        created_to: non_empty(params.get("created_to")),
        updated_from: non_empty(params.get("updated_from")),
        updated_to: non_empty(params.get("updated_to")),
    });
    let has_filters = plan.has_filters;
    let started = Instant::now();
    let result = state
        .data
        .call(
            &request_id("shelf"),
            &DataOperation::ArticleShelf(plan.query),
            ENTRY_BUDGET,
        )
        .await;
    match result {
        Ok(trace) => {
            let protocol::DataOutcome::ArticleShelf(shelf) = trace.outcome else {
                return data_failure(&DataCallError::Unavailable(unexpected_payload().0), "shelf");
            };
            let body = bff::mobile_shelf::assemble(&shelf, has_filters);
            let item_count: usize = body
                .sections
                .iter()
                .map(|section| section.articles.len())
                .sum();
            crate::product_info!(
                "GET /api/public/mobile/article-shelf scene={} items={} sections={} data_calls=1 data_queries={} data_elapsed_ms={} elapsed_ms={}",
                scene::MOBILE_ARTICLE_SHELF,
                item_count,
                body.sections.len(),
                trace.query_count.unwrap_or_default(),
                trace.elapsed.as_millis(),
                started.elapsed().as_millis()
            );
            envelope(&Envelope::ok(body), StatusCode::OK)
        }
        Err(error) => data_failure(&error, "shelf"),
    }
}

/// 公开端 T 型货架的 HTTP 适配：参数解析后把 surface / filter 编排交给 BFF。
async fn t_shelf(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if !scene::supports(
        method.as_str(),
        scene::T_SHELF_ENDPOINT,
        params
            .get("sceneCode")
            .map(String::as_str)
            .unwrap_or_default(),
    ) {
        return unknown_scene_code();
    }
    let plan = match bff::t_shelf::plan(
        params.get("surface").map(String::as_str),
        params.get("filter_id").map(String::as_str),
    ) {
        Ok(plan) => plan,
        Err(failure) => {
            return data_failure(&DataCallError::Failure(failure), "t_shelf");
        }
    };
    let started = Instant::now();
    let mut outcomes = Vec::with_capacity(plan.operations.len());
    let mut query_count = 0_u32;
    let mut data_elapsed = Duration::ZERO;
    for (index, operation) in plan.operations.iter().enumerate() {
        let remaining = ENTRY_BUDGET.saturating_sub(started.elapsed());
        if remaining.is_zero() {
            return data_failure(&DataCallError::DeadlineExceeded, "t_shelf");
        }
        let result = state
            .data
            .call(
                &request_id(&format!("t-shelf-{index}")),
                operation,
                remaining,
            )
            .await;
        match result {
            Ok(trace) => {
                query_count += trace.query_count.unwrap_or_default();
                data_elapsed += trace.elapsed;
                outcomes.push(trace.outcome);
            }
            Err(error) => return data_failure(&error, "t_shelf"),
        }
    }
    match bff::t_shelf::assemble(&plan, protocol::wire::ArticleCardSurface::Desktop, outcomes) {
        Ok(body) => {
            crate::product_info!(
                "GET /api/public/t-shelf scene={} items={} total={} data_calls={} data_queries={} data_elapsed_ms={} elapsed_ms={}",
                scene::T_SHELF,
                body.articles.len(),
                body.total,
                plan.operations.len(),
                query_count,
                data_elapsed.as_millis(),
                started.elapsed().as_millis()
            );
            envelope(&Envelope::ok(body), StatusCode::OK)
        }
        Err(failure) => data_failure(&DataCallError::Failure(failure), "t_shelf"),
    }
}

// ---------- 文章（公开 + 管理共用实现） ----------

fn article_list_handler(
    state: &Arc<AppState>,
    params: &HashMap<String, String>,
    published_only: bool,
) -> impl std::future::Future<Output = Response> + Send {
    let query = ArticleListQuery {
        search: non_empty(params.get("q")),
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

/// Mobile 平铺页浏览：type/topic/tag 三个
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
}

async fn admin_articles(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    match method {
        Method::GET => {
            let scene_code = params.get("sceneCode").map(String::as_str);
            if !scene::supports(
                method.as_str(),
                scene::ADMIN_ARTICLES_ENDPOINT,
                scene_code.unwrap_or_default(),
            ) {
                return unknown_scene_code();
            }
            match scene_code {
                Some(scene::ADMIN_ARTICLE_LIST) => {
                    article_list_handler(&state, &params, false).await
                }
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
            }
        }
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
            if !scene::supports(
                "POST",
                scene::ADMIN_ARTICLES_ENDPOINT,
                payload.scene_code.as_deref().unwrap_or_default(),
            ) {
                return unknown_scene_code();
            }
            retired_content_write()
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NameBody {
    #[serde(default)]
    scene_code: Option<String>,
}

async fn admin_article_types(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    match method {
        Method::GET => {
            if !scene::supports(
                method.as_str(),
                scene::ADMIN_ARTICLE_TYPES_ENDPOINT,
                params
                    .get("sceneCode")
                    .map(String::as_str)
                    .unwrap_or_default(),
            ) {
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
            if !scene::supports(
                method.as_str(),
                scene::ADMIN_ARTICLE_TYPES_ENDPOINT,
                payload.scene_code.as_deref().unwrap_or_default(),
            ) {
                return unknown_scene_code();
            }
            retired_content_write()
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
}

async fn admin_terms(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    match method {
        Method::GET => {
            if !scene::supports(
                method.as_str(),
                scene::ADMIN_TERMS_ENDPOINT,
                params
                    .get("sceneCode")
                    .map(String::as_str)
                    .unwrap_or_default(),
            ) {
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
            if !scene::supports(
                method.as_str(),
                scene::ADMIN_TERMS_ENDPOINT,
                payload.scene_code.as_deref().unwrap_or_default(),
            ) {
                return unknown_scene_code();
            }
            retired_content_write()
        }
        // Go 参考实现：非 GET/POST 的 term 请求按 UNKNOWN_SCENE_CODE 处理。
        _ => unknown_scene_code(),
    }
}

async fn admin_recommendations(
    State(_state): State<Arc<AppState>>,
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
    if !scene::supports(
        method.as_str(),
        scene::ADMIN_RECOMMENDATIONS_ENDPOINT,
        payload.scene_code.as_deref().unwrap_or_default(),
    ) {
        return unknown_scene_code();
    }
    retired_content_write()
}

async fn loaded_content_snapshot(
    state: &Arc<AppState>,
    scene_code: &str,
) -> Result<ContentSnapshot, Box<Response>> {
    match state
        .data
        .call(
            &request_id(scene_code),
            &DataOperation::ContentSnapshotGet,
            ENTRY_BUDGET,
        )
        .await
    {
        Ok(trace) => match trace.outcome {
            protocol::DataOutcome::ContentSnapshot(Some(stored)) => Ok(stored.snapshot),
            protocol::DataOutcome::ContentSnapshot(None) => Ok(ContentSnapshot::default()),
            _ => Err(Box::new(data_failure(
                &DataCallError::Unavailable(unexpected_payload().0),
                scene_code,
            ))),
        },
        Err(error) => Err(Box::new(data_failure(&error, scene_code))),
    }
}

async fn public_taxonomy(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if method != Method::GET {
        return method_not_allowed();
    }
    if !scene::supports(
        "GET",
        scene::PUBLIC_TAXONOMY_ENDPOINT,
        params.get("sceneCode").map_or("", String::as_str),
    ) {
        return unknown_scene_code();
    }
    match loaded_content_snapshot(&state, scene::TAXONOMY_TREE).await {
        Ok(snapshot) => envelope(
            &Envelope::ok(taxonomy_json(&snapshot.taxonomy)),
            StatusCode::OK,
        ),
        Err(response) => *response,
    }
}

/// 页面路由清单：导航值由后端统一下发，前端不持有 URL 字面量。
async fn public_site_routes(
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if method != Method::GET {
        return method_not_allowed();
    }
    if !scene::supports(
        "GET",
        scene::PUBLIC_SITE_ROUTES_ENDPOINT,
        params.get("sceneCode").map_or("", String::as_str),
    ) {
        return unknown_scene_code();
    }
    match protocol::site_routes::site_routes_payload() {
        Ok(payload) => envelope(&Envelope::ok(payload), StatusCode::OK),
        Err(error) => {
            crate::product_error!("site routes manifest error={error}");
            envelope(
                &Envelope::<serde_json::Value>::failure(
                    code::INTERNAL_ERROR,
                    "site routes unavailable",
                ),
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        }
    }
}

async fn mobile_category_shelf(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if method != Method::GET {
        return method_not_allowed();
    }
    if !scene::supports(
        "GET",
        scene::MOBILE_CATEGORY_SHELF_ENDPOINT,
        params.get("sceneCode").map_or("", String::as_str),
    ) {
        return unknown_scene_code();
    }
    let snapshot = match loaded_content_snapshot(&state, scene::MOBILE_CATEGORY_SHELF).await {
        Ok(value) => value,
        Err(response) => return *response,
    };
    let selected = match params.get("category_id") {
        Some(value) => match value.parse::<i64>() {
            Ok(id) if id > 0 => Some(id),
            _ => return invalid_payload("category_id must be a positive integer".into()),
        },
        None => None,
    };
    let shelf = match bff::category_shelf::assemble(&snapshot, selected) {
        Ok(value) => value,
        Err(error) => return invalid_payload(error),
    };
    let articles: Vec<_> = shelf
        .articles
        .iter()
        .map(|article| mobile_article_card_json(article))
        .collect();
    let payload = serde_json::json!({ "taxonomy": taxonomy_json(&snapshot.taxonomy), "selectedCategoryId": shelf.selected_category_id, "articles": articles, "total": articles.len() });
    envelope(&Envelope::ok(payload), StatusCode::OK)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WireTaxonomy {
    version: u32,
    next_category_id: i64,
    next_tag_id: i64,
    categories: Vec<WireCategory>,
    tags: Vec<WireTag>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WireCategory {
    id: i64,
    name: String,
    parent_id: Option<i64>,
    position: i32,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct WireTag {
    id: i64,
    name: String,
}
impl From<WireTaxonomy> for TaxonomyFile {
    fn from(value: WireTaxonomy) -> Self {
        Self {
            version: value.version,
            next_category_id: value.next_category_id,
            next_tag_id: value.next_tag_id,
            categories: value
                .categories
                .into_iter()
                .map(|v| Category {
                    id: v.id,
                    name: v.name,
                    parent_id: v.parent_id,
                    position: v.position,
                })
                .collect(),
            tags: value
                .tags
                .into_iter()
                .map(|v| Tag {
                    id: v.id,
                    name: v.name,
                })
                .collect(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TaxonomySaveBody {
    #[serde(default)]
    scene_code: Option<String>,
    expected_version: u64,
    taxonomy: WireTaxonomy,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TaxonomyAnalyzeBody {
    #[serde(default)]
    scene_code: Option<String>,
    expected_version: u64,
    article_ids: Vec<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VersionBody {
    #[serde(default)]
    scene_code: Option<String>,
    expected_version: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WorkspaceArticleInput {
    #[serde(default)]
    id: Option<i64>,
    title: String,
    summary: String,
    category_ids: Vec<i64>,
    tag_ids: Vec<i64>,
    content_html: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WorkspaceArticleSaveBody {
    #[serde(default)]
    scene_code: Option<String>,
    expected_version: u64,
    article: WorkspaceArticleInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WorkspaceArticleRemoveBody {
    #[serde(default)]
    scene_code: Option<String>,
    expected_version: u64,
    article_id: i64,
}

async fn admin_content_workspace(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if method != Method::GET {
        return method_not_allowed();
    }
    if !scene::supports(
        "GET",
        scene::ADMIN_CONTENT_WORKSPACE_ENDPOINT,
        params.get("sceneCode").map_or("", String::as_str),
    ) {
        return unknown_scene_code();
    }
    envelope(
        &Envelope::ok(workspace_json(&state.content.view())),
        StatusCode::OK,
    )
}

async fn admin_content_articles(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    if method == Method::GET {
        let scene_code = params.get("sceneCode").map_or("", String::as_str);
        let view = state.content.view();
        if scene::supports("GET", scene::ADMIN_CONTENT_ARTICLES_ENDPOINT, scene_code)
            && scene_code == scene::ADMIN_CONTENT_ARTICLE_LIST
        {
            let articles = view
                .snapshot
                .articles
                .iter()
                .map(content_article_json)
                .collect::<Vec<_>>();
            return envelope(
                &Envelope::ok(serde_json::json!({
                    "version": view.version,
                    "articles": articles,
                })),
                StatusCode::OK,
            );
        }
        if scene::supports("GET", scene::ADMIN_CONTENT_ARTICLES_ENDPOINT, scene_code)
            && scene_code == scene::ADMIN_CONTENT_ARTICLE_DETAIL
        {
            let Some(id) = params.get("id").and_then(|value| value.parse::<i64>().ok()) else {
                return invalid_id();
            };
            let Some(article) = view
                .snapshot
                .articles
                .iter()
                .find(|article| article.meta.id == id)
            else {
                return workspace_failure(WorkspaceError::ArticleNotFound(id));
            };
            return envelope(
                &Envelope::ok(serde_json::json!({
                    "version": view.version,
                    "article": content_article_json(article),
                })),
                StatusCode::OK,
            );
        }
        return unknown_scene_code();
    }
    if method != Method::POST {
        return method_not_allowed();
    }
    let payload: WorkspaceArticleSaveBody = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(error) => return invalid_payload(error.to_string()),
    };
    let scene_code = payload
        .scene_code
        .as_deref()
        .or_else(|| params.get("sceneCode").map(String::as_str))
        .unwrap_or_default();
    if !scene::supports("POST", scene::ADMIN_CONTENT_ARTICLES_ENDPOINT, scene_code) {
        return unknown_scene_code();
    }
    let article = payload.article;
    match state
        .content
        .save_article(
            payload.expected_version,
            ArticleDraft {
                id: article.id,
                title: article.title,
                summary: article.summary,
                category_ids: article.category_ids,
                tag_ids: article.tag_ids,
                content_html: article.content_html,
            },
        )
        .await
    {
        Ok((view, article)) => envelope(
            &Envelope::ok(serde_json::json!({
                "workspace": workspace_json(&view),
                "article": content_article_json(&article),
            })),
            StatusCode::OK,
        ),
        Err(error) => content_failure(error),
    }
}

async fn admin_content_article_remove(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    if method != Method::POST {
        return method_not_allowed();
    }
    let payload: WorkspaceArticleRemoveBody = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(error) => return invalid_payload(error.to_string()),
    };
    let scene_code = payload
        .scene_code
        .as_deref()
        .or_else(|| params.get("sceneCode").map(String::as_str))
        .unwrap_or_default();
    if !scene::supports(
        "POST",
        scene::ADMIN_CONTENT_ARTICLE_REMOVE_ENDPOINT,
        scene_code,
    ) {
        return unknown_scene_code();
    }
    match state
        .content
        .remove_article(payload.expected_version, payload.article_id)
        .await
    {
        Ok(view) => envelope(&Envelope::ok(workspace_json(&view)), StatusCode::OK),
        Err(error) => content_failure(error),
    }
}

async fn admin_content_taxonomy_save(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    if method != Method::POST {
        return method_not_allowed();
    }
    let body: TaxonomySaveBody = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(error) => return invalid_payload(error.to_string()),
    };
    let scene_code = body
        .scene_code
        .as_deref()
        .or_else(|| params.get("sceneCode").map(String::as_str))
        .unwrap_or_default();
    if !scene::supports("POST", scene::ADMIN_CONTENT_TAXONOMY_ENDPOINT, scene_code) {
        return unknown_scene_code();
    }
    match state
        .content
        .save_taxonomy(body.expected_version, body.taxonomy.into())
        .await
    {
        Ok(view) => envelope(&Envelope::ok(workspace_json(&view)), StatusCode::OK),
        Err(error) => content_failure(error),
    }
}

async fn admin_content_taxonomy_analyze(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    if method != Method::POST {
        return method_not_allowed();
    }
    let body: TaxonomyAnalyzeBody = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(error) => return invalid_payload(error.to_string()),
    };
    let scene_code = body
        .scene_code
        .as_deref()
        .or_else(|| params.get("sceneCode").map(String::as_str))
        .unwrap_or_default();
    if !scene::supports(
        "POST",
        scene::ADMIN_CONTENT_TAXONOMY_ANALYZE_ENDPOINT,
        scene_code,
    ) {
        return unknown_scene_code();
    }
    match state
        .content
        .analyze(body.expected_version, body.article_ids)
        .await
    {
        Ok(view) => envelope(&Envelope::ok(workspace_json(&view)), StatusCode::OK),
        Err(error) => content_failure(error),
    }
}

async fn admin_content_taxonomy_review(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    if method != Method::POST {
        return method_not_allowed();
    }
    let body: VersionBody = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(error) => return invalid_payload(error.to_string()),
    };
    let scene_code = body
        .scene_code
        .as_deref()
        .or_else(|| params.get("sceneCode").map(String::as_str))
        .unwrap_or_default();
    if !scene::supports(
        "POST",
        scene::ADMIN_CONTENT_TAXONOMY_REVIEW_ENDPOINT,
        scene_code,
    ) {
        return unknown_scene_code();
    }
    match state.content.review(body.expected_version).await {
        Ok(view) => envelope(&Envelope::ok(workspace_json(&view)), StatusCode::OK),
        Err(error) => content_failure(error),
    }
}

async fn admin_content_preview(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    if method != Method::GET {
        return method_not_allowed();
    }
    if !scene::supports(
        "GET",
        scene::ADMIN_CONTENT_PREVIEW_ENDPOINT,
        params.get("sceneCode").map_or("", String::as_str),
    ) {
        return unknown_scene_code();
    }
    let (version, snapshot, pending) = state.content.preview();
    let payload = pending
        .as_ref()
        .map(|applied| preview_json(version, &snapshot, applied))
        .unwrap_or_else(|| serde_json::json!({ "version": version, "taxonomy": taxonomy_json(&snapshot.taxonomy), "changedArticles": [], "diff": "", "warnings": [] }));
    envelope(&Envelope::ok(payload), StatusCode::OK)
}

async fn admin_content_submit(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    if method != Method::POST {
        return method_not_allowed();
    }
    let body: VersionBody = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(error) => return invalid_payload(error.to_string()),
    };
    let scene_code = body
        .scene_code
        .as_deref()
        .or_else(|| params.get("sceneCode").map(String::as_str))
        .unwrap_or_default();
    if !scene::supports("POST", scene::ADMIN_CONTENT_SUBMIT_ENDPOINT, scene_code) {
        return unknown_scene_code();
    }
    match state.content.submit(body.expected_version).await {
        Ok(view) => envelope(&Envelope::ok(workspace_json(&view)), StatusCode::OK),
        Err(error) => content_failure(error),
    }
}

async fn admin_content_abandon(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    if method != Method::POST {
        return method_not_allowed();
    }
    let body: VersionBody = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(error) => return invalid_payload(error.to_string()),
    };
    let scene_code = body
        .scene_code
        .as_deref()
        .or_else(|| params.get("sceneCode").map(String::as_str))
        .unwrap_or_default();
    if !scene::supports("POST", scene::ADMIN_CONTENT_ABANDON_ENDPOINT, scene_code) {
        return unknown_scene_code();
    }
    match state.content.abandon(body.expected_version).await {
        Ok(view) => envelope(&Envelope::ok(workspace_json(&view)), StatusCode::OK),
        Err(error) => content_failure(error),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SceneBody {
    #[serde(default)]
    scene_code: Option<String>,
}

async fn admin_content_sync(
    State(state): State<Arc<AppState>>,
    method: Method,
    Query(params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    if method == Method::GET {
        let scene_code = params.get("sceneCode").map_or("", String::as_str);
        if !scene::supports("GET", scene::ADMIN_CONTENT_SYNC_ENDPOINT, scene_code) {
            return unknown_scene_code();
        }
        return envelope(
            &Envelope::ok(sync_status_json(&state.content.sync_status())),
            StatusCode::OK,
        );
    }
    if method != Method::POST {
        return method_not_allowed();
    }
    let body: SceneBody = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(error) => return invalid_payload(error.to_string()),
    };
    let scene_code = body
        .scene_code
        .as_deref()
        .or_else(|| params.get("sceneCode").map(String::as_str))
        .unwrap_or_default();
    if !scene::supports("POST", scene::ADMIN_CONTENT_SYNC_ENDPOINT, scene_code) {
        return unknown_scene_code();
    }
    match state.content.synchronize().await {
        Ok(status) => envelope(&Envelope::ok(sync_status_json(&status)), StatusCode::OK),
        Err(error) => content_failure(error),
    }
}

fn taxonomy_json(value: &TaxonomyFile) -> serde_json::Value {
    serde_json::json!({ "version": value.version, "nextCategoryId": value.next_category_id, "nextTagId": value.next_tag_id, "categories": value.categories.iter().map(|v| serde_json::json!({"id":v.id,"name":v.name,"parentId":v.parent_id,"position":v.position})).collect::<Vec<_>>(), "tags": value.tags.iter().map(|v| serde_json::json!({"id":v.id,"name":v.name})).collect::<Vec<_>>() })
}
fn mobile_article_card_json(value: &protocol::ContentSnapshotArticle) -> serde_json::Value {
    serde_json::json!({ "id": value.meta.id, "href": protocol::site_routes::mobile_article_detail_href(value.meta.id), "title": value.meta.title, "summary": value.meta.summary, "categoryIds": value.meta.category_ids, "tagIds": value.meta.tag_ids, "updatedAt": value.meta.updated_at })
}
fn desktop_article_card_json(value: &protocol::ContentSnapshotArticle) -> serde_json::Value {
    serde_json::json!({ "id": value.meta.id, "href": protocol::site_routes::desktop_article_detail_href(value.meta.id), "title": value.meta.title, "summary": value.meta.summary, "categoryIds": value.meta.category_ids, "tagIds": value.meta.tag_ids, "updatedAt": value.meta.updated_at })
}
fn content_article_json(value: &protocol::ContentSnapshotArticle) -> serde_json::Value {
    serde_json::json!({
        "id": value.meta.id,
        "title": value.meta.title,
        "summary": value.meta.summary,
        "categoryIds": value.meta.category_ids,
        "tagIds": value.meta.tag_ids,
        "contentHtml": value.content_html,
        "createdAt": value.meta.created_at,
        "updatedAt": value.meta.updated_at,
        "publishedAt": value.meta.published_at,
    })
}
fn workspace_json(value: &WorkspaceView) -> serde_json::Value {
    let status = match value.status {
        WorkspaceStatus::Clean => "clean",
        WorkspaceStatus::Saved => "saved",
        WorkspaceStatus::Submitting => "submitting",
        WorkspaceStatus::Discarding => "discarding",
        WorkspaceStatus::Submitted => "submitted",
        WorkspaceStatus::SubmittedWithChanges => "submitted_with_changes",
        WorkspaceStatus::Failed => "failed",
    };
    serde_json::json!({ "version": value.version, "status": status, "taxonomy": taxonomy_json(&value.snapshot.taxonomy), "articles": value.snapshot.articles.iter().map(desktop_article_card_json).collect::<Vec<_>>(), "pullRequest": value.remote_batch.as_ref().map(|batch| serde_json::json!({"number":batch.pull_request,"branch":batch.branch,"commit":batch.commit})), "lastError": value.last_error })
}
fn preview_json(
    version: u64,
    current: &ContentSnapshot,
    applied: &AppliedTaxonomyChanges,
) -> serde_json::Value {
    let changed: Vec<i64> = applied
        .normalized_diff
        .articles
        .iter()
        .map(|article| article.article_id)
        .collect();
    let diff = serde_json::to_string_pretty(&applied.normalized_diff)
        .unwrap_or_else(|error| format!("normalized diff serialization failed: {error}"));
    serde_json::json!({ "version": version, "taxonomy": taxonomy_json(&applied.snapshot.taxonomy), "changedArticles": changed, "diff": diff, "warnings": applied.warnings, "normalizedDiff": applied.normalized_diff, "baseArticleCount": current.articles.len() })
}

fn sync_status_json(value: &crate::content_sync::SyncStatus) -> serde_json::Value {
    use crate::content_sync::SyncStatus;
    match value {
        SyncStatus::Idle => serde_json::json!({ "status": "idle" }),
        SyncStatus::Running { commit } => {
            serde_json::json!({ "status": "running", "commit": commit })
        }
        SyncStatus::Succeeded {
            commit,
            article_count,
        } => serde_json::json!({
            "status": "succeeded",
            "commit": commit,
            "articleCount": article_count,
        }),
        SyncStatus::Failed {
            commit,
            message,
            last_success_commit,
        } => serde_json::json!({
            "status": "failed",
            "commit": commit,
            "message": message,
            "lastSuccessCommit": last_success_commit,
        }),
    }
}
fn invalid_payload(message: String) -> Response {
    envelope(
        &Envelope::<serde_json::Value>::failure(codes::INVALID_PAYLOAD, message),
        StatusCode::BAD_REQUEST,
    )
}
fn retired_content_write() -> Response {
    envelope(
        &Envelope::<serde_json::Value>::failure(
            code::CONTENT_WRITE_RETIRED,
            "direct content writes are retired; use the versioned content workspace",
        ),
        StatusCode::GONE,
    )
}
fn workspace_failure(error: crate::content_workspace::WorkspaceError) -> Response {
    use crate::content_workspace::WorkspaceError;
    if let WorkspaceError::InvalidArticleHtml(inspection) = error {
        return envelope(
            &Envelope {
                code: codes::INVALID_ARTICLE_HTML.to_owned(),
                message: "article HTML failed article-html/v1 validation".to_owned(),
                data: Some(serde_json::json!({ "htmlInspection": inspection })),
            },
            StatusCode::UNPROCESSABLE_ENTITY,
        );
    }
    let (status, failure_code) = match &error {
        WorkspaceError::VersionConflict { .. } => {
            (StatusCode::CONFLICT, code::WORKSPACE_VERSION_CONFLICT)
        }
        WorkspaceError::Busy => (StatusCode::CONFLICT, code::WORKSPACE_BUSY),
        WorkspaceError::NoChanges => (StatusCode::CONFLICT, code::WORKSPACE_NO_CHANGES),
        WorkspaceError::ArticleNotFound(_) => (StatusCode::NOT_FOUND, code::CONTENT_NOT_FOUND),
        WorkspaceError::Invalid(_) => (StatusCode::UNPROCESSABLE_ENTITY, code::INVALID_TAXONOMY),
        WorkspaceError::InvalidArticleHtml(_) => unreachable!("handled above"),
        WorkspaceError::Remote(_) => (StatusCode::BAD_GATEWAY, code::CONTENT_REMOTE_ERROR),
    };
    envelope(
        &Envelope::<serde_json::Value>::failure(failure_code, error.to_string()),
        status,
    )
}

fn content_failure(error: ContentServiceError) -> Response {
    match error {
        ContentServiceError::Workspace(error) => workspace_failure(error),
        ContentServiceError::Invalid(message) => invalid_payload(message),
        ContentServiceError::NoPendingReview => {
            invalid_payload("no analyzed taxonomy changes are pending".to_owned())
        }
        ContentServiceError::PendingReviewRequired => envelope(
            &Envelope::<serde_json::Value>::failure(
                code::PENDING_REVIEW_REQUIRED,
                error.to_string(),
            ),
            StatusCode::CONFLICT,
        ),
        ContentServiceError::Model(_) => envelope(
            &Envelope::<serde_json::Value>::failure(code::TAXONOMY_MODEL_ERROR, error.to_string()),
            StatusCode::BAD_GATEWAY,
        ),
        ContentServiceError::Data(_) | ContentServiceError::FailClosed(_) => envelope(
            &Envelope::<serde_json::Value>::failure(
                code::CONTENT_PERSISTENCE_UNAVAILABLE,
                error.to_string(),
            ),
            StatusCode::SERVICE_UNAVAILABLE,
        ),
    }
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
                protocol::DataOutcome::ArticleDetail(detail)
                    if scene == scene::ARTICLE_DETAIL
                        && !article_html_core::inspect(&detail.content_html).valid =>
                {
                    return envelope(
                        &Envelope::<serde_json::Value>::failure(
                            code::ARTICLE_NOT_FOUND,
                            "article not found",
                        ),
                        StatusCode::NOT_FOUND,
                    );
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
