use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use product::auth::{
    Argon2idPasswordVerifier, FilesystemRecoveryCodeRepository, FilesystemTotpReplayRepository,
    HmacSha1TotpGenerator, OsRandomSource, RecoveryCode, RecoveryCodeSet, SecretBytes,
    SecretString, TotpCodeGenerator, encode_base32_no_padding,
};

const ADMIN_PASSWORD: &str = "admin-auth-http-password";

struct Server {
    child: Child,
    port: u16,
    lines: Arc<Mutex<Vec<String>>>,
}

impl Server {
    fn start(binary: &str, args: &[&str], env: &[(&str, &str)]) -> Self {
        let mut command = Command::new(bin_path(binary));
        command
            .args(args)
            .env_remove("BLOG_ADMIN_PASSWORD_HASH")
            .env_remove("BLOG_ADMIN_TOTP_SECRET")
            .env_remove("BLOG_ADMIN_RUNTIME_DIR")
            .env_remove("BLOG_TRUSTED_PROXY_IPS")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (name, value) in env {
            command.env(name, value);
        }
        let mut child = command.spawn().expect("spawn service binary");
        let lines = Arc::new(Mutex::new(Vec::new()));
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
                for line in BufReader::new(stream).lines().map_while(Result::ok) {
                    lines.lock().expect("server log lock").push(line);
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
            if let Some(port) = server.listening_port() {
                server.port = port;
                return server;
            }
            if let Some(status) = server.child.try_wait().expect("poll service") {
                panic!(
                    "{binary} exited before listening ({status}); logs: {:?}",
                    server.logs()
                );
            }
            assert!(
                Instant::now() < deadline,
                "{binary} did not listen; logs: {:?}",
                server.logs()
            );
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    fn listening_port(&self) -> Option<u16> {
        self.logs().iter().rev().find_map(|line| {
            line.split_once("listening addr=")?
                .1
                .split_whitespace()
                .next()?
                .rsplit(':')
                .next()?
                .parse()
                .ok()
        })
    }

    fn logs(&self) -> Vec<String> {
        self.lines.lock().expect("server log lock").clone()
    }

    fn wait_for_log(&self, needle: &str) -> bool {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            if self.logs().iter().any(|line| line.contains(needle)) {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            std::thread::sleep(Duration::from_millis(10));
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
    headers: String,
    body: String,
}

fn bin_path(name: &str) -> PathBuf {
    let path = PathBuf::from(env!("CARGO_TARGET_TMPDIR"))
        .join("..")
        .join("debug")
        .join(name);
    assert!(path.exists(), "missing service binary: {}", path.display());
    path
}

fn request(
    port: u16,
    method: &str,
    path: &str,
    body: Option<&str>,
    cookie: Option<&str>,
    forwarded: bool,
) -> Response {
    let forwarding = if forwarded {
        "X-Forwarded-For: 198.51.100.20\r\nX-Forwarded-Proto: https\r\n"
    } else {
        ""
    };
    request_with_forwarding(port, method, path, body, cookie, forwarding)
}

fn request_with_forwarding(
    port: u16,
    method: &str,
    path: &str,
    body: Option<&str>,
    cookie: Option<&str>,
    forwarding: &str,
) -> Response {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect to service");
    stream
        .set_read_timeout(Some(Duration::from_secs(20)))
        .expect("set response timeout");
    let payload = body.unwrap_or_default();
    let content = body
        .map(|_| {
            format!(
                "Content-Type: application/json\r\nContent-Length: {}\r\n",
                payload.len()
            )
        })
        .unwrap_or_default();
    let cookie = cookie
        .map(|value| format!("Cookie: {value}\r\n"))
        .unwrap_or_default();
    let raw = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\n{content}{cookie}{forwarding}Connection: close\r\n\r\n{payload}"
    );
    stream.write_all(raw.as_bytes()).expect("write request");
    let mut raw_response = String::new();
    stream
        .read_to_string(&mut raw_response)
        .expect("read response");
    let (head, body) = raw_response
        .split_once("\r\n\r\n")
        .unwrap_or((&raw_response, ""));
    let status = head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse().ok())
        .unwrap_or_default();
    Response {
        status,
        headers: head.to_owned(),
        body: body.to_owned(),
    }
}

fn code(response: &Response) -> String {
    serde_json::from_str::<serde_json::Value>(&response.body)
        .unwrap_or_else(|error| panic!("invalid JSON ({error}): {}", response.body))["code"]
        .as_str()
        .expect("response code")
        .to_owned()
}

fn set_cookie(response: &Response) -> &str {
    response
        .headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("set-cookie")
                .then_some(value.trim())
        })
        .expect("Set-Cookie response header")
}

