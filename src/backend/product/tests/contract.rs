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

use product::auth::{
    Argon2idPasswordVerifier, FilesystemRecoveryCodeRepository, FilesystemTotpReplayRepository,
    HmacSha1TotpGenerator, OsRandomSource, RecoveryCodeSet, SecretBytes, SecretString,
    TotpCodeGenerator, encode_base32_no_padding,
};

const DATA_PORT: u16 = 18231;
const PRODUCT_PORT: u16 = 18230;
const DATA_ADDR: &str = "http://127.0.0.1:18231";
const ADMIN_PASSWORD: &str = "product-contract-password";
static ADMIN_COOKIE: Mutex<Option<String>> = Mutex::new(None);

/// Mobile 浏览用例的独立端口（与其他用例并行互不冲突）。
const BROWSE_PRODUCT_PORT: u16 = 18260;
const BROWSE_DATA_PORT: u16 = 18261;
const BROWSE_DATA_ADDR: &str = "http://127.0.0.1:18261";

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
        command.env_remove("BLOG_ADMIN_PASSWORD_HASH");
        command.env_remove("BLOG_ADMIN_TOTP_SECRET");
        command.env_remove("BLOG_ADMIN_RUNTIME_DIR");
        command.env_remove("BLOG_TRUSTED_PROXY_IPS");
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
    headers: String,
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
        headers: head.to_owned(),
        content_type,
        body: body.to_owned(),
    }
}

fn admin_cookie_header(port: u16) -> String {
    if port != PRODUCT_PORT {
        return String::new();
    }
    ADMIN_COOKIE
        .lock()
        .expect("admin cookie lock")
        .as_ref()
        .map(|cookie| format!("Cookie: {cookie}\r\n"))
        .unwrap_or_default()
}

fn get(port: u16, path: &str) -> Response {
    let cookie = admin_cookie_header(port);
    request(
        port,
        &format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\n{cookie}Connection: close\r\n\r\n"),
    )
}

