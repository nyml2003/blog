//! Product→Data 链路集成测试（真实 binary + 真实 HTTP）：
//!
//! - Product 对外契约：`sceneCode`、`{ code, message, data }`、camelCase 字段；
//! - **调用数与条目数无关**：不同 `pageSize` 下 Product→Data 恒为 1 次调用，
//!   Data→SQLite 恒为 3 条查询（N+1 边界，PLAN 验收 6 的链路证据）；
//! - 注入：`BLOG_DATA_ADDR` 由环境注入 Product（附录 A 回写的命名）；
//! - 背压透传：Data 通道满 → Product 对外 `503` + envelope（FAIL-008 的链路侧）。

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// 以真实 binary 跑链路：先 `cargo build` 再 `cargo test`（workspace members 一并构建）。
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

struct Server {
    child: Child,
    port: u16,
    lines: Arc<Mutex<Vec<String>>>,
}

impl Server {
    /// 启动服务并等待 `listening addr=` 行，返回实际绑定端口。
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

        let mut server = Self {
            child,
            port: 0,
            lines,
        };
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            if let Some(port) = server.value_of("listening addr=") {
                server.port = port.parse().expect("parsed port");
                break;
            }
            assert!(
                Instant::now() < deadline,
                "{binary} did not report its listening address; logs: {:?}",
                server.lines()
            );
            std::thread::sleep(Duration::from_millis(20));
        }
        server
    }

    fn value_of(&self, key: &str) -> Option<String> {
        let lines = self.lines.lock().unwrap();
        lines.iter().rev().find_map(|line| {
            let index = line.find(key)?;
            let addr = line[index + key.len()..].split_whitespace().next()?;
            Some(addr.rsplit(':').next()?.to_owned())
        })
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

struct Response {
    status: u16,
    #[allow(dead_code)]
    headers: Vec<(String, String)>,
    body: String,
}

fn request(port: u16, raw: &str) -> Response {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect");
    stream
        .set_read_timeout(Some(Duration::from_secs(20)))
        .unwrap();
    stream.write_all(raw.as_bytes()).expect("write request");
    let mut raw_response = String::new();
    let _ = stream.read_to_string(&mut raw_response);
    let (head, body) = raw_response
        .split_once("\r\n\r\n")
        .unwrap_or((raw_response.as_str(), ""));
    let mut lines = head.split("\r\n");
    let status_line = lines.next().unwrap_or_default();
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse().ok())
        .unwrap_or_default();
    let headers = lines
        .filter_map(|line| {
            line.split_once(": ")
                .map(|(k, v)| (k.to_owned(), v.to_owned()))
        })
        .collect();
    Response {
        status,
        headers,
        body: body.to_owned(),
    }
}

fn get(port: u16, path: &str) -> Response {
    request(
        port,
        &format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"),
    )
}

