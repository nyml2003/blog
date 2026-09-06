//! 进程级集成测试共用的 `mock` binary 测试夹具（真实 binary + 真实 HTTP）。
//!
//! 测试内自建最小 HTTP/1.1 client（直连 127.0.0.1，不经代理），不引入额外依赖；
//! 监听端口用 `--listen 127.0.0.1:0` 由内核分配，测试之间零冲突。

#![allow(dead_code)]

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub struct Server {
    pub child: Child,
    pub port: u16,
    lines: Arc<Mutex<Vec<String>>>,
}

impl Server {
    /// 启动 `mock` binary；阻塞等待 `listening addr=` 行并解析实际端口。
    pub fn start(args: &[&str]) -> Self {
        Self::start_with_env(args, &[])
    }

    /// 带额外环境变量启动（ENV-002：证明场景不读环境变量）。
    pub fn start_with_env(args: &[&str], env: &[(&str, &str)]) -> Self {
        let mut command = Command::new(env!("CARGO_BIN_EXE_mock"));
        command
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (name, value) in env {
            command.env(name, value);
        }
        let mut child = command.spawn().expect("spawn mock binary");

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
                "mock did not report its listening address in time; logs: {:?}",
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

    pub fn lines(&self) -> Vec<String> {
        self.lines.lock().unwrap().clone()
    }

    /// 转发线程与子进程退出之间存在竞态：等待某行日志出现后再断言顺序。
    pub fn wait_for_line(&self, needle: &str, timeout: Duration) {
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

    pub fn signal(&mut self, name: &str) -> ExitStatus {
        let pid = self.child.id();
        let delivered = Command::new("kill")
            .arg(name)
            .arg(pid.to_string())
            .status()
            .expect("run kill");
        assert!(delivered.success(), "failed to deliver {name} to {pid}");
        self.wait()
    }

    pub fn wait(&mut self) -> ExitStatus {
        loop {
            match self.child.try_wait().expect("wait for child") {
                Some(status) => return status,
                None => std::thread::sleep(Duration::from_millis(20)),
            }
        }
    }

    pub fn alive(&mut self) -> bool {
        self.child.try_wait().expect("poll child").is_none()
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub struct Response {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub elapsed_ms: u128,
}

impl Response {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    pub fn json(&self) -> serde_json::Value {
        serde_json::from_str(&self.body).expect("envelope is valid JSON")
    }

    pub fn data(&self) -> serde_json::Value {
        self.json()["data"].clone()
    }

    pub fn code(&self) -> String {
        self.json()["code"].as_str().unwrap_or_default().to_owned()
    }
}

pub fn get(port: u16, path: &str) -> Response {
    request(
        port,
        &format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"),
    )
}

/// `session` 为 `Some` 时带 `X-Blog-Mock-Session` 头。
pub fn get_with(port: u16, path: &str, session: Option<&str>) -> Response {
    let mut headers = String::new();
    if let Some(session) = session {
        headers.push_str(&format!("X-Blog-Mock-Session: {session}\r\n"));
    }
    request(
        port,
        &format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\n{headers}Connection: close\r\n\r\n"),
    )
}

pub fn post(port: u16, path: &str, body: &str, session: Option<&str>) -> Response {
    let mut headers = String::from("Host: 127.0.0.1\r\nContent-Type: application/json\r\n");
    if let Some(session) = session {
        headers.push_str(&format!("X-Blog-Mock-Session: {session}\r\n"));
    }
    request(
        port,
        &format!(
            "POST {path} HTTP/1.1\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        ),
    )
}

/// 公开文章列表路径（场景 × 端点表的第一列）。
pub fn public_list(page_size: u32) -> String {
    format!("/api/public/articles?sceneCode=public.article_list&pageSize={page_size}")
}

pub fn admin_list() -> String {
    "/api/admin/articles?sceneCode=admin.article_list".to_owned()
}

/// 管理 POST 载荷：sceneCode 在 body 里（与 Product 契约一致），
/// `extra` 是其余字段的 `"key":value` 片段（无需自带逗号）。
pub fn article_body(scene: &str, extra: &str) -> String {
    match extra {
        "" => format!(r#"{{"sceneCode":"{scene}"}}"#),
        fields => format!(r#"{{"sceneCode":"{scene}",{fields}}}"#),
    }
}

fn request(port: u16, raw: &str) -> Response {
    let started = Instant::now();
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect to mock");
    stream
        .set_read_timeout(Some(Duration::from_secs(20)))
        .unwrap();
    stream.write_all(raw.as_bytes()).expect("write request");
    let mut raw_response = String::new();
    let _ = stream.read_to_string(&mut raw_response);
    let (head, body) = parse_response(&raw_response);
    Response {
        status: head.status,
        headers: head.headers,
        body,
        elapsed_ms: started.elapsed().as_millis(),
    }
}

struct Head {
    status: u16,
    headers: Vec<(String, String)>,
}

fn parse_response(raw: &str) -> (Head, String) {
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
    (Head { status, headers }, body.to_owned())
}

/// 断言 envelope 形态：`{ code, message, data }` 且 `code`/`message` 顶层字段齐全。
pub fn assert_envelope(response: &Response, expected_code: &str) -> serde_json::Value {
    let envelope = response.json();
    assert_eq!(envelope["code"], expected_code);
    assert!(
        envelope.get("message").is_some(),
        "message is always present"
    );
    assert!(envelope.get("data").is_some(), "data is always present");
    envelope
}

/// 便捷断言：camelCase 字段存在（Mock 的响应必须与 Product 同形）。
pub fn assert_camel_case(item: &serde_json::Value) {
    for key in [
        "articleTypeId",
        "createdAt",
        "updatedAt",
        "termIds",
        "publishedAt",
    ] {
        assert!(item.get(key).is_some(), "expected camelCase field {key}");
    }
    assert!(
        item.get("article_type_id").is_none(),
        "snake_case must not leak to the wire"
    );
}

/// 把查询参数组装成路径（测试里少量使用）。
pub fn query(pairs: &[(&str, &str)]) -> String {
    pairs
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("&")
}
