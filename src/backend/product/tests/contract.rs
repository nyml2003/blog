//! Product 外部契约测试（真实 binary + 真实 Data + 真实 HTTP）。
//!
//! 与已移除的 Go 参考实现行为对齐（2026-09-06 退场），逐端点覆盖：路径、方法、`sceneCode`、
//! `{code,message,data}` envelope、领域错误码、camelCase 字段、分页与状态机，
//! 以及「Product→Data 调用数与条目数无关」（发布读原文再条件提交，共 2 次）。
//!
//! 端口使用高位冷门端口（WSL2 下 8080 被 Windows 侧长期占用且不可见）。

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const DATA_PORT: u16 = 18231;
const PRODUCT_PORT: u16 = 18230;
const DATA_ADDR: &str = "http://127.0.0.1:18231";

struct Server {
    child: Child,
    lines: Arc<Mutex<Vec<String>>>,
}

impl Server {
    fn start(binary: &str, args: &[&str], env: &[(&str, &str)]) -> Self {
        let mut command = Command::new(bin_path(binary));
        command
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (key, value) in env {
            command.env(key, value);
        }
        let mut child = command.spawn().expect("spawn service binary");
        let lines: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let mut streams: Vec<Box<dyn Read + Send>> = Vec::new();
        if let Some(stdout) = child.stdout.take() {
            streams.push(Box::new(stdout));
        }
        if let Some(stderr) = child.stderr.take() {
            streams.push(Box::new(stderr));
        }
        for stream in streams {
            let lines = Arc::clone(&lines);
            std::thread::spawn(move || {
                let reader = BufReader::new(stream);
                for line in reader.lines().map_while(Result::ok) {
                    lines.lock().unwrap().push(line);
                }
            });
        }
        Self { child, lines }
    }

    fn lines(&self) -> Vec<String> {
        self.lines.lock().unwrap().clone()
    }

