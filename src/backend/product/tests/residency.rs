//! 常驻性回归测试（RUNTIME 端到端发现的 bug）：
//!
//! Product 曾在启动约 5s 后自行 `exit 0`——`tokio::select!` 里残留了
//! `sleep(DRAIN_BUDGET)` 分支，导致排空限时从启动就开始计时。
//! 本测试断言：无信号时 Product 必须跨过 `DRAIN_BUDGET`（5s）继续常驻，
//! 收到 SIGTERM 才按既定顺序退出。

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

const PORT: u16 = 18241;

struct Server {
    child: Child,
    lines: Arc<Mutex<Vec<String>>>,
    data_addr: std::net::SocketAddr,
    data_stop: Arc<AtomicBool>,
    data_thread: Option<JoinHandle<()>>,
}

impl Server {
    fn start() -> Self {
        let (data_addr, data_stop, data_thread) = start_data_stub();
        let path = PathBuf::from(env!("CARGO_TARGET_TMPDIR"))
            .join("..")
            .join("debug")
            .join("product");
        assert!(
            path.exists(),
            "missing product binary at {}",
            path.display()
        );
        let mut child = Command::new(path)
            .arg("--listen")
            .arg(format!("127.0.0.1:{PORT}"))
            .env("BLOG_DATA_ADDR", format!("http://{data_addr}"))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("spawn product");
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
        Self {
            child,
            lines,
            data_addr,
            data_stop,
            data_thread: Some(data_thread),
        }
    }

    fn lines(&self) -> Vec<String> {
        self.lines.lock().unwrap().clone()
    }

    fn alive(&mut self) -> bool {
        self.child.try_wait().expect("poll child").is_none()
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        self.data_stop.store(true, Ordering::Release);
        let _ = TcpStream::connect(self.data_addr);
        if let Some(thread) = self.data_thread.take() {
            let _ = thread.join();
        }
    }
}

fn start_data_stub() -> (std::net::SocketAddr, Arc<AtomicBool>, JoinHandle<()>) {
    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind Data stub");
    let addr = listener.local_addr().expect("Data stub address");
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    let thread = std::thread::spawn(move || {
        for stream in listener.incoming() {
            if thread_stop.load(Ordering::Acquire) {
                break;
            }
            let mut stream = stream.expect("accept Data stub request");
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .expect("set Data stub read timeout");
            let mut request = [0_u8; 8192];
            let read = stream.read(&mut request).expect("read Data stub request");
            let request = String::from_utf8_lossy(&request[..read]);
            let (content_type, body) = if request.starts_with("GET /healthz ") {
                ("text/plain", "ok\n".to_owned())
            } else {
                let payload = request.split("\r\n\r\n").nth(1).unwrap_or_default();
                let operation: serde_json::Value =
                    serde_json::from_str(payload).expect("typed Data request JSON");
                let body = match operation["operation"].as_str() {
                    Some("content_workflow_get") => r#"{"code":"OK","message":"","data":{"outcome":"content_workflow","payload":null}}"#.to_owned(),
                    Some("content_snapshot_get") => r#"{"code":"OK","message":"","data":{"outcome":"content_snapshot","payload":null}}"#.to_owned(),
                    Some("content_workflow_write") => serde_json::json!({
                        "code": "OK",
                        "message": "",
                        "data": {
                            "outcome": "content_workflow",
                            "payload": {
                                "revision": 1,
                                "state": operation["payload"]["state"].clone(),
                            }
                        }
                    })
                    .to_string(),
                    other => panic!("unexpected Data operation: {other:?}"),
                };
                ("application/json", body)
            };
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            stream
                .write_all(response.as_bytes())
                .expect("write Data stub response");
        }
    });
    (addr, stop, thread)
}

#[test]
fn product_stays_resident_across_the_drain_budget_and_exits_on_sigterm() {
    let mut server = Server::start();

    // 等待就绪；Data stub 明确返回空 content snapshot。
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if TcpStream::connect(("127.0.0.1", PORT)).is_ok() {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "product did not start listening; logs: {:?}",
            server.lines()
        );
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(server.alive(), "product must be alive right after startup");

    // 关键断言：跨过 DRAIN_BUDGET（5s）+ 余量仍常驻。
    std::thread::sleep(Duration::from_secs(7));
    assert!(
        server.alive(),
        "product exited on its own before any signal (regression); logs: {:?}",
        server.lines()
    );

    // 期间服务仍可用。
    let mut stream = TcpStream::connect(("127.0.0.1", PORT)).expect("connect");
    stream
        .write_all(b"GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .expect("write request");
    let mut raw = String::new();
    let _ = stream.read_to_string(&mut raw);
    assert!(
        raw.starts_with("HTTP/1.1 200"),
        "healthz must answer: {raw}"
    );

    // SIGTERM → 干净退出 0，顺序完整。
    let pid = server.child.id();
    let _ = Command::new("kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .status();
    let deadline = Instant::now() + Duration::from_secs(8);
    let status = loop {
        match server.child.try_wait().expect("wait for child") {
            Some(status) => break status,
            None if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
            None => panic!("product did not exit after SIGTERM"),
        }
    };
    assert!(status.success(), "clean exit expected, got {status:?}");

    let lines = server.lines();
    let position = |needle: &str| {
        lines
            .iter()
            .position(|line| line.contains(needle))
            .unwrap_or_else(|| panic!("missing log line containing '{needle}'"))
    };
    let signal = position("signal received signal=SIGTERM");
    let stop = position("phase=1 stop accept");
    let drained = position("phase=2 in-flight requests drained");
    let complete = position("shutdown complete");
    assert!(signal < stop && stop < drained && drained < complete);

    // 无任何"排空超时"日志：限时只允许在信号之后起算。
    assert!(
        !lines
            .iter()
            .any(|line| line.contains("drain budget exceeded")),
        "the drain budget must not start before the signal: {lines:?}"
    );
}