fn post_json(port: u16, path: &str, body: &str) -> Response {
    let cookie = admin_cookie_header(port);
    request(
        port,
        &format!(
            "POST {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\n\
             {cookie}Connection: close\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        ),
    )
}

fn test_auth_environment(workdir: &std::path::Path) -> (Vec<(String, String)>, Vec<u8>) {
    let runtime_dir = workdir.join("admin-auth");
    let mut random = OsRandomSource;
    let password_hash = Argon2idPasswordVerifier::default()
        .hash_password(&SecretString::new(ADMIN_PASSWORD), &mut random)
        .expect("hash test password");
    let totp_secret = vec![11_u8; 20];
    let (recovery, _) = RecoveryCodeSet::generate(&mut random).expect("generate recovery codes");
    FilesystemRecoveryCodeRepository::initialize(&runtime_dir, &recovery)
        .expect("initialize recovery state");
    FilesystemTotpReplayRepository::initialize(&runtime_dir).expect("initialize replay state");
    (
        vec![
            (
                "BLOG_ADMIN_PASSWORD_HASH".to_owned(),
                password_hash.expose().to_owned(),
            ),
            (
                "BLOG_ADMIN_TOTP_SECRET".to_owned(),
                encode_base32_no_padding(&totp_secret),
            ),
            (
                "BLOG_ADMIN_RUNTIME_DIR".to_owned(),
                runtime_dir.to_str().expect("UTF-8 auth path").to_owned(),
            ),
        ],
        totp_secret,
    )
}

fn authenticate_product(totp_secret: &[u8]) {
    let counter = std::time::SystemTime::UNIX_EPOCH
        .elapsed()
        .expect("system clock after epoch")
        .as_secs()
        / product::auth::TOTP_STEP_SECONDS;
    let code = HmacSha1TotpGenerator
        .code_for_counter(&SecretBytes::new(totp_secret.to_vec()), counter)
        .expect("generate TOTP");
    let code = String::from_utf8(code.to_vec()).expect("ASCII TOTP");
    let body = serde_json::json!({
        "sceneCode": "admin.session.create",
        "password": ADMIN_PASSWORD,
        "verification": { "kind": "totp", "code": code },
    })
    .to_string();
    let response = post_json(PRODUCT_PORT, "/api/admin/session", &body);
    assert_eq!(response.status, 200, "login failed: {}", response.body);
    let cookie = response.headers.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.eq_ignore_ascii_case("set-cookie").then(|| {
            value
                .trim()
                .split(';')
                .next()
                .unwrap_or_default()
                .to_owned()
        })
    });
    assert!(cookie.is_some(), "login response must set a cookie");
    *ADMIN_COOKIE.lock().expect("admin cookie lock") = cookie;
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
    *ADMIN_COOKIE.lock().expect("admin cookie lock") = None;
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
        "desktop/pages/admin-article-preview-desktop/index.html",
        "desktop/pages/admin-article-types/index.html",
        "desktop/pages/admin-terms/index.html",
        "mobile/pages/home/index.html",
        "mobile/pages/articles/index.html",
        "mobile/pages/article-list/index.html",
        "mobile/pages/article-detail/index.html",
        "mobile/pages/settings/index.html",
        "mobile/pages/admin-article-preview-content/index.html",
    ] {
        let path = workdir.join(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, format!("<html>{relative}</html>")).unwrap();
    }
    let page_routes = serde_json::json!([
        { "alias": "/", "outputPath": "desktop/pages/public-home/index.html" },
        { "alias": "/articles/index.html", "outputPath": "desktop/pages/public-articles/index.html" },
        { "alias": "/articles/detail.html", "outputPath": "desktop/pages/public-detail/index.html" },
        { "alias": "/admin", "outputPath": "desktop/pages/admin-home/index.html" },
        { "alias": "/admin/", "outputPath": "desktop/pages/admin-home/index.html" },
        { "alias": "/admin/index.html", "outputPath": "desktop/pages/admin-home/index.html" },
        { "alias": "/admin/articles/new.html", "outputPath": "desktop/pages/admin-article-new/index.html" },
        { "alias": "/admin/articles/edit.html", "outputPath": "desktop/pages/admin-article-edit/index.html" },
        { "alias": "/admin/editor-guide/index.html", "outputPath": "desktop/pages/admin-editor-guide/index.html" },
        { "alias": "/admin/article-types/index.html", "outputPath": "desktop/pages/admin-article-types/index.html" },
        { "alias": "/admin/terms/index.html", "outputPath": "desktop/pages/admin-terms/index.html" },
        { "alias": "/admin/articles/preview/desktop.html", "outputPath": "desktop/pages/admin-article-preview-desktop/index.html" },
        { "alias": "/m", "outputPath": "mobile/pages/home/index.html" },
        { "alias": "/m/", "outputPath": "mobile/pages/home/index.html" },
        { "alias": "/m/articles/index.html", "outputPath": "mobile/pages/articles/index.html" },
        { "alias": "/m/articles/list.html", "outputPath": "mobile/pages/article-list/index.html" },
        { "alias": "/m/articles/detail.html", "outputPath": "mobile/pages/article-detail/index.html" },
        { "alias": "/m/settings/index.html", "outputPath": "mobile/pages/settings/index.html" },
        { "alias": "/admin/articles/preview/mobile.html", "outputPath": "mobile/pages/admin-article-preview-content/index.html" },
        { "alias": "/admin/articles/preview/mobile/content.html", "outputPath": "mobile/pages/admin-article-preview-content/index.html" }
    ]);
    std::fs::write(
        workdir.join("page-routes.json"),
        serde_json::to_vec(&page_routes).unwrap(),
    )
    .unwrap();
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

    let (auth_environment, totp_secret) = test_auth_environment(&workdir);
    let product_environment = [("BLOG_DATA_ADDR".to_owned(), DATA_ADDR.to_owned())]
        .into_iter()
        .chain(auth_environment)
        .collect::<Vec<_>>();
    let product_environment = product_environment
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect::<Vec<_>>();
    let mut product = Server::start(
        "product",
        &[
            "--listen",
            &format!("127.0.0.1:{PRODUCT_PORT}"),
            "--web-dir",
            workdir.to_str().unwrap(),
        ],
        &product_environment,
    );
    authenticate_product(&totp_secret);

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
    assert_eq!(terms.len(), 3, "seed has three tags");
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
    assert_eq!(shelf["total"], 45, "夹具全量 published");
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

    // ---------- 旧管理写路径统一退役 ----------
    for (path, body) in [
        (
            "/api/admin/articles",
            r#"{"sceneCode":"admin.article_create","title":"retired","summary":"retired"}"#,
        ),
        (
            "/api/admin/articles",
            r#"{"sceneCode":"admin.article_update","id":1,"title":"retired","summary":"retired"}"#,
        ),
        (
            "/api/admin/articles",
            r#"{"sceneCode":"admin.article_publish","id":1}"#,
        ),
        (
            "/api/admin/articles",
            r#"{"sceneCode":"admin.article_unpublish","id":1}"#,
        ),
        (
            "/api/admin/article-types",
            r#"{"sceneCode":"admin.article_type_create","name":"retired"}"#,
        ),
        (
            "/api/admin/article-types",
            r#"{"sceneCode":"admin.article_type_update","id":1,"name":"retired"}"#,
        ),
        (
            "/api/admin/terms",
            r#"{"sceneCode":"admin.term_create","name":"retired","kind":"tag"}"#,
        ),
        (
            "/api/admin/terms",
            r#"{"sceneCode":"admin.term_update","id":1,"name":"retired"}"#,
        ),
        (
            "/api/admin/recommendations",
            r#"{"sceneCode":"admin.recommendation_generate"}"#,
        ),
    ] {
        let response = post_json(PRODUCT_PORT, path, body);
        assert_eq!(response.status, 410, "{}", response.body);
        assert_eq!(json_of(&response)["code"], "CONTENT_WRITE_RETIRED");
    }

    // Malformed JSON remains a transport error before scene dispatch.
    let response = post_json(PRODUCT_PORT, "/api/admin/articles", "{not json");
    assert_eq!(response.status, 400);
    assert_eq!(json_of(&response)["code"], "INVALID_JSON");

    assert_workspace_article_contract();

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
        // Mobile 平铺页入口。
        (
            "/m/articles/list.html",
            "mobile/pages/article-list/index.html",
        ),
        ("/m/settings/index.html", "mobile/pages/settings/index.html"),
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
            "/admin/articles/preview/desktop.html",
            "desktop/pages/admin-article-preview-desktop/index.html",
        ),
        (
            "/admin/articles/preview/mobile.html",
            "mobile/pages/admin-article-preview-content/index.html",
        ),
        (
            "/admin/articles/preview/mobile/content.html",
            "mobile/pages/admin-article-preview-content/index.html",
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

    // ---------- Product 侧日志 ----------
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
        counted.len() >= 10,
        "expected one log line per API request, got {}",
        counted.len()
    );
    for line in counted {
        assert!(
            line.contains("data_calls=0") || line.contains("data_calls=1"),
            "{line}"
        );
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
    *ADMIN_COOKIE.lock().expect("admin cookie lock") = None;
}

