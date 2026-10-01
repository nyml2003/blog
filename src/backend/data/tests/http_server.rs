//! Data 进程级集成测试（真实 binary + 真实 HTTP）：
//!
//! - `/healthz`、typed operations 的 envelope 与失败码；
//! - 通道背压：灌满 io lane 后观察到 `503 BACKPRESSURE`，进程不崩溃（FAIL-008）；
//! - 协作式取消：预算耗尽返回 `504`，worker 回到 `recv()` 继续服务；
//! - SIGTERM 关停顺序可从日志读出，正常退出删除 test 临时库（FAIL-009 / MODE-003）；
//! - SIGKILL 异常退出保留临时库供诊断；
//! - mock 语义不创建任何 SQLite 文件（MODE-002）。
//!
//! 测试内自建最小 HTTP/1.1 client（直连 127.0.0.1，不经代理），不引入额外依赖。

use std::io::{BufRead, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

struct Server {
    child: Child,
    port: u16,
    lines: Arc<Mutex<Vec<String>>>,
}

#[test]
fn prod_without_a_database_path_is_a_configuration_error() {
    let output = Command::new(env!("CARGO_BIN_EXE_data"))
        .args(["--data-semantics", "prod"])
        .env_remove("BLOG_DATABASE_PATH")
        .output()
        .expect("data exits before listening");
    assert_eq!(output.status.code(), Some(10));
    assert!(String::from_utf8_lossy(&output.stderr).contains("BLOG_DATABASE_PATH"));
}

impl Server {
    /// 启动 `data` binary；阻塞等待 `listening addr=` 行并解析实际端口。
    fn start(workdir: &Path, args: &[&str]) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_data"))
            .args(args)
            .current_dir(workdir)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .expect("spawn data binary");

        let lines: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        // stdout 与 stderr 都逐行入缓冲：日志契约要求两路都可诊断且不吞行。
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
                let reader = std::io::BufReader::new(stream);
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
                "data did not report its listening address in time; logs: {:?}",
                server.lines()
            );
            std::thread::sleep(Duration::from_millis(20));
        }
        server
    }

    /// 从日志行 `listening addr=127.0.0.1:<port>` 中解析实际绑定端口。
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

    /// 转发线程与子进程退出之间存在竞态：等待某行日志出现后再断言顺序。
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

    fn signal_term(&mut self) -> ExitStatus {
        let pid = self.child.id();
        let delivered = Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .status()
            .expect("run kill");
        assert!(delivered.success(), "failed to deliver SIGTERM to {pid}");
        self.wait()
    }

    fn signal_kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.wait();
    }

    fn wait(&mut self) -> ExitStatus {
        loop {
            match self.child.try_wait().expect("wait for child") {
                Some(status) => return status,
                None => std::thread::sleep(Duration::from_millis(20)),
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
    headers: Vec<(String, String)>,
    body: String,
}

impl Response {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    fn json(&self) -> serde_json::Value {
        serde_json::from_str(&self.body).expect("envelope is valid JSON")
    }
}

fn request(port: u16, raw: &str) -> Response {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect to data");
    stream
        .set_read_timeout(Some(Duration::from_secs(20)))
        .unwrap();
    stream.write_all(raw.as_bytes()).expect("write request");
    let mut raw_response = String::new();
    let _ = stream.read_to_string(&mut raw_response);
    parse_response(&raw_response)
}

fn parse_response(raw: &str) -> Response {
    let (head, body) = raw.split_once("\r\n\r\n").unwrap_or((raw, ""));
    let mut lines = head.split("\r\n");
    let status_line = lines.next().unwrap_or_default();
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse().ok())
        .unwrap_or_default();
    let headers = lines
        .filter_map(|line| line.split_once(": "))
        .map(|(key, value)| (key.to_owned(), value.to_owned()))
        .collect();
    Response {
        status,
        headers,
        body: body.to_owned(),
    }
}

fn post(port: u16, body: &str, extra: &[(&str, String)]) -> Response {
    let mut headers = String::new();
    headers.push_str("Host: 127.0.0.1\r\n");
    headers.push_str("Content-Type: application/json\r\n");
    headers.push_str("Connection: close\r\n");
    for (name, value) in extra {
        headers.push_str(&format!("{name}: {value}\r\n"));
    }
    let raw = format!(
        "POST /data/v1/operations HTTP/1.1\r\n{headers}Content-Length: {}\r\n\r\n{body}",
        body.len()
    );
    request(port, &raw)
}

fn get(port: u16, path: &str) -> Response {
    request(
        port,
        &format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"),
    )
}

fn temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("data-http-{}-{tag}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create workdir");
    dir
}