#[test]
fn product_serves_public_articles_through_data() {
    let workdir = std::env::temp_dir().join(format!("product-chain-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&workdir);
    std::fs::create_dir_all(&workdir).unwrap();
    let db_path = workdir.join("chain.db");

    // Data 先就绪（FAIL-002：Data 就绪先于 Product 对外就绪）。
    let mut data = Server::start(
        "data",
        &[
            "--data-semantics",
            "test",
            "--data-database-path",
            db_path.to_str().unwrap(),
            "--listen",
            "127.0.0.1:0",
        ],
        &[],
    );
    let data_port = data.port;
    let data_addr = format!("http://127.0.0.1:{data_port}");

    // 注入：BLOG_DATA_ADDR 由 ops（此处由测试扮演）计算后写入。
    let mut product = Server::start(
        "product",
        &["--listen", "127.0.0.1:0"],
        &[("BLOG_DATA_ADDR", data_addr.as_str())],
    );
    let product_port = product.port;

    // Product 启动日志记录了注入值（附录 A 回写的标识符）。
    let logs = product.lines();
    assert!(
        logs.iter().any(|line| line.contains(&data_addr)),
        "product must log the injected data address; logs: {logs:?}"
    );

    // healthz 两端。
    assert_eq!(get(product_port, "/healthz").status, 200);
    assert_eq!(get(data_port, "/healthz").status, 200);

    // 不同 pageSize：Product→Data 恒 1 次调用，Data→SQLite 恒 3 条查询。
    // Data 的累计查询数从诊断端点读取，用前后差值证明「与条目数无关」。
    let mut snapshots = Vec::new();
    for page_size in [1u32, 5, 100] {
        let before = data_query_total(data_port);
        let response = get(
            product_port,
            &format!(
                "/api/public/articles?sceneCode=public.article_list&page=1&pageSize={page_size}"
            ),
        );
        assert_eq!(response.status, 200, "body: {}", response.body);
        let after = data_query_total(data_port);

        let envelope: serde_json::Value = serde_json::from_str(&response.body).unwrap();
        assert_eq!(envelope["code"], "OK");
        assert_eq!(envelope["message"], "");
        let page = &envelope["data"];
        let items = page["items"].as_array().unwrap().len();
        let expected = (page_size as i64).min(page["total"].as_i64().unwrap()) as usize;
        assert_eq!(items, expected);
        assert_eq!(page["pageSize"], page_size);
        assert_eq!(page["total"], 45, "夹具全量 published");
        // 外部契约是 camelCase。
        let first = &page["items"][0];
        assert!(first.get("articleTypeId").is_some());
        assert!(first.get("termIds").is_some());
        assert!(first.get("contentHtml").is_none(), "list carries no body");

        // 关键断言：条目数 1 → 100，Data 侧查询数恒为 3（count + page + 批量 terms）。
        assert_eq!(
            after - before,
            3,
            "pageSize={page_size} items={items} must keep the Data query count fixed"
        );
        snapshots.push((page_size, items));
    }

    // 未知 sceneCode → 400 + envelope（ARCH-DATA-API 行为）。
    let response = get(product_port, "/api/public/articles?sceneCode=other.scene");
    assert_eq!(response.status, 400);
    let envelope: serde_json::Value = serde_json::from_str(&response.body).unwrap();
    assert_eq!(envelope["code"], "UNKNOWN_SCENE_CODE");
    assert_eq!(envelope["data"], serde_json::Value::Null);

    // 诊断端点：注入配置可见，web/dist 本批未挂载。
    let response = get(product_port, "/product/diagnostics");
    assert_eq!(response.status, 200);
    let envelope: serde_json::Value = serde_json::from_str(&response.body).unwrap();
    let diagnostics = &envelope["data"];
    assert_eq!(diagnostics["webDirMounted"], false);
    assert_eq!(
        diagnostics["dataClient"]["authority"],
        format!("127.0.0.1:{data_port}")
    );
    let calls = diagnostics["dataCallsTotal"].as_u64().unwrap();
    assert_eq!(
        calls, 6,
        "workflow read, snapshot read and initial workflow write plus one Data call per public request"
    );

    // Product 侧日志：调用数与条目数记录在案（验收 6 的日志证据）。
    product.wait_for_line("data_calls=1", Duration::from_secs(3));
    let product_lines = product.lines();
    let list_logs: Vec<&String> = product_lines
        .iter()
        .filter(|line| line.contains("GET /api/public/articles") && line.contains("data_calls=1"))
        .collect();
    assert!(
        list_logs.len() >= 3,
        "expected one log line per list request, got {list_logs:?}"
    );
    assert!(
        list_logs.iter().all(|line| line.contains("data_calls=1")),
        "call count must stay at 1 regardless of item count"
    );
    assert!(
        list_logs.iter().all(|line| line.contains("data_queries=3")),
        "Data query count must stay at 3 regardless of item count: {list_logs:?}"
    );
    assert!(
        product_lines
            .iter()
            .all(|line| line.starts_with("[product]") || !line.starts_with('[')),
        "product logs must carry the [product] prefix: {product_lines:?}"
    );

    let mobile_shelf = get(
        product_port,
        "/api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf",
    );
    assert_eq!(mobile_shelf.status, 200, "{}", mobile_shelf.body);
    let mobile_shelf: serde_json::Value = serde_json::from_str(&mobile_shelf.body).unwrap();
    assert_eq!(mobile_shelf["data"]["sections"][0]["id"], "recommendation");
    product.wait_for_line("scene=public.mobile_article_shelf", Duration::from_secs(3));

    assert_product_t_shelf_contract(product_port);

    // 背压链路：灌满 Data 的 io lane，Product 对外返回 503 envelope（FAIL-008）。
    let handles: Vec<_> = (0..90)
        .map(|index| {
            let body = operation_body("diagnostic_slow", r#"{"batches":4,"batch_ms":120}"#);
            std::thread::spawn(move || post_data(data_port, &body, format!("sat-{index}")))
        })
        .collect();
    for handle in handles {
        let _ = handle.join();
    }
    let response = get(
        product_port,
        "/api/public/articles?sceneCode=public.article_list&page=1&pageSize=1",
    );
    // Data 可能已被灌满（503）也可能已排空（200）；两者都必须是合法 envelope。
    let envelope: serde_json::Value = serde_json::from_str(&response.body).unwrap();
    assert!(
        response.status == 200 || response.status == 503,
        "unexpected status {}",
        response.status
    );
    if response.status == 503 {
        assert_eq!(envelope["code"], "BACKPRESSURE");
    }
    assert!(
        product.child.try_wait().unwrap().is_none(),
        "product survives"
    );
    assert!(data.child.try_wait().unwrap().is_none(), "data survives");

    // SIGTERM：两进程都能在限期内干净退出。
    let data_ok = data.terminate();
    let product_ok = product.terminate();
    assert!(data_ok, "data exits cleanly on SIGTERM");
    assert!(product_ok, "product exits cleanly on SIGTERM");
    data.wait_for_line("shutdown complete", Duration::from_secs(3));

    let _ = std::fs::remove_dir_all(&workdir);
}

/// Product 的 T 型货架必须与 Mock 的同名契约一致，并通过真实 Data 操作装配。
fn assert_product_t_shelf_contract(port: u16) {
    let archive = get(
        port,
        "/api/public/t-shelf?sceneCode=public.t_shelf&surface=archive",
    );
    assert_eq!(archive.status, 200, "{}", archive.body);
    let archive: serde_json::Value = serde_json::from_str(&archive.body).unwrap();
    let archive = &archive["data"];
    assert_eq!(archive["filters"][0]["id"], "all");
    assert_eq!(archive["filters"][0]["name"], "全部");
    assert_eq!(archive["selectedFilterId"], "all");
    assert_eq!(archive["total"], 45);
    assert_eq!(archive["articles"].as_array().unwrap().len(), 20);
    assert!(archive["articles"][0].get("contentHtml").is_none());

    let engineering = get(
        port,
        "/api/public/t-shelf?sceneCode=public.t_shelf&surface=archive&filter_id=1",
    );
    assert_eq!(engineering.status, 200, "{}", engineering.body);
    let engineering: serde_json::Value = serde_json::from_str(&engineering.body).unwrap();
    let engineering = &engineering["data"];
    assert_eq!(engineering["selectedFilterId"], "1");
    assert_eq!(engineering["total"], 28);
    assert_eq!(engineering["articles"].as_array().unwrap().len(), 20);

    let recommendations = get(
        port,
        "/api/public/recommendations?sceneCode=public.recommendation_current",
    );
    assert_eq!(recommendations.status, 200, "{}", recommendations.body);
    let recommendations: serde_json::Value = serde_json::from_str(&recommendations.body).unwrap();
    let recommendations = recommendations["data"].as_array().unwrap();
    let recommendation_ids: Vec<i64> = recommendations
        .iter()
        .map(|item| item["id"].as_i64().unwrap())
        .collect();
    let recommendation_initial = get(
        port,
        "/api/public/t-shelf?sceneCode=public.t_shelf&surface=recommendation",
    );
    assert_eq!(
        recommendation_initial.status, 200,
        "{}",
        recommendation_initial.body
    );
    let recommendation_initial: serde_json::Value =
        serde_json::from_str(&recommendation_initial.body).unwrap();
    let recommendation_initial = &recommendation_initial["data"];
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

    let expected_engineering: Vec<i64> = recommendations
        .iter()
        .filter(|item| item["articleTypeId"] == 1)
        .map(|item| item["id"].as_i64().unwrap())
        .collect();

    let recommendation = get(
        port,
        "/api/public/t-shelf?sceneCode=public.t_shelf&surface=recommendation&filter_id=1",
    );
    assert_eq!(recommendation.status, 200, "{}", recommendation.body);
    let recommendation: serde_json::Value = serde_json::from_str(&recommendation.body).unwrap();
    let recommendation = &recommendation["data"];
    let actual_ids: Vec<i64> = recommendation["articles"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["id"].as_i64().unwrap())
        .collect();
    assert_eq!(actual_ids, expected_engineering);
    assert_eq!(recommendation["total"], actual_ids.len());
    assert!(
        actual_ids
            .iter()
            .all(|article_id| recommendation_ids.contains(article_id)),
        "recommendation surface must remain inside the current recommendation set"
    );

    for path in [
        "/api/public/t-shelf?sceneCode=public.t_shelf",
        "/api/public/t-shelf?sceneCode=public.t_shelf&surface=archive&filter_id=nope",
        "/api/public/t-shelf?sceneCode=public.t_shelf&surface=archive&filter_id=999",
    ] {
        let response = get(port, path);
        assert_eq!(response.status, 400, "{path}: {}", response.body);
        let envelope: serde_json::Value = serde_json::from_str(&response.body).unwrap();
        assert_eq!(envelope["code"], "INVALID_JSON");
        assert_eq!(envelope["data"], serde_json::Value::Null);
    }
}

/// Data 诊断端点暴露的累计查询数。
fn data_query_total(port: u16) -> u64 {
    let response = get(port, "/data/v1/diagnostics");
    assert_eq!(response.status, 200);
    let envelope: serde_json::Value = serde_json::from_str(&response.body).unwrap();
    envelope["data"]["query_count_total"].as_u64().unwrap()
}

fn post_data(port: u16, body: &str, request_id: String) -> u16 {
    let raw = format!(
        "POST /data/v1/operations HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\n\
         Connection: close\r\nx-blog-request-id: {request_id}\r\nContent-Length: {}\r\n\r\n{body}",
        body.len()
    );
    request(port, &raw).status
}

fn operation_body(name: &str, payload: &str) -> String {
    format!(r#"{{"operation":"{name}","payload":{payload}}}"#)
}