/// 货架分区截断 + 每分区 total，以及新浏览接口的
/// 三维 AND / kind 校验 / 分页边界。
///
/// 与 `full_public_admin_contract_and_static_mount` 隔离：独立端口 + 独立临时库，
/// 并通过管理端补建 3 篇同类型文章把 Engineering 推过 `N = 6`。
#[test]
fn shelf_sections_are_bounded_and_browse_filters_are_and() {
    let workdir = std::env::temp_dir().join(format!("product-browse-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&workdir);
    std::fs::create_dir_all(&workdir).unwrap();
    let db_path = workdir.join("browse.db");

    let mut data = Server::start(
        "data",
        &[
            "--data-semantics",
            "test",
            "--data-database-path",
            db_path.to_str().unwrap(),
            "--listen",
            &format!("127.0.0.1:{BROWSE_DATA_PORT}"),
        ],
        &[],
    );
    data.wait_for_line("listening addr=", Duration::from_secs(10));
    let mut product = Server::start(
        "product",
        &["--listen", &format!("127.0.0.1:{BROWSE_PRODUCT_PORT}")],
        &[("BLOG_DATA_ADDR", BROWSE_DATA_ADDR)],
    );

    // ---------- 货架：分区截断 + 每分区 total ----------
    let shelf = json_of(&get(
        BROWSE_PRODUCT_PORT,
        "/api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf",
    ))["data"]
        .clone();
    let sections = shelf["sections"].as_array().unwrap();
    assert_eq!(sections[0]["id"], "recommendation");
    assert_eq!(
        sections[0]["articles"].as_array().unwrap().len(),
        3,
        "推荐区固定 3 张"
    );
    assert_eq!(sections[0]["total"], 6, "推荐 total 为截断前条数");
    assert_eq!(shelf["total"], 45, "全量文章数，不随分区截断变化");

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
        engineering["total"], 28,
        "分区 total = 该类型全量计数（> N）"
    );
    assert!(
        engineering["total"].as_u64().unwrap() > 6,
        "`total > N` 判定素材：Engineering 需要展示「查看全部」"
    );
    assert_eq!(section_of("type-2")["total"], 12);
    assert_eq!(
        section_of("type-2")["articles"].as_array().unwrap().len(),
        6
    );
    assert_eq!(section_of("type-3")["total"], 5);
    assert_eq!(
        section_of("type-3")["articles"].as_array().unwrap().len(),
        5
    );

    // 响应条数有界：分区数 × (N + 推荐 3) 量级，与文章总量无关。
    let cards: usize = sections
        .iter()
        .map(|section| section["articles"].as_array().unwrap().len())
        .sum();
    assert!(
        cards <= sections.len() * 6 + 3,
        "下发条数必须有界：cards={cards} sections={}",
        sections.len()
    );
    assert_eq!(cards, 20, "3 推荐 + 6 + 6 + 5");

    // 带筛选：无推荐 section，分区截断语义不变。
    let filtered = json_of(&get(
        BROWSE_PRODUCT_PORT,
        "/api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf&type_id=1",
    ))["data"]
        .clone();
    assert_eq!(filtered["hasFilters"], true);
    let filtered_sections = filtered["sections"].as_array().unwrap();
    assert!(!filtered_sections.is_empty());
    assert_eq!(filtered_sections[0]["id"], "type-1");
    assert_eq!(
        filtered_sections[0]["articles"].as_array().unwrap().len(),
        6
    );
    assert_eq!(filtered_sections[0]["total"], 28);

    // ---------- 浏览接口：三维 AND + kind 校验 + 分页 ----------
    let browse = |query: &str| {
        json_of(&get(
            BROWSE_PRODUCT_PORT,
            &format!("/api/public/articles?sceneCode=public.article_browse{query}"),
        ))
    };

    // 空参数 = 全量第 1 页（默认 20 / 上限 100）。
    let before = data_query_total(BROWSE_DATA_PORT);
    let page = browse("");
    assert_eq!(page["code"], "OK");
    let empty = &page["data"];
    assert_eq!(empty["page"], 1);
    assert_eq!(empty["pageSize"], 20);
    assert_eq!(empty["total"], 45, "全部已发布文章");
    assert_eq!(
        empty["items"].as_array().unwrap().len(),
        20,
        "默认一页 20 条"
    );
    assert_eq!(empty["hasMore"], true, "45 > 20 → 「加载更多」");
    assert_eq!(
        data_query_total(BROWSE_DATA_PORT) - before,
        3,
        "count + 当前页 + 批量 terms，与条目数无关"
    );

    // 单维 / 多维 AND。
    let before = data_query_total(BROWSE_DATA_PORT);
    assert_eq!(browse("&type_id=1")["data"]["total"], 28);
    // type_id 走列过滤：count + 当前页 + 批量 terms（固定 3 条，与条目数无关）。
    assert_eq!(data_query_total(BROWSE_DATA_PORT) - before, 3);
    let before = data_query_total(BROWSE_DATA_PORT);
    assert_eq!(browse("&type_id=1&topic_id=1")["data"]["total"], 7);
    // term 维度多一次 kind 校验查询（固定 4 条）。
    assert_eq!(
        data_query_total(BROWSE_DATA_PORT) - before,
        4,
        "term kind 校验 + count + 当前页 + 批量 terms"
    );
    assert_eq!(
        browse("&type_id=1&topic_id=1&tag_id=3")["data"]["total"],
        0,
        "三级 AND"
    );
    // 维度组合错开：Announcements + topic 1 → 空。
    assert_eq!(browse("&type_id=3&topic_id=1")["data"]["total"], 0);

    // kind 不匹配 / term 不存在 → 参数错误（对外沿用 INVALID_JSON + 400）。
    for (query, message) in [
        ("&topic_id=3", "term 3 是 tag"),
        ("&tag_id=1", "term 1 是 topic"),
        ("&topic_id=99999", "term 不存在"),
    ] {
        let response = get(
            BROWSE_PRODUCT_PORT,
            &format!("/api/public/articles?sceneCode=public.article_browse{query}"),
        );
        assert_eq!(response.status, 400, "{message}: {}", response.body);
        assert_eq!(json_of(&response)["code"], "INVALID_JSON", "{message}");
    }

    // 分页边界：page < 1 归一化为 1；pageSize 0 → 默认 20；超上限钳制到 100；越界页为空。
    let page = browse("&page=0&pageSize=0");
    assert_eq!(page["data"]["page"], 1);
    assert_eq!(page["data"]["pageSize"], 20);
    let page = browse("&pageSize=5000");
    assert_eq!(page["data"]["pageSize"], 100, "pageSize 上限 100");
    let page = browse("&page=1&pageSize=2");
    assert_eq!(page["data"]["items"].as_array().unwrap().len(), 2);
    assert_eq!(page["data"]["hasMore"], true, "12 篇 / 每页 2 → 还有更多");
    let page = browse("&page=23&pageSize=2");
    assert_eq!(
        page["data"]["items"].as_array().unwrap().len(),
        1,
        "45 = 22 页 × 2 + 1"
    );
    assert_eq!(page["data"]["hasMore"], false, "最后一页");
    let page = browse("&page=24&pageSize=2");
    assert_eq!(page["data"]["items"].as_array().unwrap().len(), 0);
    assert_eq!(page["data"]["hasMore"], false);
    let page = browse("&page=99");
    assert_eq!(page["data"]["items"].as_array().unwrap().len(), 0);
    assert_eq!(page["data"]["hasMore"], false);
    assert_eq!(page["data"]["total"], 45);

    // ---------- 共享的 `public.article_list` 契约零改动 ----------
    // `term_ids` 仍是同维度 OR；浏览专用参数不会被列表端点解析。
    let list = json_of(&get(
        BROWSE_PRODUCT_PORT,
        "/api/public/articles?sceneCode=public.article_list&term_ids=1,3",
    ));
    assert_eq!(list["data"]["total"], 18, "topic 1 OR tag 3");
    let list = json_of(&get(
        BROWSE_PRODUCT_PORT,
        "/api/public/articles?sceneCode=public.article_list&topic_id=1",
    ));
    assert_eq!(
        list["data"]["total"], 45,
        "列表端点忽略 topic_id（同维度 OR 语义不变）"
    );

    assert!(
        product.child.try_wait().unwrap().is_none() && data.child.try_wait().unwrap().is_none(),
        "neither process may exit during the browse checks"
    );
    let data_ok = data.terminate();
    let product_ok = product.terminate();
    assert!(data_ok, "data exits cleanly on SIGTERM");
    assert!(product_ok, "product exits cleanly on SIGTERM");
    let _ = std::fs::remove_dir_all(&workdir);
}

fn assert_workspace_article_contract() {
    let invalid = serde_json::json!({
        "sceneCode": "admin.content_article_save",
        "expectedVersion": 0,
        "article": {
            "title": "invalid",
            "summary": "invalid",
            "categoryIds": [],
            "tagIds": [],
            "contentHtml": "<script>unsafe()</script>"
        }
    });
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/content/articles",
        &invalid.to_string(),
    );
    assert_eq!(response.status, 422, "{}", response.body);

    let valid = serde_json::json!({
        "sceneCode": "admin.content_article_save",
        "expectedVersion": 0,
        "article": {
            "title": "workspace article",
            "summary": "saved through workspace",
            "categoryIds": [],
            "tagIds": [],
            "contentHtml": "<p>safe</p>"
        }
    });
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/content/articles",
        &valid.to_string(),
    );
    assert_eq!(response.status, 200, "{}", response.body);
    let saved = json_of(&response)["data"].clone();
    assert_eq!(saved["workspace"]["version"], 1);
    assert_eq!(saved["article"]["contentHtml"], "<p>safe</p>");
    let id = saved["article"]["id"].as_i64().unwrap();

    let response = get(
        PRODUCT_PORT,
        &format!("/api/admin/content/articles?sceneCode=admin.content_article_detail&id={id}"),
    );
    assert_eq!(response.status, 200, "{}", response.body);
    assert_eq!(json_of(&response)["data"]["version"], 1);

    let remove = serde_json::json!({
        "sceneCode": "admin.content_article_remove",
        "expectedVersion": 1,
        "articleId": id,
    });
    let response = post_json(
        PRODUCT_PORT,
        "/api/admin/content/articles/remove",
        &remove.to_string(),
    );
    assert_eq!(response.status, 200, "{}", response.body);
    assert_eq!(json_of(&response)["data"]["version"], 2);
}

