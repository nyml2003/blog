//! `default` 场景的进程级契约测试：Mock 的响应面必须与
//! `crates/product` 的公开 + 管理路由同形（路径、`sceneCode`、envelope、领域错误码、
//! camelCase、分页形状），并且 session 状态按 `X-Blog-Mock-Session` 显式隔离。

mod common;

use common::*;

#[test]
fn t_shelf_returns_filters_and_refetches_inside_each_surface() {
    let mut server = Server::start(&["--listen", "127.0.0.1:0", "--scenario", "default"]);
    let port = server.port;

    let archive = get(
        port,
        "/api/public/t-shelf?sceneCode=public.t_shelf&surface=archive",
    );
    assert_eq!(archive.status, 200, "{}", archive.body);
    let archive = archive.data();
    assert_eq!(archive["filters"][0]["id"], "all");
    assert_eq!(archive["filters"][0]["name"], "全部");
    assert_eq!(archive["selectedFilterId"], "all");
    assert_eq!(archive["total"], 45);
    assert_eq!(archive["articles"].as_array().unwrap().len(), 20);
    assert!(archive["articles"][0].get("contentHtml").is_none());

    let engineering = get(
        port,
        "/api/public/t-shelf?sceneCode=public.t_shelf&surface=archive&filter_id=1",
    )
    .data();
    assert_eq!(engineering["selectedFilterId"], "1");
    assert_eq!(engineering["total"], 28);
    assert_eq!(engineering["articles"].as_array().unwrap().len(), 20);

    let recommendations = get(
        port,
        "/api/public/recommendations?sceneCode=public.recommendation_current",
    )
    .data();
    let recommendation_ids: Vec<i64> = recommendations
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["id"].as_i64().unwrap())
        .collect();
    let recommendation_initial = get(
        port,
        "/api/public/t-shelf?sceneCode=public.t_shelf&surface=recommendation",
    )
    .data();
    let initial_ids: Vec<i64> = recommendation_initial["articles"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["id"].as_i64().unwrap())
        .collect();
    assert_eq!(recommendation_initial["selectedFilterId"], "all");
    assert_eq!(recommendation_initial["total"], recommendation_ids.len());
    assert_eq!(initial_ids, recommendation_ids);
    assert!(
        recommendation_initial["articles"][0]
            .get("contentHtml")
            .is_none()
    );

    let filtered_expected: Vec<i64> = recommendations
        .as_array()
        .unwrap()
        .iter()
        .filter(|item| item["articleTypeId"] == 1)
        .map(|item| item["id"].as_i64().unwrap())
        .collect();
    let recommendation = get(
        port,
        "/api/public/t-shelf?sceneCode=public.t_shelf&surface=recommendation&filter_id=1",
    )
    .data();
    let actual_ids: Vec<i64> = recommendation["articles"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["id"].as_i64().unwrap())
        .collect();
    assert_eq!(actual_ids, filtered_expected);
    assert_eq!(recommendation["total"], actual_ids.len());
    assert!(
        actual_ids
            .iter()
            .all(|article_id| recommendation_ids.contains(article_id)),
        "recommendation surface must not pull from the archive"
    );

    for path in [
        "/api/public/t-shelf?sceneCode=public.t_shelf",
        "/api/public/t-shelf?sceneCode=public.t_shelf&surface=archive&filter_id=nope",
        "/api/public/t-shelf?sceneCode=public.t_shelf&surface=archive&filter_id=999",
    ] {
        let response = get(port, path);
        assert_eq!(response.status, 400, "{path}: {}", response.body);
        assert_envelope(&response, "INVALID_JSON");
    }

    assert!(server.signal("-TERM").success());
}