fn cookie_pair(response: &Response) -> String {
    set_cookie(response)
        .split(';')
        .next()
        .expect("cookie pair")
        .to_owned()
}

fn test_auth_environment(root: &Path) -> (Vec<(String, String)>, Vec<u8>, Vec<RecoveryCode>) {
    let runtime_dir = root.join("admin-auth");
    let mut random = OsRandomSource;
    let password_hash = Argon2idPasswordVerifier::default()
        .hash_password(&SecretString::new(ADMIN_PASSWORD), &mut random)
        .expect("hash test password");
    let totp_secret = vec![19_u8; 20];
    let (recovery, recovery_codes) =
        RecoveryCodeSet::generate(&mut random).expect("generate recovery codes");
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
            ("BLOG_TRUSTED_PROXY_IPS".to_owned(), "127.0.0.1".to_owned()),
        ],
        totp_secret,
        recovery_codes,
    )
}

fn login_body(password: &str, totp_secret: &[u8]) -> String {
    let counter = std::time::SystemTime::UNIX_EPOCH
        .elapsed()
        .expect("system clock after epoch")
        .as_secs()
        / product::auth::TOTP_STEP_SECONDS;
    let generated = HmacSha1TotpGenerator
        .code_for_counter(&SecretBytes::new(totp_secret.to_vec()), counter)
        .expect("generate TOTP");
    let code = String::from_utf8(generated.to_vec()).expect("ASCII TOTP");
    serde_json::json!({
        "sceneCode": "admin.session.create",
        "password": password,
        "verification": { "kind": "totp", "code": code },
    })
    .to_string()
}

fn recovery_login_body(password: &str, recovery_code: &RecoveryCode) -> String {
    serde_json::json!({
        "sceneCode": "admin.session.create",
        "password": password,
        "verification": { "kind": "recovery", "code": recovery_code.expose() },
    })
    .to_string()
}

fn environment_refs(environment: &[(String, String)]) -> Vec<(&str, &str)> {
    environment
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect()
}