fn operation(name: &str, payload: &str) -> String {
    format!(r#"{{"operation":"{name}","payload":{payload}}}"#)
}

#[test]
fn endpoints_envelope_backpressure_cancellation_and_shutdown() {
    let workdir = temp_dir("lifecycle");
    let db_path = workdir.join("run.db");
    let mut server = Server::start(
        &workdir,
        &[
            "--data-semantics",
            "test",
            "--data-database-path",
            db_path.to_str().unwrap(),
            "--listen",
            "127.0.0.1:0",
        ],
    );
    let port = server.port;

    // test 语义：启动即建库 + 迁移 + seed。
    assert!(db_path.exists(), "test semantics creates the sqlite file");
    let startup = server.lines();
    assert!(
        startup
            .iter()
            .any(|line| line.contains("migrations applied"))
    );
    assert!(startup.iter().any(|line| line.contains("seed loaded")));
    assert!(startup.iter().all(|line| line.starts_with("[data]")));

    // healthz。
    let response = get(port, "/healthz");
    assert_eq!(response.status, 200);
    assert_eq!(response.body, "ok\n");

    // 合法 typed operation：envelope + 诊断头（查询数固定为 3）。
    let response = post(
        port,
        &operation(
            "article_list",
            r#"{"page":1,"page_size":100,"published_only":true}"#,
        ),
        &[("x-blog-request-id", "req-list-1".to_owned())],
    );
    assert_eq!(response.status, 200);
    let envelope = response.json();
    assert_eq!(envelope["code"], "OK");
    // `data` 内是 adjacent tagged 的 typed outcome：`{ outcome, payload }`。
    assert_eq!(envelope["data"]["outcome"], "article_list");
    let payload = &envelope["data"]["payload"];
    // 夹具全量 published（12 篇头部里的 9 篇 + 36 篇追加）。
    assert_eq!(payload["total"], 45);
    assert_eq!(payload["items"].as_array().unwrap().len(), 45);
    assert_eq!(payload["items"][0]["id"], 48, "updated_at DESC, id DESC");
    assert_eq!(response.header("x-blog-data-query-count"), Some("3"));
    assert_eq!(response.header("x-blog-data-items"), Some("45"));

    // mock 语义下的同一 operation 查询数口径一致（此处为 test 语义，仍为 3）。
    let response = post(
        port,
        &operation("article_type_list", "{}"),
        &[("x-blog-request-id", "req-types".to_owned())],
    );
    assert_eq!(response.status, 200);
    assert_eq!(response.header("x-blog-data-query-count"), Some("1"));

    // 未知 operation / 非法 payload / 非法 JSON。
    let response = post(
        port,
        &operation("table_crud", r#"{"sql":"DROP TABLE"}"#),
        &[],
    );
    assert_eq!(response.status, 400);
    assert_eq!(response.json()["code"], "UNKNOWN_OPERATION");

    let response = post(port, &operation("article_get", r#"{"nope":1}"#), &[]);
    assert_eq!(response.status, 400);
    assert_eq!(response.json()["code"], "INVALID_PAYLOAD");

    let response = post(port, "not-json", &[]);
    assert_eq!(response.status, 400);
    assert_eq!(response.json()["code"], "INVALID_PAYLOAD");

    // 背压：io lane 容量 64 + 8 worker，90 个长任务必然触发拒绝。
    let handles: Vec<_> = (0..90)
        .map(|index| {
            let body = operation("diagnostic_slow", r#"{"batches":6,"batch_ms":60}"#);
            std::thread::spawn(move || {
                post(
                    port,
                    &body,
                    &[("x-blog-request-id", format!("slow-{index}"))],
                )
            })
        })
        .collect();
    let mut backpressure = 0usize;
    for handle in handles {
        let response = handle.join().expect("request thread");
        if response.status == 503 {
            assert_eq!(response.json()["code"], "BACKPRESSURE");
            assert_eq!(response.json()["data"], serde_json::Value::Null);
            backpressure += 1;
        }
    }
    assert!(
        backpressure > 0,
        "expected the saturated lane to reject at least one request"
    );
    // FAIL-008：Product/Data 进程不崩溃、不退出。
    assert!(
        server.child.try_wait().unwrap().is_none(),
        "data must survive saturation"
    );
    // 诊断端点可见 lane 计数。
    let response = get(port, "/data/v1/diagnostics");
    assert_eq!(response.status, 200);
    let diagnostics = response.json()["data"].clone();
    assert_eq!(diagnostics["semantics"], "test");
    assert_eq!(diagnostics["lanes"][0]["capacity"], 64);
    assert!(
        diagnostics["lanes"][0]["rejected"].as_u64().unwrap() >= backpressure as u64,
        "diagnostics must record the rejections"
    );
    assert_eq!(
        diagnostics["database"]["applied_migrations"],
        serde_json::json!([1, 2, 3, 4, 5, 6, 7])
    );
    assert_eq!(diagnostics["database"]["seeded"], true);

    // 协作式取消：预算耗尽 → 504，之后进程继续服务（worker 回到 recv）。
    let response = post(
        port,
        &operation("diagnostic_slow", r#"{"batches":20,"batch_ms":200}"#),
        &[("x-blog-budget-ms", "120".to_owned())],
    );
    assert_eq!(response.status, 504);
    assert_eq!(response.json()["code"], "DEADLINE_EXCEEDED");
    let response = post(
        port,
        &operation("diagnostic_echo", r#"{"message":"ping"}"#),
        &[],
    );
    assert_eq!(response.status, 200);
    assert_eq!(response.json()["data"]["payload"]["message"], "ping");

    // 等待在途任务排空，再触发关停。
    std::thread::sleep(Duration::from_millis(600));
    let status = server.signal_term();
    assert!(status.success(), "clean shutdown exits 0, got {status:?}");

    // 等到关停收尾行出现再取快照，避免与转发线程竞态。
    server.wait_for_line("shutdown complete", Duration::from_secs(5));
    let lines = server.lines();
    let position = |needle: &str| {
        lines
            .iter()
            .position(|line| line.contains(needle))
            .unwrap_or_else(|| panic!("missing log line containing '{needle}'"))
    };
    // FAIL-009：停止 accept → 释放通道句柄 → worker 退出 → 清理，顺序固定。
    let signal = position("signal received signal=SIGTERM");
    let stop_accept = position("phase=1 stop accept");
    let release = position("phase=3 release lane channel handles");
    let workers_exited = position("workers exited 9/9");
    let removed = position("temp db removed");
    assert!(signal < stop_accept);
    assert!(stop_accept < release);
    assert!(release < workers_exited);
    assert!(workers_exited < removed);

    // MODE-003：正常退出删除临时库（含 WAL sidecar）。
    assert!(!db_path.exists(), "clean exit removes the temp db");
    assert!(!workdir.join("run.db-wal").exists());
    let _ = std::fs::remove_dir_all(&workdir);
}

#[test]
fn abnormal_exit_keeps_the_temp_db_for_diagnosis() {
    let workdir = temp_dir("sigkill");
    let db_path = workdir.join("keep.db");
    let mut server = Server::start(
        &workdir,
        &[
            "--data-semantics",
            "test",
            "--data-database-path",
            db_path.to_str().unwrap(),
            "--listen",
            "127.0.0.1:0",
        ],
    );
    assert!(db_path.exists());
    server.signal_kill();
    assert!(
        db_path.exists(),
        "SIGKILL must leave the temp db behind for diagnosis"
    );
    let _ = std::fs::remove_dir_all(&workdir);
}

#[test]
fn mock_semantics_creates_no_sqlite_file() {
    let workdir = temp_dir("mock");
    let mut server = Server::start(
        &workdir,
        &["--data-semantics", "mock", "--listen", "127.0.0.1:0"],
    );
    let port = server.port;
    let lines = server.lines();
    assert!(lines.iter().any(|line| line.contains("sqlite disabled")));
    // 走一次真实请求，确认内存夹具可用且没有任何数据库文件产生。
    let response = post(
        port,
        &operation(
            "article_list",
            r#"{"page":1,"page_size":100,"published_only":true}"#,
        ),
        &[],
    );
    assert_eq!(response.status, 200);
    assert_eq!(response.header("x-blog-data-query-count"), Some("3"));
    let response = get(port, "/data/v1/diagnostics");
    let diagnostics = response.json()["data"].clone();
    assert_eq!(diagnostics["semantics"], "mock");
    assert!(
        diagnostics
            .get("database")
            .map(serde_json::Value::is_null)
            .unwrap_or(true),
        "mock semantics must not expose a database object"
    );

    let mut files = Vec::new();
    collect_files(&workdir, &mut files);
    assert!(
        files.is_empty(),
        "mock semantics must not create any file, found {files:?}"
    );

    let status = server.signal_term();
    assert!(status.success());
    files.clear();
    collect_files(&workdir, &mut files);
    assert!(files.is_empty());
    let _ = std::fs::remove_dir_all(&workdir);
}

fn collect_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files(&path, out);
        } else {
            out.push(path);
        }
    }
}
