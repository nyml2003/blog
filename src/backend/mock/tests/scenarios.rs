//! 场景行为的进程级测试：每个场景至少覆盖一个列表端点和一个写端点。
//!
//! 行为定义（`WORKSTREAM-MOCK.md` 交付记录的场景 × 端点表）：
//!
//! - `empty`：空世界种子，所有读取都是合法空响应；写仍然生效（session 内可见）；
//! - `slow`：每个 `/api/*` 请求固定延迟 2000ms 后返回正常数据；`/healthz` 不延迟；
//! - `server-error`：每个 `/api/*` 请求 `500` envelope，**写不生效**；
//! - `malformed-response`：`200` + 截断 JSON body，**写仍生效**（协议层故障）。

mod common;

use std::time::Duration;

use common::*;

/// 时钟测量余量：跨进程计时（std::time::Instant vs 服务器侧 tokio timer）有毫秒级抖动。
const CELL: Duration = Duration::from_millis(100);

/// 场景行为表的「列表端点」列：公开文章列表。
fn fetch_public_list(port: u16) -> serde_json::Value {
    get(port, &public_list(100)).data()
}

#[test]
fn empty_scenario_returns_valid_empty_collections_on_every_read() {
    let mut server = Server::start(&["--listen", "127.0.0.1:0", "--scenario", "empty"]);
    let port = server.port;

    // 列表端点：空集合、零 total、合法分页字段。
    let list = fetch_public_list(port);
    assert_eq!(list["items"].as_array().unwrap().len(), 0);
    assert_eq!(list["total"], 0);
    assert_eq!(list["hasMore"], false);

    let response = get(
        port,
        "/api/public/article-types?sceneCode=public.article_type_list",
    );
    assert_eq!(
        assert_envelope(&response, "OK")["data"]
            .as_array()
            .unwrap()
            .len(),
        0
    );

    let response = get(port, "/api/public/terms?sceneCode=public.term_list");
    assert_eq!(response.data().as_array().unwrap().len(), 0);

    let response = get(
        port,
        "/api/public/recommendations?sceneCode=public.recommendation_current",
    );
    assert_eq!(response.data().as_array().unwrap().len(), 0);

    let response = get(
        port,
        "/api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf",
    );
    let shelf = response.data();
    assert_eq!(shelf["sections"].as_array().unwrap().len(), 0);
    assert_eq!(shelf["total"], 0);

    // 详情：空世界里一切都不存在（不报错，返回 404 envelope）。
    let response = get(
        port,
        "/api/public/articles?sceneCode=public.article_detail&id=1",
    );
    assert_eq!(response.status, 404);
    assert_envelope(&response, "ARTICLE_NOT_FOUND");

    // 写端点仍然生效：空世界里创建第一篇文章，id 从 1 开始。
    let response = post(
        port,
        "/api/admin/articles",
        &article_body(
            "admin.article_create",
            r#""title":"first in an empty world","summary":"","articleTypeId":1"#,
        ),
        Some("empty-session"),
    );
    assert_eq!(response.status, 200);
    assert_eq!(response.data()["id"], 1);
    assert_eq!(response.data()["status"], "draft");

    let response = get_with(port, &admin_list(), Some("empty-session"));
    assert_eq!(response.data()["total"], 1);

    let status = server.signal("-TERM");
    assert!(status.success());
}

#[test]
fn slow_scenario_delays_api_calls_but_not_readiness() {
    let mut server = Server::start(&["--listen", "127.0.0.1:0", "--scenario", "slow"]);
    let port = server.port;

    // 就绪探测不受延迟影响。
    let health = get(port, "/healthz");
    assert_eq!(health.status, 200);
    assert!(
        health.elapsed_ms < 1000,
        "healthz must not be delayed, took {}ms",
        health.elapsed_ms
    );

    // 业务请求固定延迟 2000ms 后返回正常数据。
    let started = std::time::Instant::now();
    let list = fetch_public_list(port);
    let elapsed = started.elapsed();
    assert_eq!(list["total"], 45, "slow still serves the normal seed");
    assert!(
        elapsed >= Duration::from_millis(mock::scenario::SLOW_DELAY_MS).saturating_sub(CELL),
        "slow must delay ~{}ms, took {elapsed:?}",
        mock::scenario::SLOW_DELAY_MS
    );
    assert!(
        elapsed < Duration::from_millis(5000),
        "slow must not over-delay, took {elapsed:?}"
    );

    // 写端点同样被延迟（场景对所有 /api 路由一致）。
    let started = std::time::Instant::now();
    let response = post(
        port,
        "/api/admin/recommendations",
        &article_body("admin.recommendation_generate", ""),
        Some("slow-session"),
    );
    assert_eq!(response.status, 200);
    assert!(
        started.elapsed() >= Duration::from_millis(mock::scenario::SLOW_DELAY_MS) - CELL,
        "writes are delayed by the same scenario delay"
    );

    let status = server.signal("-TERM");
    assert!(status.success());
}