#[test]
fn credential_helper_refuses_pipes_before_creating_auth_state() {
    let root = std::env::temp_dir().join(format!(
        "product-admin-credential-helper-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).expect("create helper test root");
    let state_dir = root.join("must-not-exist");
    let output = Command::new(bin_path("blog-admin-credentials"))
        .args(["init", "--state-dir"])
        .arg(&state_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .expect("run credential helper with pipes");
    assert_eq!(output.status.code(), Some(20));
    assert!(output.stdout.is_empty());
    assert!(String::from_utf8_lossy(&output.stderr).contains("must be attached to a TTY"));
    assert!(
        !state_dir.exists(),
        "non-TTY helper must not create auth state"
    );
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn admin_http_authentication_is_fail_closed_sliding_and_revocable() {
    let root = std::env::temp_dir().join(format!("product-admin-auth-http-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).expect("create test root");
    let data = Server::start(
        "data",
        &["--listen", "127.0.0.1:0", "--data-semantics", "mock"],
        &[],
    );
    let data_address = format!("http://127.0.0.1:{}", data.port);

    let unavailable = Server::start(
        "product",
        &["--listen", "127.0.0.1:0", "--content-source", "fixture"],
        &[("BLOG_DATA_ADDR", &data_address)],
    );
    assert_eq!(
        request(unavailable.port, "GET", "/healthz", None, None, false).status,
        200
    );
    let api = request(
        unavailable.port,
        "GET",
        "/api/admin/content/workspace?sceneCode=admin.content_workspace",
        None,
        None,
        false,
    );
    assert_eq!(api.status, 503);
    assert_eq!(code(&api), "ADMIN_AUTH_UNAVAILABLE");
    let page = request(unavailable.port, "GET", "/admin", None, None, false);
    assert_eq!(page.status, 302);
    assert!(
        page.headers
            .contains("location: /admin/login.html?next=%2Fadmin")
    );
    let login = request(
        unavailable.port,
        "POST",
        "/api/admin/session",
        Some(
            r#"{"sceneCode":"admin.session.create","password":"x","verification":{"kind":"totp","code":"000000"}}"#,
        ),
        None,
        false,
    );
    assert_eq!(login.status, 503);
    assert_eq!(code(&login), "ADMIN_AUTH_UNAVAILABLE");
    drop(unavailable);

    let (auth_environment, totp_secret, mut recovery_codes) = test_auth_environment(&root);
    let environment = [("BLOG_DATA_ADDR".to_owned(), data_address)]
        .into_iter()
        .chain(auth_environment)
        .collect::<Vec<_>>();
    let configured = Server::start(
        "product",
        &["--listen", "127.0.0.1:0", "--content-source", "fixture"],
        &environment_refs(&environment),
    );
    let anonymous = request(
        configured.port,
        "GET",
        "/api/admin/content/workspace?sceneCode=admin.content_workspace",
        None,
        None,
        false,
    );
    assert_eq!(anonymous.status, 401);
    assert_eq!(code(&anonymous), "ADMIN_AUTH_REQUIRED");

    let login = request(
        configured.port,
        "POST",
        "/api/admin/session",
        Some(&login_body(ADMIN_PASSWORD, &totp_secret)),
        None,
        true,
    );
    assert_eq!(login.status, 200, "{}", login.body);
    let issued_cookie = set_cookie(&login);
    assert!(issued_cookie.contains("HttpOnly"));
    assert!(issued_cookie.contains("SameSite=Strict"));
    assert!(issued_cookie.contains("Max-Age=43200"));
    assert!(issued_cookie.contains("Secure"));
    let cookie = cookie_pair(&login);

    let authenticated = request(
        configured.port,
        "GET",
        "/api/admin/content/workspace?sceneCode=admin.content_workspace",
        None,
        Some(&cookie),
        true,
    );
    assert_eq!(authenticated.status, 200, "{}", authenticated.body);
    assert!(set_cookie(&authenticated).contains("Max-Age=43200"));

    let logout = request(
        configured.port,
        "DELETE",
        "/api/admin/session?sceneCode=admin.session.delete",
        None,
        Some(&cookie),
        true,
    );
    assert_eq!(logout.status, 200, "{}", logout.body);
    assert!(set_cookie(&logout).contains("Max-Age=0"));
    assert!(set_cookie(&logout).contains("Secure"));
    let revoked = request(
        configured.port,
        "GET",
        "/api/admin/content/workspace?sceneCode=admin.content_workspace",
        None,
        Some(&cookie),
        true,
    );
    assert_eq!(revoked.status, 401);
    assert_eq!(code(&revoked), "ADMIN_AUTH_REQUIRED");

    let recovery_code = recovery_codes.remove(0);
    let recovery_login = request(
        configured.port,
        "POST",
        "/api/admin/session",
        Some(&recovery_login_body(ADMIN_PASSWORD, &recovery_code)),
        None,
        true,
    );
    assert_eq!(recovery_login.status, 200, "{}", recovery_login.body);
    let recovery_cookie = cookie_pair(&recovery_login);
    drop(configured);

    let restarted = Server::start(
        "product",
        &["--listen", "127.0.0.1:0", "--content-source", "fixture"],
        &environment_refs(&environment),
    );
    let expired_after_restart = request(
        restarted.port,
        "GET",
        "/api/admin/content/workspace?sceneCode=admin.content_workspace",
        None,
        Some(&recovery_cookie),
        false,
    );
    assert_eq!(expired_after_restart.status, 401);
    assert_eq!(code(&expired_after_restart), "ADMIN_AUTH_REQUIRED");
    let recovery_replay = request(
        restarted.port,
        "POST",
        "/api/admin/session",
        Some(&recovery_login_body(ADMIN_PASSWORD, &recovery_code)),
        None,
        false,
    );
    assert_eq!(recovery_replay.status, 401, "{}", recovery_replay.body);
    assert_eq!(code(&recovery_replay), "ADMIN_AUTH_INVALID");

    let repeated_forwarding = concat!(
        "X-Forwarded-For: 198.51.100.20\r\n",
        "X-Forwarded-For: 203.0.113.9\r\n",
        "X-Forwarded-Proto: https\r\n",
        "X-Forwarded-Proto: http\r\n",
    );
    let repeated_headers_login = request_with_forwarding(
        restarted.port,
        "POST",
        "/api/admin/session",
        Some(&recovery_login_body(
            ADMIN_PASSWORD,
            &recovery_codes.remove(0),
        )),
        None,
        repeated_forwarding,
    );
    assert_eq!(
        repeated_headers_login.status, 200,
        "{}",
        repeated_headers_login.body
    );
    assert!(!set_cookie(&repeated_headers_login).contains("Secure"));
    assert!(
        restarted
            .wait_for_log("event=admin_auth_login outcome=success reason=none client_ip=127.0.0.1")
    );

    let oversized_password = format!("OVERLONG_SECRET_MARKER{}", "x".repeat(1_024));
    for attempt in 1..=5 {
        let rejected = request(
            restarted.port,
            "POST",
            "/api/admin/session",
            Some(&login_body(&oversized_password, &totp_secret)),
            None,
            true,
        );
        if attempt < 5 {
            assert_eq!(rejected.status, 401);
            assert_eq!(code(&rejected), "ADMIN_AUTH_INVALID");
        } else {
            assert_eq!(rejected.status, 429);
            assert_eq!(code(&rejected), "ADMIN_AUTH_RATE_LIMITED");
            assert!(rejected.headers.contains("retry-after: "));
        }
    }
    assert!(
        !restarted
            .logs()
            .join("\n")
            .contains("OVERLONG_SECRET_MARKER")
    );
    drop(restarted);

    let mut untrusted_environment = environment.clone();
    let trusted_proxy = untrusted_environment
        .iter_mut()
        .find(|(name, _)| name == "BLOG_TRUSTED_PROXY_IPS")
        .expect("trusted proxy test setting");
    trusted_proxy.1 = "192.0.2.10".to_owned();
    let untrusted = Server::start(
        "product",
        &["--listen", "127.0.0.1:0", "--content-source", "fixture"],
        &environment_refs(&untrusted_environment),
    );
    let forged_login = request_with_forwarding(
        untrusted.port,
        "POST",
        "/api/admin/session",
        Some(&recovery_login_body(
            ADMIN_PASSWORD,
            &recovery_codes.remove(0),
        )),
        None,
        "X-Forwarded-For: 198.51.100.20\r\nX-Forwarded-Proto: https\r\n",
    );
    assert_eq!(forged_login.status, 200, "{}", forged_login.body);
    assert!(!set_cookie(&forged_login).contains("Secure"));
    assert!(
        untrusted
            .wait_for_log("event=admin_auth_login outcome=success reason=none client_ip=127.0.0.1")
    );
    assert!(!untrusted.logs().join("\n").contains("198.51.100.20"));
    drop(untrusted);

    let mut invalid_phc_environment = environment.clone();
    let password_hash = invalid_phc_environment
        .iter_mut()
        .find(|(name, _)| name == "BLOG_ADMIN_PASSWORD_HASH")
        .expect("password hash test setting");
    password_hash.1 = "$argon2id$invalid".to_owned();
    let invalid_phc = Server::start(
        "product",
        &["--listen", "127.0.0.1:0", "--content-source", "fixture"],
        &environment_refs(&invalid_phc_environment),
    );
    let internal_error = request(
        invalid_phc.port,
        "POST",
        "/api/admin/session",
        Some(&login_body(ADMIN_PASSWORD, &totp_secret)),
        None,
        false,
    );
    assert_eq!(internal_error.status, 503);
    assert_eq!(code(&internal_error), "ADMIN_AUTH_UNAVAILABLE");
    drop(invalid_phc);

    assert_eq!(
        request(data.port, "GET", "/healthz", None, None, false).status,
        200
    );
    drop(data);
    let _ = std::fs::remove_dir_all(root);
}