    fn wait_for_line(&self, needle: &str, timeout: Duration) {
        let deadline = Instant::now() + timeout;
        loop {
            if self.lines().iter().any(|line| line.contains(needle)) {
                return;
            }
            assert!(
                Instant::now() < deadline,
                "log line containing '{needle}' never appeared; logs: {:?}",
                self.lines()
            );
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    fn terminate(&mut self) -> bool {
        let pid = self.child.id();
        let _ = Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .status();
        let deadline = Instant::now() + Duration::from_secs(8);
        loop {
            match self.child.try_wait().expect("wait for child") {
                Some(status) => return status.success(),
                None if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
                None => {
                    let _ = self.child.kill();
                    let _ = self.child.wait();
                    return false;
                }
            }
        }
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn bin_path(name: &str) -> PathBuf {
    let path = PathBuf::from(env!("CARGO_TARGET_TMPDIR"))
        .join("..")
        .join("debug")
        .join(name);
    assert!(
        path.exists(),
        "missing {name}; run `cargo build` before `cargo test` (looked at {})",
        path.display()
    );
    path
}

struct Response {
    status: u16,
    content_type: String,
    body: String,
}

fn request(port: u16, raw: &str) -> Response {
    // 绑定成功与 accept 就绪之间存在窗口；连接被拒时短暂重试。
    let mut stream = {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            match TcpStream::connect(("127.0.0.1", port)) {
                Ok(stream) => break stream,
                Err(error) if error.kind() == std::io::ErrorKind::ConnectionRefused => {
                    assert!(Instant::now() < deadline, "nothing is listening on {port}");
                    std::thread::sleep(Duration::from_millis(20));
                }
                Err(error) => panic!("connect to {port} failed: {error}"),
            }
        }
    };
    stream
        .set_read_timeout(Some(Duration::from_secs(20)))
        .unwrap();
    stream.write_all(raw.as_bytes()).expect("write request");
    let mut raw_response = String::new();
    let _ = stream.read_to_string(&mut raw_response);
    let (head, body) = raw_response
        .split_once("\r\n\r\n")
        .unwrap_or((raw_response.as_str(), ""));
    let status = head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse().ok())
        .unwrap_or_default();
    let content_type = head
        .lines()
        .find_map(|line| {
            line.split_once(": ")
                .map(|(k, v)| (k.to_ascii_lowercase(), v.to_owned()))
        })
        .filter(|(key, _)| key == "content-type")
        .map(|(_, value)| value)
        .unwrap_or_default();
    Response {
        status,
        content_type,
        body: body.to_owned(),
    }
}

fn get(port: u16, path: &str) -> Response {
    request(
        port,
        &format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"),
    )
}

fn post_json(port: u16, path: &str, body: &str) -> Response {
    request(
        port,
        &format!(
            "POST {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\n\
             Connection: close\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        ),
    )
}

fn post_data_direct(port: u16, body: &str, request_id: String) -> u16 {
    request(
        port,
        &format!(
            "POST /data/v1/operations HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\n\
             Connection: close\r\nx-blog-request-id: {request_id}\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        ),
    )
    .status
}

fn json_of(response: &Response) -> serde_json::Value {
    serde_json::from_str(&response.body)
        .unwrap_or_else(|error| panic!("response is not JSON ({error}): {}", response.body))
}

fn data_query_total(port: u16) -> u64 {
    let envelope = json_of(&get(port, "/data/v1/diagnostics"));
    envelope["data"]["query_count_total"].as_u64().unwrap()
}

#[test]
fn full_public_admin_contract_and_static_mount() {
    let workdir = std::env::temp_dir().join(format!("product-contract-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&workdir);
    std::fs::create_dir_all(workdir.join("assets")).unwrap();
    let db_path = workdir.join("contract.db");

    // 构造一个最小 `web/dist`（真实产物由 `pnpm build` 生成，契约只关心路由行为）。
    for relative in [
        "desktop/pages/public-home/index.html",
        "desktop/pages/public-articles/index.html",
        "desktop/pages/public-detail/index.html",
        "desktop/pages/admin-home/index.html",
        "desktop/pages/admin-article-new/index.html",
        "desktop/pages/admin-article-edit/index.html",
        "desktop/pages/admin-editor-guide/index.html",
        "desktop/pages/admin-article-types/index.html",
        "desktop/pages/admin-terms/index.html",
        "mobile/pages/home/index.html",
        "mobile/pages/articles/index.html",
        "mobile/pages/article-detail/index.html",
    ] {
        let path = workdir.join(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, format!("<html>{relative}</html>")).unwrap();
    }
    std::fs::write(workdir.join("assets/app-test.js"), "console.log('app')").unwrap();

    let mut data = Server::start(
        "data",
        &[
            "--data-semantics",
            "test",
            "--data-database-path",
            db_path.to_str().unwrap(),
            "--listen",
            &format!("127.0.0.1:{DATA_PORT}"),
        ],
        &[],
    );
    // Data 就绪先于 Product 启动（FAIL-002）；等待其 listening 日志再继续。
    data.wait_for_line("listening addr=", Duration::from_secs(10));
    let health = get(DATA_PORT, "/healthz");
    assert_eq!(
        health.status,
        200,
        "data must be ready first; data logs: {:?}",
        data.lines()
    );

    let mut product = Server::start(
        "product",
        &[
            "--listen",
            &format!("127.0.0.1:{PRODUCT_PORT}"),
            "--web-dir",
            workdir.to_str().unwrap(),
        ],
        &[("BLOG_DATA_ADDR", DATA_ADDR)],
    );

    // ---------- 健康与诊断 ----------
    assert_eq!(get(PRODUCT_PORT, "/healthz").status, 200);
    let diagnostics = json_of(&get(PRODUCT_PORT, "/product/diagnostics"));
    assert_eq!(diagnostics["code"], "OK");
    assert_eq!(diagnostics["data"]["webDirMounted"], true);
    assert_eq!(
        diagnostics["data"]["webDirInjected"],
        workdir.to_str().unwrap()
    );

    // ---------- 公开列表：分页 + camelCase + 关联数据 ----------
    let before = data_query_total(DATA_PORT);
    let response = get(
        PRODUCT_PORT,
        "/api/public/articles?sceneCode=public.article_list&page=1&pageSize=2&type_id=1",
    );
    assert_eq!(response.status, 200);
    let envelope = json_of(&response);
    assert_eq!(envelope["code"], "OK");
    assert_eq!(envelope["message"], "");
    let page = &envelope["data"];
    assert_eq!(page["page"], 1);
    assert_eq!(page["pageSize"], 2);
    assert_eq!(page["items"].as_array().unwrap().len(), 2);
    assert!(page["total"].as_i64().unwrap() > 2);
    assert_eq!(page["hasMore"], true);
    let first = &page["items"][0];
    assert!(first.get("articleTypeId").is_some());
    assert!(first["articleType"]["name"].is_string());
    assert!(first.get("contentHtml").is_none(), "list carries no body");
    assert_eq!(
        data_query_total(DATA_PORT) - before,
        3,
        "list keeps 3 queries regardless of pageSize"
    );

    // 排序：`updated_at DESC, id DESC`。
    let response = get(
        PRODUCT_PORT,
        "/api/public/articles?sceneCode=public.article_list&pageSize=100",
    );
    let ids: Vec<i64> = json_of(&response)["data"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["id"].as_i64().unwrap())
        .collect();
    let mut sorted = ids.clone();
    sorted.sort_unstable_by(|a, b| b.cmp(a));
    assert_eq!(ids, sorted);

    // ---------- 公开详情 + 可见性 ----------
    let response = get(
        PRODUCT_PORT,
        "/api/public/articles?sceneCode=public.article_detail&id=11",
    );
    assert_eq!(response.status, 200);
    let envelope = json_of(&response);
    assert_eq!(envelope["data"]["id"], 11);
    assert_eq!(
        envelope["data"]["contentHtml"],
        "<p>current_thread runtime notes</p>"
    );
    // terms 按 `kind, name` 排序（tag 在 topic 前），与 Go 参考实现一致。
    let term_kinds: Vec<&str> = envelope["data"]["terms"]
        .as_array()
        .unwrap()
        .iter()
        .map(|term| term["kind"].as_str().unwrap())
        .collect();
    assert_eq!(term_kinds, vec!["tag", "topic"], "ordered by kind, name");

    let response = get(
        PRODUCT_PORT,
        "/api/public/articles?sceneCode=public.article_detail&id=3",
    );
    assert_eq!(response.status, 404, "draft must not leak to public");
    assert_eq!(json_of(&response)["code"], "ARTICLE_NOT_FOUND");

    let response = get(
        PRODUCT_PORT,
        "/api/public/articles?sceneCode=public.article_detail&id=abc",
    );
    assert_eq!(response.status, 400);
    assert_eq!(json_of(&response)["code"], "INVALID_ID");

    // ---------- sceneCode / 方法错误 ----------
    for (path, expected) in [
        ("/api/public/articles?sceneCode=nope", "UNKNOWN_SCENE_CODE"),
        ("/api/public/article-types", "UNKNOWN_SCENE_CODE"),
        ("/api/public/terms?sceneCode=public.term_list", "OK"),
        ("/api/public/recommendations", "UNKNOWN_SCENE_CODE"),
        ("/api/public/mobile/article-shelf", "UNKNOWN_SCENE_CODE"),
    ] {
        let response = get(PRODUCT_PORT, path);
        assert_eq!(
            json_of(&response)["code"],
            expected,
            "path={path} body={}",
            response.body
        );
    }
    // POST 到公开列表 → 405 METHOD_NOT_ALLOWED（Go 参考实现同语义）。
    let response = post_json(
        PRODUCT_PORT,
        "/api/public/articles?sceneCode=public.article_list",
        "{}",
    );
    assert_eq!(response.status, 405);
    assert_eq!(json_of(&response)["code"], "METHOD_NOT_ALLOWED");

    // ---------- 分类 / terms / 推荐 ----------
    let response = get(
        PRODUCT_PORT,
        "/api/public/article-types?sceneCode=public.article_type_list",
    );
    let types = json_of(&response)["data"].as_array().unwrap().clone();
    assert_eq!(types.len(), 3);
    assert!(types[0]["createdAt"].is_string());

    let response = get(
        PRODUCT_PORT,
        "/api/public/terms?sceneCode=public.term_list&kind=tag",
    );
    let terms = json_of(&response)["data"].as_array().unwrap().clone();
    assert_eq!(terms.len(), 2, "seed has two tags");
    assert!(terms.iter().all(|term| term["kind"] == "tag"));

    let response = get(
        PRODUCT_PORT,
        "/api/public/recommendations?sceneCode=public.recommendation_current",
    );
    let recommendation = json_of(&response);
    assert_eq!(recommendation["code"], "OK");
    let items = recommendation["data"].as_array().unwrap();
    assert_eq!(items.len(), 6);
    assert!(
        items[0]["contentHtml"].is_string(),
        "recommendation carries body"
    );

    // ---------- mobile shelf BFF ----------
    let response = get(
        PRODUCT_PORT,
        "/api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf",
    );
    assert_eq!(response.status, 200);
    let shelf = json_of(&response)["data"].clone();
    let sections = shelf["sections"].as_array().unwrap();
    assert_eq!(
        sections[0]["id"], "recommendation",
        "无筛选时推荐 section 在前"
    );
    assert_eq!(
        sections[0]["articles"].as_array().unwrap().len(),
        3,
        "推荐最多 3 张卡片"
    );
    assert!(sections[0]["articles"][0].get("contentHtml").is_none());
    assert_eq!(shelf["total"], 9);
    assert_eq!(shelf["hasFilters"], false);
    assert_eq!(shelf["warnings"].as_array().unwrap().len(), 0);
    let type_sections: Vec<&serde_json::Value> = sections[1..]
        .iter()
        .filter(|section| section["id"].as_str().unwrap().starts_with("type-"))
        .collect();
    assert!(!type_sections.is_empty());
    for section in &type_sections {
        assert!(
            !section["articles"].as_array().unwrap().is_empty(),
            "空分区必须隐藏: {section}"
        );
    }
    // section 顺序：类型按 `name` 序（Announcements / Engineering / Field Notes）。
    let titles: Vec<&str> = type_sections
        .iter()
        .map(|section| section["title"].as_str().unwrap())
        .collect();
    let mut expected = titles.clone();
    expected.sort_unstable();
    assert_eq!(titles, expected, "types are ordered by name");

    // 带筛选：无推荐 section，hasFilters=true。
    let response = get(
        PRODUCT_PORT,
        "/api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf&term_ids=4",
    );
    let filtered = json_of(&response)["data"].clone();
    assert_eq!(filtered["hasFilters"], true);
    assert!(
        !filtered["sections"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["id"] == "recommendation"),
        "带筛选时不返回推荐 section"
    );

    // ---------- 管理侧：创建 → 状态机 → 更新 ----------
    let before = data_query_total(DATA_PORT);
    let create_body = r#"{"sceneCode":"admin.article_create","title":"契约测试文章","summary":"契约摘要","articleTypeId":2,"termIds":[3,4],"contentHtml":"<p>created</p>"}"#;
    let response = post_json(PRODUCT_PORT, "/api/admin/articles", create_body);
    assert_eq!(response.status, 200, "{}", response.body);
    let created = json_of(&response);
    assert_eq!(created["code"], "OK");
    assert_eq!(created["data"]["status"], "draft");
    assert!(
        created["data"]["publishedAt"].is_null(),
        "created article has no publishedAt"
    );
    assert_eq!(created["data"]["termIds"].as_array().unwrap().len(), 2);
    let new_id = created["data"]["id"].as_i64().unwrap();

    // 管理列表：`items` + `total`，包含草稿。
    let response = get(
        PRODUCT_PORT,
        "/api/admin/articles?sceneCode=admin.article_list&page=1&pageSize=100",
    );
    let admin_list = json_of(&response);
    assert_eq!(admin_list["code"], "OK");
    assert!(admin_list["data"]["items"].as_array().unwrap().len() >= 10);
    assert!(
        admin_list["data"].get("page").is_none(),
        "admin list carries no paging"
    );
    assert!(admin_list["data"]["total"].as_i64().unwrap() >= 10);
    // 调用数与条目数无关：创建 + 列表 + 3 次详情查询的增量保持有界。
    assert!(
        data_query_total(DATA_PORT) - before >= 5,
        "writes and reads both went through Data"
    );

    // 管理详情可见草稿；公开详情仍不可见。
    let response = get(
        PRODUCT_PORT,
        &format!("/api/admin/articles?sceneCode=admin.article_detail&id={new_id}"),
    );
    assert_eq!(json_of(&response)["data"]["status"], "draft");
    let response = get(
        PRODUCT_PORT,
        &format!("/api/public/articles?sceneCode=public.article_detail&id={new_id}"),
    );
    assert_eq!(response.status, 404);

    // publish：draft -> published；重复 publish → 409 INVALID_STATE_TRANSITION。
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/articles",
        &format!(r#"{{"sceneCode":"admin.article_publish","id":{new_id}}}"#),
    );
    assert_eq!(response.status, 200, "{}", response.body);
    let published = json_of(&response);
    assert_eq!(published["data"]["status"], "published");
    assert!(published["data"]["publishedAt"].is_string());
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/articles",
        &format!(r#"{{"sceneCode":"admin.article_publish","id":{new_id}}}"#),
    );
    assert_eq!(response.status, 409);
    assert_eq!(json_of(&response)["code"], "INVALID_STATE_TRANSITION");

    // 公开详情现在可见，公开列表也包含。
    let response = get(
        PRODUCT_PORT,
        &format!("/api/public/articles?sceneCode=public.article_detail&id={new_id}"),
    );
    assert_eq!(response.status, 200);

    // 摘要校验：>160 字符 → 422 INVALID_SUMMARY（Product 域规则，未打 Data）。
    let before = data_query_total(DATA_PORT);
    let long = "字".repeat(161);
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/articles",
        &format!(
            r#"{{"sceneCode":"admin.article_update","id":{new_id},"title":"t","summary":"{long}","articleTypeId":1,"termIds":[],"contentHtml":"<p>x</p>"}}"#
        ),
    );
    assert_eq!(response.status, 422);
    assert_eq!(json_of(&response)["code"], "INVALID_SUMMARY");
    assert_eq!(
        data_query_total(DATA_PORT),
        before,
        "domain validation must not call Data"
    );

    // unpublish：published -> draft。
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/articles",
        &format!(r#"{{"sceneCode":"admin.article_unpublish","id":{new_id}}}"#),
    );
    assert_eq!(response.status, 200);
    assert_eq!(json_of(&response)["data"]["status"], "draft");
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/articles",
        &format!(r#"{{"sceneCode":"admin.article_unpublish","id":{new_id}}}"#),
    );
    assert_eq!(response.status, 409);

    // 更新：不改状态，terms 替换，摘要去空白。
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/articles",
        &format!(
            r#"{{"sceneCode":"admin.article_update","id":{new_id},"title":"契约测试文章 v2","summary":"  更新摘要  ","articleTypeId":3,"termIds":[1],"contentHtml":"<p>v2</p>"}}"#
        ),
    );
    let updated = json_of(&response);
    assert_eq!(updated["code"], "OK");
    assert_eq!(updated["data"]["summary"], "更新摘要");
    assert_eq!(updated["data"]["articleTypeId"], 3);
    assert_eq!(updated["data"]["termIds"].as_array().unwrap().len(), 1);
    assert_eq!(updated["data"]["status"], "draft");

    // 不存在的文章 → 404 ARTICLE_NOT_FOUND。
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/articles",
        r#"{"sceneCode":"admin.article_publish","id":99999}"#,
    );
    assert_eq!(response.status, 404);
    assert_eq!(json_of(&response)["code"], "ARTICLE_NOT_FOUND");

    // 非法 JSON → 400 INVALID_JSON。
    let response = post_json(PRODUCT_PORT, "/api/admin/articles", "{not json");
    assert_eq!(response.status, 400);
    assert_eq!(json_of(&response)["code"], "INVALID_JSON");

    // ---------- 分类 / term 的管理写入 ----------
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/article-types",
        r#"{"sceneCode":"admin.article_type_create","name":"Playbooks"}"#,
    );
    assert_eq!(response.status, 200, "{}", response.body);
    assert_eq!(json_of(&response)["data"]["name"], "Playbooks");
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/article-types",
        r#"{"sceneCode":"admin.article_type_create","name":"Engineering"}"#,
    );
    assert_eq!(response.status, 409);
    assert_eq!(json_of(&response)["code"], "DUPLICATE_NAME");
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/article-types",
        r#"{"sceneCode":"admin.article_type_update","id":1,"name":"Handbooks"}"#,
    );
    assert_eq!(response.status, 200);
    assert!(
        json_of(&response)["data"].is_null(),
        "update returns no payload"
    );
    let response = get(
        PRODUCT_PORT,
        "/api/admin/article-types?sceneCode=admin.article_type_list",
    );
    assert!(
        json_of(&response)["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|kind| kind["name"] == "Handbooks")
    );

    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/terms",
        r#"{"sceneCode":"admin.term_create","name":"nix","kind":"tag"}"#,
    );
    assert_eq!(response.status, 200);
    assert_eq!(json_of(&response)["data"]["kind"], "tag");
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/terms",
        r#"{"sceneCode":"admin.term_create","name":"rust","kind":"topic"}"#,
    );
    assert_eq!(response.status, 409);
    assert_eq!(json_of(&response)["code"], "DUPLICATE_NAME");
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/terms",
        r#"{"sceneCode":"admin.term_update","id":1,"name":"rustlang"}"#,
    );
    assert_eq!(response.status, 200);
    let response = get(PRODUCT_PORT, "/api/admin/terms?sceneCode=admin.term_list");
    assert!(
        json_of(&response)["data"]
            .as_array()
            .unwrap()
            .iter()
            .any(|term| term["name"] == "rustlang")
    );

    // ---------- 推荐生成 ----------
    // 推荐只引用已发布文章：先 publish（更新过的文章 `updated_at` 最新，应排第一）。
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/articles",
        &format!(r#"{{"sceneCode":"admin.article_publish","id":{new_id}}}"#),
    );
    assert_eq!(response.status, 200);
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/recommendations",
        r#"{"sceneCode":"admin.recommendation_generate"}"#,
    );
    assert_eq!(response.status, 200, "{}", response.body);
    let generated = json_of(&response)["data"].as_array().unwrap().clone();
    assert_eq!(generated.len(), 6);
    // 最近更新的文章（契约测试文章 v2 刚被更新）排第一。
    assert_eq!(generated[0]["title"], "契约测试文章 v2");

    // 错误 sceneCode → 400。
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/recommendations",
        r#"{"sceneCode":"admin.recommendation_delete"}"#,
    );
    assert_eq!(response.status, 400);
    assert_eq!(json_of(&response)["code"], "UNKNOWN_SCENE_CODE");

    // 推荐只引用已发布文章。
    let response = get(
        PRODUCT_PORT,
        "/api/public/recommendations?sceneCode=public.recommendation_current",
    );
    let current = json_of(&response)["data"].as_array().unwrap().clone();
    assert!(current.iter().all(|item| item["status"] == "published"));

    // ---------- 静态挂载（MODE-004 / SPIKE-001 观察点） ----------
    let cases = [
        ("/", "desktop/pages/public-home/index.html"),
        ("/m", "mobile/pages/home/index.html"),
        ("/m/", "mobile/pages/home/index.html"),
        ("/admin", "desktop/pages/admin-home/index.html"),
        ("/admin/", "desktop/pages/admin-home/index.html"),
        (
            "/admin/articles/new.html",
            "desktop/pages/admin-article-new/index.html",
        ),
        (
            "/admin/editor-guide/index.html",
            "desktop/pages/admin-editor-guide/index.html",
        ),
        (
            "/admin/terms/index.html",
            "desktop/pages/admin-terms/index.html",
        ),
    ];
    for (path, expected) in cases {
        let response = get(PRODUCT_PORT, path);
        assert_eq!(response.status, 200, "path={path}");
        assert!(
            response.content_type.starts_with("text/html"),
            "path={path}"
        );
        assert_eq!(
            response.body,
            format!("<html>{expected}</html>"),
            "path={path}"
        );
    }
    let response = get(PRODUCT_PORT, "/assets/app-test.js");
    assert_eq!(response.status, 200);
    assert!(response.content_type.starts_with("text/javascript"));
    assert_eq!(response.body, "console.log('app')");

    let response = get(PRODUCT_PORT, "/admin/articles/preview.html");
    assert_eq!(response.status, 404);

    // 未知路径 / 无尾斜杠目录路径 / 深层刷新路径 → 404 text/plain（与 Go 一致）。
    for path in [
        "/articles",
        "/articles/",
        "/articles/detail",
        "/m/articles",
        "/admin/articles/edit",
        "/nope",
        "/assets/",
        "/assets/missing.js",
    ] {
        let response = get(PRODUCT_PORT, path);
        assert_eq!(response.status, 404, "path={path}");
        assert!(
            response.content_type.starts_with("text/plain"),
            "path={path}"
        );
        assert_eq!(response.body, "404 page not found\n", "path={path}");
    }

    // `/api` 未知子路径同样落到静态兜底 → 404（Go 参考实现行为一致）。
    let response = get(PRODUCT_PORT, "/api/unknown");
    assert_eq!(response.status, 404);

    assert_html_validation_contract();

    // ---------- 背压透传（FAIL-008 链路侧） ----------
    // 灌满 Data 的 io lane（8 worker + 容量 64），同时从 Product 发起请求：
    // 至少一次应收到 503 + BACKPRESSURE，且两个进程都不退出。
    let slow = r#"{"operation":"diagnostic_slow","payload":{"batches":3,"batch_ms":80}}"#;
    let mut handles = Vec::new();
    for index in 0..90 {
        let body = slow.to_owned();
        handles.push(std::thread::spawn(move || {
            post_data_direct(DATA_PORT, &body, format!("saturate-{index}"))
        }));
    }
    let mut shelf_handles = Vec::new();
    for _ in 0..40 {
        shelf_handles.push(std::thread::spawn(move || {
            get(
                PRODUCT_PORT,
                "/api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf",
            )
        }));
    }
    for handle in handles {
        let _ = handle.join();
    }
    let mut backpressure_responses = 0usize;
    for handle in shelf_handles {
        let response = handle.join().expect("shelf request thread");
        if response.status == 503 {
            assert_eq!(json_of(&response)["code"], "BACKPRESSURE");
            assert_eq!(json_of(&response)["data"], serde_json::Value::Null);
            backpressure_responses += 1;
        }
    }
    let diagnostics = json_of(&get(PRODUCT_PORT, "/product/diagnostics"));
    let propagated = diagnostics["data"]["dataBackpressureTotal"]
        .as_u64()
        .expect("backpressure counter present");
    assert!(
        propagated > 0,
        "Product must observe Data backpressure; got {propagated}, 503 responses = {backpressure_responses}"
    );
    assert!(
        product.child.try_wait().unwrap().is_none() && data.child.try_wait().unwrap().is_none(),
        "neither process may exit because of saturation"
    );

    // ---------- Product 侧日志：发布 2 次，其余端点 1 次 Data 调用 ----------
    let lines = product.lines();
    assert!(
        lines
            .iter()
            .all(|line| line.starts_with("[product]") || !line.starts_with('[')),
        "product logs must carry the [product] prefix"
    );
    let counted: Vec<&String> = lines
        .iter()
        .filter(|line| line.contains("data_calls="))
        .collect();
    assert!(
        counted.len() >= 15,
        "expected one log line per API request, got {}",
        counted.len()
    );
    assert!(
        counted
            .iter()
            .any(|line| line.contains("scene=admin.article_publish data_calls=2"))
    );
    for line in counted {
        let expected = if line.contains("scene=admin.article_publish") {
            "data_calls=2"
        } else {
            "data_calls=1"
        };
        assert!(line.contains(expected), "{line}");
    }

    // ---------- SIGTERM：两进程干净退出 ----------
    let data_ok = data.terminate();
    let product_ok = product.terminate();
    assert!(data_ok, "data exits cleanly on SIGTERM");
    assert!(product_ok, "product exits cleanly on SIGTERM");
    product.wait_for_line("shutdown complete", Duration::from_secs(3));
    let shutdown = product.lines();
    let signal = shutdown
        .iter()
        .position(|line| line.contains("signal received signal=SIGTERM"))
        .expect("signal log");
    let stop = shutdown
        .iter()
        .position(|line| line.contains("phase=1 stop accept"))
        .expect("stop accept log");
    let drained = shutdown
        .iter()
        .position(|line| line.contains("phase=2 in-flight requests drained"))
        .expect("drain log");
    assert!(
        signal < stop && stop < drained,
        "shutdown order: {shutdown:?}"
    );

    let _ = std::fs::remove_dir_all(&workdir);
}