#[test]
fn server_error_scenario_serves_a_stable_envelope_and_refuses_writes() {
    let mut server = Server::start(&["--listen", "127.0.0.1:0", "--scenario", "server-error"]);
    let port = server.port;

    // 读端点：500 + envelope（HTTP 语义与业务码都稳定）。
    let response = get(port, &public_list(100));
    assert_eq!(response.status, 500);
    assert_eq!(response.header("content-type"), Some("application/json"));
    let envelope = assert_envelope(&response, "INTERNAL_ERROR");
    assert_eq!(envelope["data"], serde_json::Value::Null);
    assert!(
        envelope["message"]
            .as_str()
            .unwrap()
            .contains("server-error")
    );

    // 所有业务端点一致（含管理写端点与未知 sceneCode）。
    for path in [
        "/api/public/article-types?sceneCode=public.article_type_list",
        "/api/public/terms?sceneCode=public.term_list",
        "/api/public/recommendations?sceneCode=public.recommendation_current",
        "/api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf",
        "/api/admin/articles?sceneCode=admin.article_list",
    ] {
        let response = get(port, path);
        assert_eq!(response.status, 500, "{path}");
        assert_envelope(&response, "INTERNAL_ERROR");
    }

    // 写端点：500，且**不触碰 session 状态**（gate 在业务逻辑之前短路）。
    let response = post(
        port,
        "/api/admin/articles",
        &article_body("admin.article_create", r#""title":"never stored""#),
        Some("doomed"),
    );
    assert_eq!(response.status, 500);
    assert_envelope(&response, "INTERNAL_ERROR");

    // 非业务端点不受影响：healthz 可用、诊断可见（故障注入的可观察出口）。
    assert_eq!(get(port, "/healthz").body, "ok\n");
    let diagnostics = get(port, "/mock/diagnostics").data();
    assert_eq!(diagnostics["scenario"], "server-error");
    assert_eq!(
        diagnostics["requests"]["writesAttempted"], 0,
        "the fault short-circuits before the store"
    );
    assert!(diagnostics["requests"]["faultsServed"].as_u64().unwrap() > 0);

    let status = server.signal("-TERM");
    assert!(status.success());
}

#[test]
fn malformed_response_scenario_breaks_the_protocol_but_stays_a_valid_http_response() {
    let mut server = Server::start(&[
        "--listen",
        "127.0.0.1:0",
        "--scenario",
        "malformed-response",
    ]);
    let port = server.port;

    // 与 default 场景的同一请求对比：截断后的 body 必须是合法 body 的前缀。
    let healthy = Server::start(&["--listen", "127.0.0.1:0", "--scenario", "default"]);
    let expected = get(healthy.port, &public_list(100));

    let response = get(port, &public_list(100));
    assert_eq!(response.status, 200, "协议层故障仍返回 200");
    assert_eq!(response.header("content-type"), Some("application/json"));
    assert!(
        expected.body.starts_with(&response.body),
        "truncated body must be a prefix of the valid body:\n got: {}\nwant prefix of: {}",
        response.body,
        expected.body
    );
    assert!(
        response.body.len() < expected.body.len(),
        "body must actually be truncated"
    );
    assert!(
        serde_json::from_str::<serde_json::Value>(&response.body).is_err(),
        "the frontend must observe a parse failure: {}",
        response.body
    );

    // 错误路径同样被破坏（前端无法读到任何 envelope）。
    let response = get(
        port,
        "/api/public/articles?sceneCode=public.article_detail&id=abc",
    );
    assert_eq!(response.status, 400);
    assert!(serde_json::from_str::<serde_json::Value>(&response.body).is_err());

    // 写仍生效：状态被修改，但客户端拿不到可解析的响应。
    let response = post(
        port,
        "/api/admin/articles",
        &article_body("admin.article_create", r#""title":"stored but unreadable""#),
        Some("malformed-session"),
    );
    assert_eq!(response.status, 200);
    assert!(serde_json::from_str::<serde_json::Value>(&response.body).is_err());

    let diagnostics = get(port, "/mock/diagnostics").data();
    assert_eq!(diagnostics["scenario"], "malformed-response");
    assert_eq!(diagnostics["requests"]["writesAttempted"], 1);
    assert!(diagnostics["requests"]["faultsServed"].as_u64().unwrap() > 0);

    // 诊断端点本身仍可解析（它不是业务响应，不经过场景注入）。
    assert_eq!(diagnostics["service"], "mock");

    let status = server.signal("-TERM");
    assert!(status.success());
    drop(healthy);
}