/// SPEC-MOBILE-BROWSE-IA-001：货架分区截断 + 每分区 total，以及浏览接口的三维
/// AND / kind 校验 / 分页边界。Mock 与 Product 各自编排，这组断言锁定共同 wire。
#[test]
fn shelf_sections_are_bounded_and_browse_filters_are_and() {
    let mut server = Server::start(&["--listen", "127.0.0.1:0", "--scenario", "default"]);
    let port = server.port;
    let session = Some("browse");

    // 素材：Engineering(1) 从 4 篇补到 7 篇（> N=6）；a[topic] b[tag] c[topic+tag]。
    for (title, terms) in [
        ("browse article a", "[1]"),
        ("browse article b", "[3]"),
        ("browse article c", "[1,3]"),
    ] {
        let body = article_body(
            "admin.article_create",
            &format!(
                r#""title":"{title}","summary":"browse fixture","articleTypeId":1,"termIds":{terms},"contentHtml":"<p>{title}</p>""#
            ),
        );
        let response = post(port, "/api/admin/articles", &body, session);
        assert_eq!(response.status, 200, "{}", response.body);
        let id = response.data()["id"].as_i64().unwrap();
        let response = post(
            port,
            "/api/admin/articles",
            &article_body("admin.article_publish", &format!(r#""id":{id}"#)),
            session,
        );
        assert_eq!(response.status, 200, "{}", response.body);
    }

    // ---------- 货架：分区截断 + 每分区 total ----------
    let shelf = get_with(
        port,
        "/api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf",
        session,
    )
    .data();
    let sections = shelf["sections"].as_array().unwrap();
    assert_eq!(sections[0]["id"], "recommendation");
    assert_eq!(
        sections[0]["articles"].as_array().unwrap().len(),
        3,
        "推荐区固定 3 张"
    );
    assert_eq!(sections[0]["total"], 6, "推荐 total 为截断前条数");
    assert_eq!(shelf["total"], 48, "全量文章数，不随分区截断变化");
    let section_of = |id: &str| {
        sections
            .iter()
            .find(|section| section["id"] == id)
            .unwrap_or_else(|| panic!("missing section {id}"))
            .clone()
    };
    let engineering = section_of("type-1");
    assert_eq!(
        engineering["articles"].as_array().unwrap().len(),
        6,
        "类型分区只下发前 N=6 张"
    );
    assert_eq!(
        engineering["total"], 31,
        "分区 total = 该类型全量计数（> N）"
    );
    assert!(engineering["total"].as_u64().unwrap() > 6);
    assert_eq!(section_of("type-2")["total"], 12);
    assert_eq!(section_of("type-3")["total"], 5);
    let cards: usize = sections
        .iter()
        .map(|section| section["articles"].as_array().unwrap().len())
        .sum();
    assert_eq!(cards, 20, "3 推荐 + 6 + 6 + 5：下发条数有界");
    for section in sections {
        assert!(
            section["total"].as_u64().unwrap()
                >= section["articles"].as_array().unwrap().len() as u64,
            "total 不得小于下发卡片数: {section}"
        );
    }

    // ---------- 浏览接口：三维 AND + kind 校验 + 分页 ----------
    let browse = |query: &'static str| {
        get_with(
            port,
            &format!("/api/public/articles?sceneCode=public.article_browse{query}"),
            session,
        )
    };
    let total_of = |query: &'static str| browse(query).data()["total"].clone();

    // 空参数 = 全量第 1 页（默认 20 / 上限 100）。
    let empty = browse("").data();
    assert_eq!(empty["page"], 1);
    assert_eq!(empty["pageSize"], 20);
    assert_eq!(empty["total"], 48, "全部已发布文章（45 夹具 + 3 篇新建）");
    assert_eq!(
        empty["items"].as_array().unwrap().len(),
        20,
        "默认一页 20 条"
    );
    assert_eq!(empty["hasMore"], true, "48 > 20 → 「加载更多」");

    // 单维 / 多维 AND。
    assert_eq!(total_of("&type_id=1"), 31);
    assert_eq!(total_of("&type_id=1&topic_id=1"), 9);
    assert_eq!(total_of("&topic_id=1&tag_id=3"), 1, "topic AND tag");
    assert_eq!(total_of("&type_id=1&topic_id=1&tag_id=3"), 1, "三级 AND");
    assert_eq!(total_of("&type_id=3&topic_id=1"), 0, "维度组合错开 → 空");

    // kind 不匹配 / term 不存在 → 参数错误（与 Product 相同的对外码）。
    for (query, why) in [
        ("&topic_id=3", "term 3 是 tag"),
        ("&tag_id=1", "term 1 是 topic"),
        ("&topic_id=99999", "term 不存在"),
    ] {
        let response = browse(query);
        assert_eq!(response.status, 400, "{why}: {}", response.body);
        assert_envelope(&response, "INVALID_JSON");
    }

    // 分页边界：page < 1 归一化为 1；pageSize 0 → 默认 20；超上限钳制到 100；越界页为空。
    let page = browse("&page=0&pageSize=0").data();
    assert_eq!(page["page"], 1);
    assert_eq!(page["pageSize"], 20);
    assert_eq!(browse("&pageSize=5000").data()["pageSize"], 100);
    let page = browse("&page=1&pageSize=2").data();
    assert_eq!(page["items"].as_array().unwrap().len(), 2);
    assert_eq!(page["hasMore"], true);
    let page = browse("&page=24&pageSize=2").data();
    assert_eq!(page["items"].as_array().unwrap().len(), 2, "48 = 24 页 × 2");
    assert_eq!(page["hasMore"], false, "最后一页");
    let page = browse("&page=25&pageSize=2").data();
    assert_eq!(page["items"].as_array().unwrap().len(), 0);
    assert_eq!(page["hasMore"], false);
    let page = browse("&page=99").data();
    assert_eq!(page["items"].as_array().unwrap().len(), 0);
    assert_eq!(page["hasMore"], false);
    assert_eq!(page["total"], 48);

    // ---------- 共享的 `public.article_list` 契约零改动 ----------
    let list = get_with(port, &public_list(100), session).data();
    assert_eq!(list["total"], 48);
    let or_list = get_with(
        port,
        "/api/public/articles?sceneCode=public.article_list&term_ids=1,3",
        session,
    )
    .data();
    assert_eq!(or_list["total"], 21, "topic 1 OR tag 3（18 + 3 篇新建）");
    let ignored = get_with(
        port,
        "/api/public/articles?sceneCode=public.article_list&topic_id=1",
        session,
    )
    .data();
    assert_eq!(
        ignored["total"], 48,
        "列表端点忽略 topic_id（同维度 OR 语义不变）"
    );

    let status = server.signal("-TERM");
    assert!(status.success());
}

#[test]
fn html_validation_matches_product_and_preserves_failed_edits() {
    let mut server = Server::start(&["--listen", "127.0.0.1:0", "--scenario", "default"]);
    let port = server.port;
    let session = Some("html-validation");
    let invalid = "<p class=\"author\">unsafe</p>";
    let mut body = serde_json::json!({
        "sceneCode": "admin.article_create", "title": "source title", "summary": "source summary",
        "articleTypeId": 1, "termIds": [1], "contentHtml": invalid,
        "status": "published", "htmlInspection": { "valid": true },
    });
    let rejected = post(port, "/api/admin/articles", &body.to_string(), session);
    assert_eq!(rejected.status, 422);
    assert_eq!(
        assert_envelope(&rejected, "INVALID_ARTICLE_HTML")["data"]["htmlInspection"]["valid"],
        false
    );

    let valid = "<p><a href=\"https://example.com\" target=\"_blank\" rel=\"noopener noreferrer\">reference</a></p>";
    body["contentHtml"] = valid.into();
    let saved = post(port, "/api/admin/articles", &body.to_string(), session);
    assert_eq!(saved.status, 200);
    let saved_data = saved.data();
    let id = saved_data["id"].as_i64().unwrap();
    assert_eq!(saved_data["status"], "draft");
    assert_eq!(saved_data["contentHtml"], valid);
    let detail_path = format!("/api/admin/articles?sceneCode=admin.article_detail&id={id}");
    let mut invalid_update = body.clone();
    body["sceneCode"] = "admin.article_update".into();
    body["id"] = id.into();
    invalid_update["sceneCode"] = "admin.article_update".into();
    invalid_update["id"] = id.into();
    invalid_update["contentHtml"] = invalid.into();
    invalid_update["title"] = "must not persist".into();
    let rejected = post(
        port,
        "/api/admin/articles",
        &invalid_update.to_string(),
        session,
    );
    assert_eq!(rejected.status, 422);
    assert_eq!(
        assert_envelope(&rejected, "INVALID_ARTICLE_HTML")["data"]["htmlInspection"]["valid"],
        false
    );
    let stored = get_with(port, &detail_path, session).data();
    assert_eq!(
        stored, saved_data,
        "failed update preserves the entire saved version"
    );
    assert_eq!(
        post(port, "/api/admin/articles", &body.to_string(), session).status,
        200
    );
    let publish = serde_json::json!({"sceneCode": "admin.article_publish", "id": id});
    assert_eq!(
        post(port, "/api/admin/articles", &publish.to_string(), session).status,
        200
    );
    let rejected = post(
        port,
        "/api/admin/articles",
        &invalid_update.to_string(),
        session,
    );
    assert_eq!(rejected.status, 422);
    let public_path = format!("/api/public/articles?sceneCode=public.article_detail&id={id}");
    let public = get_with(port, &public_path, session).data();
    assert_eq!(public["contentHtml"], valid);
    assert_eq!(public["title"], "source title");
    assert_eq!(public["status"], "published");
    let _ = server.signal("-TERM");
}

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
    assert_eq!(data["total"], 45, "seed: 45 published articles");
    assert_eq!(data["page"], 1);
    assert_eq!(data["pageSize"], 4);
    assert_eq!(data["hasMore"], true);
    assert_eq!(data["items"].as_array().unwrap().len(), 4);
    assert_eq!(data["items"][0]["id"], 48, "updated_at DESC, id DESC");
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
    assert_eq!(response.data()["hasMore"], false, "45 ≤ 100 → 单页");

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
    assert_eq!(response.data().as_array().unwrap().len(), 6);
    let response = get(
        port,
        "/api/public/terms?sceneCode=public.term_list&kind=tag",
    );
    let tags = response.data().as_array().unwrap().clone();
    assert_eq!(tags.len(), 3);
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
    assert_eq!(recommendation[0]["id"], 48, "最近更新优先");
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
    assert_eq!(shelf["total"], 45, "the full filtered result, not a page");
    for section in sections {
        let cards = section["articles"].as_array().unwrap().len();
        assert!(
            cards <= 6,
            "each section is bounded by the shelf limit: {}",
            section["id"]
        );
        assert_eq!(section["total"].as_u64().unwrap() as usize, {
            // 全量计数（截断前）不得小于下发卡片数。
            let total = section["total"].as_u64().unwrap() as usize;
            assert!(total >= cards);
            total
        });
    }

    // 管理 GET：列表带 draft（{items,total} 形态），详情可见。
    let response = get(port, &admin_list());
    assert_eq!(response.status, 200);
    let admin = assert_envelope(&response, "OK")["data"].clone();
    assert_eq!(admin["total"], 48, "含 draft 的全量");
    assert_eq!(
        admin["items"].as_array().unwrap().len(),
        20,
        "admin 列表沿用默认页大小"
    );
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
    assert_eq!(response.data().as_array().unwrap().len(), 6);

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
            48,
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
    assert_eq!(created, 49, "ids continue the seed inside the session");

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
    assert_eq!(response.data()["total"], 46);
    assert_eq!(response.data()["items"][0]["id"], created);

    // t2 与匿名空间：完全不可见（跨 session 隔离）。
    for session in [None, Some("t2")] {
        let response = get_with(port, &public_list(100), session);
        assert_eq!(
            response.data()["total"],
            45,
            "session {session:?} must not see t1"
        );
        let response = get_with(port, &admin_list(), session);
        assert_eq!(response.data()["total"], 48);
        let response = get_with(
            port,
            "/api/public/articles?sceneCode=public.article_detail&id=49",
            session,
        );
        assert_eq!(response.status, 404, "t1 的草稿对其他 session 不可见");
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
        49,
        "newest published first after refresh"
    );
    let response = get(
        port,
        "/api/public/recommendations?sceneCode=public.recommendation_current",
    );
    assert_eq!(response.data()[0]["id"], 48, "anonymous keeps its own set");

    // 空白 session 值 = 匿名空间；未知 session id 被接受并从 seed 初始化。
    let response = get_with(port, &admin_list(), Some("   "));
    assert_eq!(response.data()["total"], 48);
    let response = get_with(port, &admin_list(), Some("brand-new"));
    assert_eq!(
        response.data()["total"],
        48,
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
