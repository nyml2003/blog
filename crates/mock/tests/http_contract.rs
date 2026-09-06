//! `default` 场景的进程级契约测试：Mock 的响应面必须与
//! `crates/product` 的公开 + 管理路由同形（路径、`sceneCode`、envelope、领域错误码、
//! camelCase、分页形状），并且 session 状态按 `X-Blog-Mock-Session` 显式隔离。

mod common;

use common::*;

#[test]
fn default_scenario_serves_the_product_response_surface() {
    let mut server = Server::start(&["--listen", "127.0.0.1:0", "--scenario", "default"]);
    let port = server.port;

    // 日志契约：stdout 每行都带 [mock] 前缀。
    let startup = server.lines();
    assert!(!startup.is_empty());
    assert!(
        startup.iter().all(|line| line.starts_with("[mock]")),
        "every line carries the [mock] prefix: {startup:?}"
    );
    assert!(startup.iter().any(|line| line.contains("scenario=default")));
    assert!(
        startup
            .iter()
            .any(|line| line.contains("sessions=isolated"))
    );

    // healthz：非业务端点，text/plain。
    let response = get(port, "/healthz");
    assert_eq!(response.status, 200);
    assert_eq!(
        response.header("content-type"),
        Some("text/plain; charset=utf-8")
    );
    assert_eq!(response.body, "ok\n");

    // 公开文章列表：envelope + camelCase + 分页形状。
    let response = get(port, &public_list(4));
    assert_eq!(response.status, 200);
    assert_eq!(response.header("content-type"), Some("application/json"));
    let data = assert_envelope(&response, "OK")["data"].clone();
    assert_eq!(data["total"], 9, "seed: 9 published articles");
    assert_eq!(data["page"], 1);
    assert_eq!(data["pageSize"], 4);
    assert_eq!(data["hasMore"], true);
    assert_eq!(data["items"].as_array().unwrap().len(), 4);
    assert_eq!(data["items"][0]["id"], 12, "updated_at DESC, id DESC");
    assert!(
        data["items"][0].get("contentHtml").is_none(),
        "no body in lists"
    );
    assert_camel_case(&data["items"][0]);
    assert_eq!(data["items"][0]["terms"][0]["kind"], "tag");

    // page < 1 归一化为 1；越界页返回空页且 hasMore=false。
    let response = get(
        port,
        "/api/public/articles?sceneCode=public.article_list&page=0&pageSize=100",
    );
    assert_eq!(response.data()["page"], 1);
    assert_eq!(response.data()["hasMore"], false);

    // 公开详情：published 可见、draft 不泄露存在性（404 ARTICLE_NOT_FOUND）。
    let response = get(
        port,
        "/api/public/articles?sceneCode=public.article_detail&id=12",
    );
    assert_eq!(response.status, 200);
    let detail = assert_envelope(&response, "OK")["data"].clone();
    assert_eq!(detail["id"], 12);
    assert_eq!(detail["contentHtml"], "<p>runtime acceptance checklist</p>");
    assert_camel_case(&detail);

    let response = get(
        port,
        "/api/public/articles?sceneCode=public.article_detail&id=3",
    );
    assert_eq!(response.status, 404);
    assert_envelope(&response, "ARTICLE_NOT_FOUND");

    // 类型 / 术语 / 推荐。
    let response = get(
        port,
        "/api/public/article-types?sceneCode=public.article_type_list",
    );
    let types = assert_envelope(&response, "OK")["data"]
        .as_array()
        .unwrap()
        .clone();
    assert_eq!(types.len(), 3);
    assert_eq!(types[0]["name"], "Announcements", "sorted by name");
    assert!(types[0].get("createdAt").is_some());

    let response = get(port, "/api/public/terms?sceneCode=public.term_list");
    assert_eq!(response.data().as_array().unwrap().len(), 4);
    let response = get(
        port,
        "/api/public/terms?sceneCode=public.term_list&kind=tag",
    );
    let tags = response.data().as_array().unwrap().clone();
    assert_eq!(tags.len(), 2);
    assert!(tags.iter().all(|term| term["kind"] == "tag"));

    let response = get(
        port,
        "/api/public/recommendations?sceneCode=public.recommendation_current",
    );
    let recommendation = assert_envelope(&response, "OK")["data"]
        .as_array()
        .unwrap()
        .clone();
    assert_eq!(recommendation.len(), 6);
    assert_eq!(recommendation[0]["id"], 12);
    assert!(
        recommendation[0].get("contentHtml").is_some(),
        "detail projection"
    );

    // mobile shelf BFF：推荐 section 在前、空类型分区隐藏、卡片无正文。
    let response = get(
        port,
        "/api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf",
    );
    let shelf = assert_envelope(&response, "OK")["data"].clone();
    let sections = shelf["sections"].as_array().unwrap();
    assert_eq!(sections[0]["id"], "recommendation");
    assert_eq!(
        sections[0]["articles"].as_array().unwrap().len(),
        3,
        "max 3 cards"
    );
    assert!(sections[0]["articles"][0].get("contentHtml").is_none());
    let ids: Vec<&str> = sections
        .iter()
        .map(|section| section["id"].as_str().unwrap())
        .collect();
    assert_eq!(
        ids.len(),
        4,
        "recommendation + 3 non-empty type sections: {ids:?}"
    );
    assert_eq!(shelf["total"], 9, "the full filtered result, not a page");

    // 管理 GET：列表带 draft（{items,total} 形态），详情可见。
    let response = get(port, &admin_list());
    assert_eq!(response.status, 200);
    let admin = assert_envelope(&response, "OK")["data"].clone();
    assert_eq!(admin["total"], 12);
    assert_eq!(admin["items"].as_array().unwrap().len(), 12);
    assert!(
        admin.get("hasMore").is_none(),
        "admin list has no pagination fields"
    );

    let response = get(
        port,
        "/api/admin/articles?sceneCode=admin.article_detail&id=3",
    );
    assert_eq!(response.data()["status"], "draft");

    // 管理 taxonomy 读端点。
    let response = get(
        port,
        "/api/admin/article-types?sceneCode=admin.article_type_list",
    );
    assert_eq!(response.data().as_array().unwrap().len(), 3);
    let response = get(port, "/api/admin/terms?sceneCode=admin.term_list");
    assert_eq!(response.data().as_array().unwrap().len(), 4);

    // 未知路径（无静态挂载）→ 404 text/plain。
    let response = get(port, "/api/public/nope");
    assert_eq!(response.status, 404);
    assert_eq!(
        response.header("content-type"),
        Some("text/plain; charset=utf-8")
    );

    assert!(server.alive(), "mock must stay resident without a signal");
    let status = server.signal("-TERM");
    assert!(status.success(), "clean exit expected, got {status:?}");
}