fn assert_html_validation_contract() {
    let invalid_sources = [
        "<script>window.injected=true</script>",
        "<p onclick=\"run()\">event</p>",
        "<p class=\"custom\">class</p>",
        "<p style=\"color:red\">style</p>",
        "<img src=\"https://example.com/a.png\">",
        "<p><a href=\"https://example.com\">missing mandatory attributes</a></p>",
        "<p><a href=\"javascript:alert(1)\" target=\"_blank\" rel=\"noopener noreferrer\">link</a></p>",
    ];
    for source in invalid_sources {
        let body = serde_json::json!({
            "sceneCode": "admin.article_create", "title": "original title", "summary": "original summary",
            "articleTypeId": 1, "termIds": [1], "contentHtml": source,
            "status": "published", "htmlInspection": { "valid": true },
        });
        let response = post_json(PRODUCT_PORT, "/api/admin/articles", &body.to_string());
        assert_eq!(response.status, 200, "{}", response.body);
        let saved = json_of(&response)["data"].clone();
        assert_eq!(saved["status"], "draft");
        assert_eq!(saved["contentHtml"], source);
        assert_eq!(saved["htmlInspection"]["valid"], false);
        assert_eq!(saved["htmlInspection"]["profileVersion"], "article-html/v1");
        let id = saved["id"].as_i64().unwrap();
        let mut invalid_draft_update = body.clone();
        invalid_draft_update["sceneCode"] = "admin.article_update".into();
        invalid_draft_update["id"] = id.into();
        let updated_draft = post_json(
            PRODUCT_PORT,
            "/api/admin/articles",
            &invalid_draft_update.to_string(),
        );
        assert_eq!(updated_draft.status, 200);
        assert_eq!(json_of(&updated_draft)["data"]["contentHtml"], source);
        assert_eq!(
            json_of(&updated_draft)["data"]["htmlInspection"]["valid"],
            false
        );
        let publish = serde_json::json!({ "sceneCode": "admin.article_publish", "id": id, "contentHtml": "<p>forged</p>", "htmlInspection": { "valid": true } });
        let rejected = post_json(PRODUCT_PORT, "/api/admin/articles", &publish.to_string());
        assert_eq!(rejected.status, 422, "{}", rejected.body);
        assert_eq!(json_of(&rejected)["code"], "INVALID_ARTICLE_HTML");
        assert_eq!(
            json_of(&rejected)["data"]["htmlInspection"],
            saved["htmlInspection"]
        );
        let stored = get(
            PRODUCT_PORT,
            &format!("/api/admin/articles?sceneCode=admin.article_detail&id={id}"),
        );
        for field in [
            "title",
            "summary",
            "termIds",
            "articleTypeId",
            "contentHtml",
            "status",
        ] {
            assert_eq!(
                json_of(&stored)["data"][field],
                saved[field],
                "{field} must be preserved"
            );
        }
        assert_eq!(
            get(
                PRODUCT_PORT,
                &format!("/api/public/articles?sceneCode=public.article_detail&id={id}")
            )
            .status,
            404
        );

        let valid = "<h2>Safe</h2><p><a href=\"https://example.com\" target=\"_blank\" rel=\"noopener noreferrer\">reference</a></p>";
        let update = serde_json::json!({ "sceneCode": "admin.article_update", "id": id, "title": "corrected", "summary": "kept", "articleTypeId": 1, "termIds": [1], "contentHtml": valid });
        assert_eq!(
            post_json(PRODUCT_PORT, "/api/admin/articles", &update.to_string()).status,
            200
        );
        assert_eq!(
            post_json(PRODUCT_PORT, "/api/admin/articles", &publish.to_string()).status,
            200
        );
        let mut unsafe_update = update.clone();
        unsafe_update["contentHtml"] = source.into();
        unsafe_update["title"] = "must not persist".into();
        let rejected = post_json(
            PRODUCT_PORT,
            "/api/admin/articles",
            &unsafe_update.to_string(),
        );
        assert_eq!(rejected.status, 422, "{}", rejected.body);
        assert_eq!(json_of(&rejected)["code"], "INVALID_ARTICLE_HTML");
        let public = get(
            PRODUCT_PORT,
            &format!("/api/public/articles?sceneCode=public.article_detail&id={id}"),
        );
        assert_eq!(public.status, 200);
        assert_eq!(json_of(&public)["data"]["contentHtml"], valid);
        assert_eq!(json_of(&public)["data"]["title"], "corrected");
        assert_eq!(json_of(&public)["data"]["status"], "published");
    }

    // Model historical/test data written outside Product, then check every public body route.
    let corrupt = serde_json::json!({ "operation": "article_update", "payload": {
        "id": 12, "title": "legacy unsafe", "summary": "legacy", "article_type_id": 1,
        "term_ids": [], "content_html": "<script>legacy()</script>",
    }});
    assert_eq!(
        post_data_direct(DATA_PORT, &corrupt.to_string(), "legacy-write".to_owned()),
        200
    );
    assert_eq!(
        get(
            PRODUCT_PORT,
            "/api/public/articles?sceneCode=public.article_detail&id=12"
        )
        .status,
        404
    );
    let admin = get(
        PRODUCT_PORT,
        "/api/admin/articles?sceneCode=admin.article_detail&id=12",
    );
    assert_eq!(
        json_of(&admin)["data"]["contentHtml"],
        "<script>legacy()</script>"
    );
    assert_eq!(json_of(&admin)["data"]["htmlInspection"]["valid"], false);
    let current = get(
        PRODUCT_PORT,
        "/api/public/recommendations?sceneCode=public.recommendation_current",
    );
    assert_eq!(current.status, 200);
    assert!(
        json_of(&current)["data"]
            .as_array()
            .unwrap()
            .iter()
            .all(|article| article["id"] != 12)
    );
}