#[allow(dead_code)]
fn legacy_html_validation_contract() {
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
        let invalid_create = serde_json::json!({
            "sceneCode": "admin.article_create", "title": "invalid", "summary": "invalid",
            "articleTypeId": 1, "termIds": [1], "contentHtml": source,
            "htmlInspection": { "valid": true },
        });
        let rejected = post_json(
            PRODUCT_PORT,
            "/api/admin/articles",
            &invalid_create.to_string(),
        );
        assert_eq!(rejected.status, 422, "{}", rejected.body);
        assert_eq!(json_of(&rejected)["code"], "INVALID_ARTICLE_HTML");
        assert_eq!(json_of(&rejected)["data"]["htmlInspection"]["valid"], false);
        assert_eq!(
            json_of(&rejected)["data"]["htmlInspection"]["profileVersion"],
            "article-html/v1"
        );

        let valid = "<h2>Safe</h2><p><a href=\"https://example.com\" target=\"_blank\" rel=\"noopener noreferrer\">reference</a></p>";
        let create = serde_json::json!({
            "sceneCode": "admin.article_create", "title": "original title", "summary": "original summary",
            "articleTypeId": 1, "termIds": [1], "contentHtml": valid,
        });
        let response = post_json(PRODUCT_PORT, "/api/admin/articles", &create.to_string());
        assert_eq!(response.status, 200, "{}", response.body);
        let saved = json_of(&response)["data"].clone();
        let id = saved["id"].as_i64().unwrap();
        assert_eq!(saved["status"], "draft");
        assert_eq!(saved["contentHtml"], valid);

        let invalid_update = serde_json::json!({
            "sceneCode": "admin.article_update", "id": id, "title": "must not persist",
            "summary": "changed", "articleTypeId": 1, "termIds": [1], "contentHtml": source,
        });
        let rejected = post_json(
            PRODUCT_PORT,
            "/api/admin/articles",
            &invalid_update.to_string(),
        );
        assert_eq!(rejected.status, 422, "{}", rejected.body);
        assert_eq!(json_of(&rejected)["code"], "INVALID_ARTICLE_HTML");
        let stored = get(
            PRODUCT_PORT,
            &format!("/api/admin/articles?sceneCode=admin.article_detail&id={id}"),
        );
        assert_eq!(
            json_of(&stored)["data"],
            saved,
            "failed update preserves the entire saved version"
        );
        assert_eq!(
            get(
                PRODUCT_PORT,
                &format!("/api/public/articles?sceneCode=public.article_detail&id={id}")
            )
            .status,
            404
        );

        let update = serde_json::json!({ "sceneCode": "admin.article_update", "id": id, "title": "corrected", "summary": "kept", "articleTypeId": 1, "termIds": [1], "contentHtml": valid });
        assert_eq!(
            post_json(PRODUCT_PORT, "/api/admin/articles", &update.to_string()).status,
            200
        );
        let publish = serde_json::json!({
            "sceneCode": "admin.article_publish", "id": id,
        });
        assert_eq!(
            post_json(PRODUCT_PORT, "/api/admin/articles", &publish.to_string()).status,
            200
        );
        let rejected = post_json(
            PRODUCT_PORT,
            "/api/admin/articles",
            &invalid_update.to_string(),
        );
        assert_eq!(rejected.status, 422);
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