#[test]
fn scene_method_and_payload_errors_match_the_product_surface() {
    let mut server = Server::start(&["--listen", "127.0.0.1:0"]);
    let port = server.port;

    // 未知 sceneCode。
    let response = get(port, "/api/public/articles?sceneCode=public.nope");
    assert_eq!(response.status, 400);
    assert_envelope(&response, "UNKNOWN_SCENE_CODE");

    // 非 GET 的公开文章请求 → 405；其他公开端点的非 GET → 400（与 Product 一致）。
    let response = post(
        port,
        "/api/public/articles?sceneCode=public.article_list",
        "{}",
        None,
    );
    assert_eq!(response.status, 405);
    assert_envelope(&response, "METHOD_NOT_ALLOWED");
    let response = post(
        port,
        "/api/public/recommendations?sceneCode=public.recommendation_current",
        "{}",
        None,
    );
    assert_eq!(response.status, 400);
    assert_envelope(&response, "UNKNOWN_SCENE_CODE");

    // id 非法 / 缺失。
    let response = get(
        port,
        "/api/public/articles?sceneCode=public.article_detail&id=abc",
    );
    assert_eq!(response.status, 400);
    assert_envelope(&response, "INVALID_ID");

    // 非法 JSON body。
    let response = post(port, "/api/admin/articles", "not-json", None);
    assert_eq!(response.status, 400);
    assert_envelope(&response, "INVALID_JSON");

    // 领域错误码：摘要超限 422、名称冲突 409、非法状态迁移 409。
    let long = "字".repeat(161);
    let response = post(
        port,
        "/api/admin/articles",
        &article_body(
            "admin.article_create",
            &format!(r#""title":"too long","summary":"{long}""#),
        ),
        None,
    );
    assert_eq!(response.status, 422);
    assert_envelope(&response, "INVALID_SUMMARY");

    let response = post(
        port,
        "/api/admin/article-types",
        &article_body("admin.article_type_create", r#""name":"Engineering""#),
        None,
    );
    assert_eq!(response.status, 409);
    assert_envelope(&response, "DUPLICATE_NAME");

    let response = post(
        port,
        "/api/admin/articles",
        &article_body("admin.article_publish", r#""id":12"#),
        None,
    );
    assert_eq!(response.status, 409);
    assert_envelope(&response, "INVALID_STATE_TRANSITION");

    // 不存在的 term 重命名 → 404 ARTICLE_NOT_FOUND（Product 的对外码）。
    let response = post(
        port,
        "/api/admin/terms",
        &article_body("admin.term_update", r#""id":999,"name":"nope""#),
        None,
    );
    assert_eq!(response.status, 404);
    assert_envelope(&response, "ARTICLE_NOT_FOUND");

    // 诊断端点：非业务路径，不受场景影响，描述 session 与请求计数。
    let response = get(port, "/mock/diagnostics");
    assert_eq!(response.status, 200);
    let diagnostics = assert_envelope(&response, "OK")["data"].clone();
    assert_eq!(diagnostics["service"], "mock");
    assert_eq!(diagnostics["scenario"], "default");
    assert_eq!(diagnostics["session"]["header"], "X-Blog-Mock-Session");
    assert_eq!(diagnostics["session"]["namedCapacity"], 32);
    assert_eq!(diagnostics["unknownSessionPolicy"], "accept-and-seed");
    assert!(diagnostics["requests"]["apiTotal"].as_u64().unwrap() > 0);
    assert!(
        diagnostics["requests"]["writesAttempted"].as_u64().unwrap() > 0,
        "writes that reached the session store are counted"
    );

    let status = server.signal("-INT");
    assert!(status.success(), "clean exit expected, got {status:?}");
}

#[test]
fn sessions_isolate_state_and_keep_writes_visible_within_a_session() {
    let mut server = Server::start(&["--listen", "127.0.0.1:0", "--scenario", "default"]);
    let port = server.port;

    // 三个空间的起点相同：完整 seed。
    for session in [None, Some("t1"), Some("t2")] {
        let response = get_with(port, &admin_list(), session);
        assert_eq!(
            response.data()["total"],
            12,
            "session {session:?} starts seeded"
        );
    }

    // t1 创建并发布。
    let response = post(
        port,
        "/api/admin/articles",
        &article_body(
            "admin.article_create",
            r#""title":"session t1 article","summary":"only for t1","articleTypeId":1,"termIds":[3]"#,
        ),
        Some("t1"),
    );
    assert_eq!(response.status, 200);
    let created = response.data()["id"].as_i64().unwrap();
    assert_eq!(created, 13, "ids continue the seed inside the session");

    let response = post(
        port,
        "/api/admin/articles",
        &article_body("admin.article_publish", &format!(r#""id":{created}"#)),
        Some("t1"),
    );
    assert_eq!(response.status, 200);
    assert_eq!(response.data()["status"], "published");

    // t1：公开列表 +1 且新文章在最前；admin 列表可见。
    let response = get_with(port, &public_list(100), Some("t1"));
    assert_eq!(response.data()["total"], 10);
    assert_eq!(response.data()["items"][0]["id"], created);

    // t2 与匿名空间：完全不可见（跨 session 隔离）。
    for session in [None, Some("t2")] {
        let response = get_with(port, &public_list(100), session);
        assert_eq!(
            response.data()["total"],
            9,
            "session {session:?} must not see t1"
        );
        let response = get_with(port, &admin_list(), session);
        assert_eq!(response.data()["total"], 12);
        let response = get_with(
            port,
            "/api/public/articles?sceneCode=public.article_detail&id=13",
            session,
        );
        assert_eq!(response.status, 404);
    }

    // 刷新推荐：只在 t1 生效（跨请求状态 + session 隔离）。
    let response = post(
        port,
        "/api/admin/recommendations",
        &article_body("admin.recommendation_generate", ""),
        Some("t1"),
    );
    assert_eq!(response.status, 200);
    assert_eq!(response.data().as_array().unwrap().len(), 6);
    let response = get_with(
        port,
        "/api/public/recommendations?sceneCode=public.recommendation_current",
        Some("t1"),
    );
    assert_eq!(
        response.data()[0]["id"],
        13,
        "newest published first after refresh"
    );
    let response = get(
        port,
        "/api/public/recommendations?sceneCode=public.recommendation_current",
    );
    assert_eq!(response.data()[0]["id"], 12, "anonymous keeps its own set");

    // 空白 session 值 = 匿名空间；未知 session id 被接受并从 seed 初始化。
    let response = get_with(port, &admin_list(), Some("   "));
    assert_eq!(response.data()["total"], 12);
    let response = get_with(port, &admin_list(), Some("brand-new"));
    assert_eq!(
        response.data()["total"],
        12,
        "unknown ids are accepted, not rejected"
    );

    // 诊断端点可见 session 集合与计数（隔离的观察面）。
    let response = get(port, "/mock/diagnostics");
    let diagnostics = response.data();
    let named = diagnostics["session"]["named"].as_array().unwrap().clone();
    assert_eq!(
        named.len(),
        3,
        "t1, t2 and brand-new; anonymous is separate: {named:?}"
    );
    assert!(named.contains(&serde_json::json!("t1")));
    assert_eq!(diagnostics["requests"]["writesAttempted"], 3);

    let status = server.signal("-TERM");
    assert!(status.success(), "clean exit expected, got {status:?}");
}
