use std::collections::BTreeSet;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use protocol::scene;
use serde::Deserialize;

#[derive(Debug, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
struct Route {
    method: String,
    endpoint: String,
    scene_code: String,
}

const GOLDEN_SOURCE: &str = include_str!("../../../../docs/api/routes.json");

fn implemented_routes() -> BTreeSet<Route> {
    scene::ROUTES
        .iter()
        .map(|route| Route {
            method: route.method.to_owned(),
            endpoint: route.endpoint.to_owned(),
            scene_code: route.scene_code.to_owned(),
        })
        .collect()
}

fn golden_routes() -> BTreeSet<Route> {
    serde_json::from_str::<Vec<Route>>(GOLDEN_SOURCE)
        .expect("docs/api/routes.json must be valid")
        .into_iter()
        .collect()
}

#[test]
fn api_route_golden_matches_product_routes_and_protocol_scenes() {
    let golden = golden_routes();
    assert_eq!(golden.len(), 41, "golden routes must be unique");
    assert_eq!(golden, implemented_routes());
}

struct ProductServer {
    child: Child,
    port: u16,
    data_addr: std::net::SocketAddr,
    data_stop: Arc<AtomicBool>,
    data_thread: Option<JoinHandle<()>>,
}

impl ProductServer {
    fn start() -> Self {
        let (data_addr, data_stop, data_thread) = start_data_stub();
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("reserve Product port");
        let port = listener.local_addr().expect("reserved address").port();
        drop(listener);

        let child = Command::new(env!("CARGO_BIN_EXE_product"))
            .args(["--listen", &format!("127.0.0.1:{port}")])
            .env("BLOG_DATA_ADDR", format!("http://{data_addr}"))
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("start Product binary");
        let mut server = Self {
            child,
            port,
            data_addr,
            data_stop,
            data_thread: Some(data_thread),
        };
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if TcpStream::connect(("127.0.0.1", port)).is_ok() {
                return server;
            }
            if let Some(status) = server.child.try_wait().expect("poll Product binary") {
                panic!("Product exited before accepting requests: {status}");
            }
            assert!(
                Instant::now() < deadline,
                "Product did not accept requests within 10 seconds"
            );
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    fn request(&self, route: &Route) -> String {
        let (path, body) = if route.method == "GET" || route.method == "DELETE" {
            (
                format!("{}?sceneCode={}", route.endpoint, route.scene_code),
                String::new(),
            )
        } else {
            (
                route.endpoint.clone(),
                format!(r#"{{"sceneCode":"{}"}}"#, route.scene_code),
            )
        };
        let mut request = format!(
            "{} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n",
            route.method
        );
        if route.method == "POST" {
            request.push_str(&format!(
                "Content-Type: application/json\r\nContent-Length: {}\r\n",
                body.len()
            ));
        }
        request.push_str("\r\n");
        request.push_str(&body);

        let mut stream = TcpStream::connect(("127.0.0.1", self.port)).expect("connect Product");
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .expect("set Product read timeout");
        stream
            .write_all(request.as_bytes())
            .expect("write Product request");
        let mut response = String::new();
        stream
            .read_to_string(&mut response)
            .expect("read Product response");
        response
    }
}

impl Drop for ProductServer {
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
            let content_type = if request.starts_with("GET /healthz ") {
                "text/plain"
            } else {
                "application/json"
            };
            let body = data_stub_body(&request);
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

fn data_stub_body(request: &str) -> String {
    if request.starts_with("GET /healthz ") {
        return "ok\n".to_owned();
    }
    let body = request.split("\r\n\r\n").nth(1).unwrap_or_default();
    let operation: serde_json::Value = serde_json::from_str(body).expect("typed Data request JSON");
    match operation["operation"].as_str() {
        Some("content_workflow_get") => {
            r#"{"code":"OK","message":"","data":{"outcome":"content_workflow","payload":null}}"#
                .to_owned()
        }
        Some("content_snapshot_get") => {
            r#"{"code":"OK","message":"","data":{"outcome":"content_snapshot","payload":null}}"#
                .to_owned()
        }
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
        _ => r#"{"code":"INTERNAL_ERROR","message":"unsupported stub operation","data":null}"#
            .to_owned(),
    }
}

#[test]
fn every_golden_route_reaches_product_dispatch() {
    let server = ProductServer::start();
    for route in golden_routes() {
        let response = server.request(&route);
        let status = response.lines().next().unwrap_or_default();
        assert!(
            !status.contains(" 404 ") && !status.contains(" 405 "),
            "{} {} was not registered: {status}",
            route.method,
            route.endpoint
        );
        assert!(
            !response.contains("UNKNOWN_SCENE_CODE"),
            "{} {} {} was registered but not dispatched",
            route.method,
            route.endpoint,
            route.scene_code
        );
    }
}
