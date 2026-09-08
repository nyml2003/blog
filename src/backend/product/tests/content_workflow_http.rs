//! Process-level HTTP coverage for the versioned content taxonomy workflow.
//!
//! The Product binary uses its explicit `MockGithub` remote. This test therefore verifies
//! persisted pull-request metadata and failure preservation, not a real GitHub transport.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use product::auth::{
    Argon2idPasswordVerifier, FilesystemRecoveryCodeRepository, FilesystemTotpReplayRepository,
    HmacSha1TotpGenerator, OsRandomSource, RecoveryCodeSet, SecretBytes, SecretString,
    TotpCodeGenerator, encode_base32_no_padding,
};

const WORKSPACE_PATH: &str = "/api/admin/content/workspace?sceneCode=admin.content_workspace";
const PREVIEW_PATH: &str = "/api/admin/content/preview?sceneCode=admin.content_preview";
const ADMIN_PASSWORD: &str = "content-workflow-http-password";
static AUTH_SEQUENCE: AtomicUsize = AtomicUsize::new(1);

fn bin_path(name: &str) -> PathBuf {
    let path = PathBuf::from(env!("CARGO_TARGET_TMPDIR"))
        .join("..")
        .join("debug")
        .join(name);
    assert!(
        path.exists(),
        "missing {name}; run `cargo build --workspace` before this process test (looked at {})",
        path.display()
    );
    path
}

struct Server {
    child: Child,
    port: u16,
    lines: Arc<Mutex<Vec<String>>>,
    admin_cookie: Option<String>,
}

impl Server {
    fn start(binary: &str, args: &[&str], env: &[(&str, &str)]) -> Self {
        let mut command = Command::new(bin_path(binary));
        command
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        command.env_remove("BLOG_CONTENT_REPO");
        command.env_remove("BLOG_CONTENT_TOKEN");
        command.env_remove("BLOG_ADMIN_PASSWORD_HASH");
        command.env_remove("BLOG_ADMIN_TOTP_SECRET");
        command.env_remove("BLOG_ADMIN_RUNTIME_DIR");
        command.env_remove("BLOG_TRUSTED_PROXY_IPS");
        for (key, value) in env {
            command.env(key, value);
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
            admin_cookie: None,
        };
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            if let Some(port) = server.listening_port() {
                server.port = port;
                return server;
            }
            if let Some(status) = server.child.try_wait().expect("poll service binary") {
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
            let suffix = line.split_once("listening addr=")?.1;
            suffix
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

    /// Abrupt termination deliberately preserves a test-semantics SQLite database for reopen.
    fn kill_now(&mut self) {
        if self.child.try_wait().expect("poll child").is_none() {
            self.child.kill().expect("kill child");
            self.child.wait().expect("reap child");
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

fn request(server: &Server, method: &str, path: &str, body: Option<&str>) -> Response {
    request_with_cookie(
        server.port,
        method,
        path,
        body,
        server.admin_cookie.as_deref(),
    )
}

fn request_with_cookie(
    port: u16,
    method: &str,
    path: &str,
    body: Option<&str>,
    cookie: Option<&str>,
) -> Response {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect to service");
    stream
        .set_read_timeout(Some(Duration::from_secs(20)))
        .expect("set response timeout");
    let payload = body.unwrap_or_default();
    let content_headers = if body.is_some() {
        format!(
            "Content-Type: application/json\r\nContent-Length: {}\r\n",
            payload.len()
        )
    } else {
        String::new()
    };
    let cookie_header = cookie
        .map(|value| format!("Cookie: {value}\r\n"))
        .unwrap_or_default();
    let raw = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\n{content_headers}{cookie_header}Connection: close\r\n\r\n{payload}"
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

fn get(server: &Server, path: &str) -> Response {
    request(server, "GET", path, None)
}

fn post(server: &Server, path: &str, body: &serde_json::Value) -> Response {
    let body = body.to_string();
    request(server, "POST", path, Some(&body))
}

fn envelope(response: &Response) -> serde_json::Value {
    serde_json::from_str(&response.body)
        .unwrap_or_else(|error| panic!("invalid response JSON ({error}): {}", response.body))
}

fn assert_failure(response: &Response, status: u16, code: &str) {
    assert_eq!(response.status, status, "body: {}", response.body);
    let body = envelope(response);
    assert_eq!(body["code"], code, "body: {}", response.body);
    assert_eq!(body["data"], serde_json::Value::Null);
}

fn write_model_fixture(root: &Path) -> (PathBuf, PathBuf) {
    let command = root.join("taxonomy-model.sh");
    let mode = root.join("taxonomy-model-mode");
    std::fs::write(&mode, "valid").expect("write model mode");
    std::fs::write(
        &command,
        r#"#!/bin/sh
prompt=$(cat)
mode=$(cat "$BLOG_MODEL_MODE_FILE")
case "$prompt" in
  *"Task: review the normalized applied taxonomy diff exactly once"*)
    printf '%s\n' '{"decision":"approve"}'
    ;;
  *)
    case "$mode" in
      invalid) printf '%s\n' 'not-json' ;;
      noop) printf '%s\n' '{"version":1,"operations":[]}' ;;
      *) printf '%s\n' '{"version":1,"operations":[{"operation":"add_tag","reference":"http-e2e-tag","name":"HTTP E2E"}]}' ;;
    esac
    ;;
esac
"#,
    )
    .expect("write model command");
    let mut permissions = std::fs::metadata(&command)
        .expect("model command metadata")
        .permissions();
    permissions.set_mode(0o700);
    std::fs::set_permissions(&command, permissions).expect("make model command executable");
    (command, mode)
}

fn start_data(database: &Path, listen: &str, semantics: &str) -> Server {
    Server::start(
        "data",
        &[
            "--data-semantics",
            semantics,
            "--data-database-path",
            database.to_str().expect("UTF-8 database path"),
            "--listen",
            listen,
        ],
        &[],
    )
}

fn start_product(data_port: u16, model: &Path, mode: &Path) -> Server {
    let data_addr = format!("http://127.0.0.1:{data_port}");
    let root = model.parent().expect("model fixture parent");
    let (auth_environment, totp_secret) = test_auth_environment(root);
    let environment = [
        ("BLOG_DATA_ADDR".to_owned(), data_addr),
        (
            "BLOG_TAXONOMY_MODEL_PROVIDER".to_owned(),
            "claude-cli".to_owned(),
        ),
        (
            "BLOG_TAXONOMY_MODEL_COMMAND".to_owned(),
            model.to_str().expect("UTF-8 model path").to_owned(),
        ),
        (
            "BLOG_MODEL_MODE_FILE".to_owned(),
            mode.to_str().expect("UTF-8 model mode path").to_owned(),
        ),
    ]
    .into_iter()
    .chain(auth_environment)
    .collect::<Vec<_>>();
    let environment = environment
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect::<Vec<_>>();
    let mut server = Server::start("product", &["--listen", "127.0.0.1:0"], &environment);
    authenticate_product(&mut server, &totp_secret);
    server
}

fn start_product_without_github_credentials(data_port: u16, root: &Path) -> Server {
    let data_addr = format!("http://127.0.0.1:{data_port}");
    let (auth_environment, totp_secret) = test_auth_environment(root);
    let environment = [("BLOG_DATA_ADDR".to_owned(), data_addr)]
        .into_iter()
        .chain(auth_environment)
        .collect::<Vec<_>>();
    let environment = environment
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect::<Vec<_>>();
    let mut server = Server::start(
        "product",
        &["--listen", "127.0.0.1:0", "--content-source", "github"],
        &environment,
    );
    authenticate_product(&mut server, &totp_secret);
    server
}

fn test_auth_environment(root: &Path) -> (Vec<(String, String)>, Vec<u8>) {
    let sequence = AUTH_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let runtime_dir = root.join(format!("auth-{}-{sequence}", std::process::id()));
    let mut random = OsRandomSource;
    let password_hash = Argon2idPasswordVerifier::default()
        .hash_password(&SecretString::new(ADMIN_PASSWORD), &mut random)
        .expect("hash test password");
    let totp_secret = vec![7_u8; 20];
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

fn authenticate_product(server: &mut Server, totp_secret: &[u8]) {
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
    let response =
        request_with_cookie(server.port, "POST", "/api/admin/session", Some(&body), None);
    assert_eq!(response.status, 200, "login failed: {}", response.body);
    server.admin_cookie = response.headers.lines().find_map(|line| {
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
    assert!(
        server.admin_cookie.is_some(),
        "login response must set a cookie"
    );
}

fn analyze(server: &Server, version: u64) -> Response {
    post(
        server,
        "/api/admin/content/taxonomy/analyze",
        &serde_json::json!({
            "sceneCode": "admin.content_taxonomy_analyze",
            "expectedVersion": version,
            "articleIds": [11],
        }),
    )
}

#[test]
fn taxonomy_workflow_survives_process_restarts_and_fails_closed() {
    let root = std::env::temp_dir().join(format!(
        "product-content-workflow-http-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).expect("create fixture directory");
    let database = root.join("content.db");
    let (model_command, model_mode) = write_model_fixture(&root);

    let mut data = start_data(&database, "127.0.0.1:0", "test");
    let mut data_port = data.port;
    let mut product = start_product(data_port, &model_command, &model_mode);

    let workspace = get(&product, WORKSPACE_PATH);
    assert_eq!(workspace.status, 200, "{}", workspace.body);
    let workspace = envelope(&workspace);
    assert_eq!(workspace["code"], "OK");
    assert_eq!(workspace["data"]["version"], 0);
    assert_eq!(workspace["data"]["status"], "clean");
    assert_eq!(workspace["data"]["pullRequest"], serde_json::Value::Null);

    assert_failure(&analyze(&product, 99), 409, "WORKSPACE_VERSION_CONFLICT");
    let empty_analysis = post(
        &product,
        "/api/admin/content/taxonomy/analyze",
        &serde_json::json!({
            "sceneCode": "admin.content_taxonomy_analyze",
            "expectedVersion": 0,
            "articleIds": [],
        }),
    );
    assert_failure(&empty_analysis, 400, "INVALID_PAYLOAD");

    std::fs::write(&model_mode, "invalid").expect("select invalid model output");
    assert_failure(&analyze(&product, 0), 502, "TAXONOMY_MODEL_ERROR");
    std::fs::write(&model_mode, "noop").expect("select no-op model output");
    assert_failure(&analyze(&product, 0), 502, "TAXONOMY_MODEL_ERROR");

    std::fs::write(&model_mode, "valid").expect("select valid model output");
    let analyzed = analyze(&product, 0);
    assert_eq!(analyzed.status, 200, "{}", analyzed.body);
    let preview = get(&product, PREVIEW_PATH);
    assert_eq!(preview.status, 200, "{}", preview.body);
    let preview = envelope(&preview);
    assert_eq!(preview["code"], "OK");
    assert!(
        preview["data"]["diff"]
            .as_str()
            .is_some_and(|diff| !diff.is_empty()),
        "analyzed preview must expose the normalized diff: {preview}"
    );
    assert!(
        preview["data"]["taxonomy"]["tags"]
            .as_array()
            .is_some_and(|tags| tags.iter().any(|tag| tag["name"] == "HTTP E2E"))
    );

    let submit_before_review = post(
        &product,
        "/api/admin/content/submit",
        &serde_json::json!({
            "sceneCode": "admin.content_submit",
            "expectedVersion": 0,
        }),
    );
    assert_failure(&submit_before_review, 409, "PENDING_REVIEW_REQUIRED");

    // Both processes are restarted on the same SQLite file while review is pending.
    product.kill_now();
    data.kill_now();
    data = start_data(&database, &format!("127.0.0.1:{data_port}"), "prod");
    data_port = data.port;
    product = start_product(data_port, &model_command, &model_mode);
    let recovered_preview = get(&product, PREVIEW_PATH);
    assert_eq!(recovered_preview.status, 200, "{}", recovered_preview.body);
    assert_eq!(
        envelope(&recovered_preview)["data"]["diff"],
        preview["data"]["diff"],
        "pending analysis must be reconstructed from the persisted Data workflow"
    );

    let reviewed = post(
        &product,
        "/api/admin/content/taxonomy/review",
        &serde_json::json!({
            "sceneCode": "admin.content_taxonomy_review",
            "expectedVersion": 0,
        }),
    );
    assert_eq!(reviewed.status, 200, "{}", reviewed.body);
    let reviewed = envelope(&reviewed);
    assert_eq!(reviewed["data"]["version"], 1);
    assert_eq!(reviewed["data"]["status"], "saved");

    let submitted = post(
        &product,
        "/api/admin/content/submit",
        &serde_json::json!({
            "sceneCode": "admin.content_submit",
            "expectedVersion": 1,
        }),
    );
    assert_eq!(submitted.status, 200, "{}", submitted.body);
    let submitted = envelope(&submitted);
    assert_eq!(submitted["data"]["status"], "submitted");
    let pull_request = submitted["data"]["pullRequest"].clone();
    assert_eq!(pull_request["number"], 1);
    assert!(
        pull_request["branch"]
            .as_str()
            .is_some_and(|branch| branch.starts_with("blog-content/v1-"))
    );
    assert_eq!(pull_request["commit"], "mock-commit-1");

    // Reopen Data again and prove active-batch metadata is still Product-visible.
    product.kill_now();
    data.kill_now();
    data = start_data(&database, &format!("127.0.0.1:{data_port}"), "prod");
    data_port = data.port;
    product = start_product(data_port, &model_command, &model_mode);
    let recovered_workspace = get(&product, WORKSPACE_PATH);
    assert_eq!(
        recovered_workspace.status, 200,
        "{}",
        recovered_workspace.body
    );
    let recovered_workspace = envelope(&recovered_workspace);
    assert_eq!(recovered_workspace["data"]["status"], "submitted");
    assert_eq!(recovered_workspace["data"]["pullRequest"], pull_request);

    for (path, scene) in [
        ("/api/admin/articles", "admin.article_create"),
        ("/api/admin/article-types", "admin.article_type_create"),
        ("/api/admin/terms", "admin.term_create"),
        (
            "/api/admin/recommendations",
            "admin.recommendation_generate",
        ),
    ] {
        let retired = post(&product, path, &serde_json::json!({ "sceneCode": scene }));
        assert_failure(&retired, 410, "CONTENT_WRITE_RETIRED");
    }

    // MockGithub has no configured main snapshot in the binary. A failed sync must preserve the
    // last successful Data snapshot rather than clearing or partially replacing public content.
    let public_before = get(
        &product,
        "/api/public/taxonomy?sceneCode=public.taxonomy_tree",
    );
    assert_eq!(public_before.status, 200, "{}", public_before.body);
    let failed_sync = post(
        &product,
        "/api/admin/content/sync",
        &serde_json::json!({ "sceneCode": "admin.content_sync" }),
    );
    assert_failure(&failed_sync, 502, "CONTENT_REMOTE_ERROR");
    let sync_status = get(
        &product,
        "/api/admin/content/sync?sceneCode=admin.content_sync_status",
    );
    assert_eq!(sync_status.status, 200, "{}", sync_status.body);
    assert_eq!(envelope(&sync_status)["data"]["status"], "failed");
    assert!(envelope(&sync_status)["data"]["message"].is_string());
    let public_after = get(
        &product,
        "/api/public/taxonomy?sceneCode=public.taxonomy_tree",
    );
    assert_eq!(public_after.status, 200, "{}", public_after.body);
    assert_eq!(
        envelope(&public_after)["data"],
        envelope(&public_before)["data"]
    );

    // A persistence failure rolls the mutation back and permanently closes writes in-process.
    let mut renamed_taxonomy = recovered_workspace["data"]["taxonomy"].clone();
    renamed_taxonomy["tags"][0]["name"] = serde_json::Value::String("runtime-renamed".into());
    data.kill_now();
    let persistence_failure = post(
        &product,
        "/api/admin/content/taxonomy",
        &serde_json::json!({
            "sceneCode": "admin.content_taxonomy_save",
            "expectedVersion": 1,
            "taxonomy": renamed_taxonomy,
        }),
    );
    assert_failure(&persistence_failure, 503, "CONTENT_PERSISTENCE_UNAVAILABLE");
    data = start_data(&database, &format!("127.0.0.1:{data_port}"), "prod");
    let fail_closed = analyze(&product, 1);
    assert_failure(&fail_closed, 503, "CONTENT_PERSISTENCE_UNAVAILABLE");
    let rolled_back = get(&product, WORKSPACE_PATH);
    assert_eq!(rolled_back.status, 200, "{}", rolled_back.body);
    let rolled_back = envelope(&rolled_back);
    assert_eq!(rolled_back["data"]["version"], 1);
    assert_eq!(rolled_back["data"]["pullRequest"], pull_request);

    product.kill_now();
    data.kill_now();
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn github_mode_without_credentials_serves_the_data_last_good_snapshot() {
    let root = std::env::temp_dir().join(format!(
        "product-content-unavailable-github-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).expect("create fixture directory");
    let database = root.join("content.db");
    let mut data = start_data(&database, "127.0.0.1:0", "test");
    let mut product = start_product_without_github_credentials(data.port, &root);

    let articles = get(
        &product,
        "/api/public/articles?sceneCode=public.article_list",
    );
    assert_eq!(articles.status, 200, "{}", articles.body);
    assert!(
        envelope(&articles)["data"]["items"]
            .as_array()
            .is_some_and(|items| !items.is_empty()),
        "preloaded Data content must remain public"
    );
    let sync = get(
        &product,
        "/api/admin/content/sync?sceneCode=admin.content_sync_status",
    );
    assert_eq!(sync.status, 200, "{}", sync.body);
    assert_eq!(envelope(&sync)["data"]["status"], "failed");

    product.kill_now();
    data.kill_now();
    let _ = std::fs::remove_dir_all(root);
}

struct FailOnceRemote {
    attempts: Arc<AtomicUsize>,
    fallback: product::github::MockGithub,
}

impl product::github::ContentRemote for FailOnceRemote {
    fn read_main_snapshot(
        &mut self,
    ) -> Result<product::github::RemoteMainSnapshot, product::github::RemoteError> {
        Err(product::github::RemoteError::new("not used"))
    }

    fn submit_batch(
        &mut self,
        snapshot: &protocol::ContentSnapshot,
        existing: Option<&product::github::RemoteBatch>,
        intent: &product::github::RemoteSubmitIntent,
    ) -> Result<product::github::RemoteSubmission, product::github::RemoteError> {
        if self.attempts.fetch_add(1, Ordering::SeqCst) == 0 {
            return Err(product::github::RemoteError::new(
                "temporary recovery outage",
            ));
        }
        product::github::ContentRemote::submit_batch(&mut self.fallback, snapshot, existing, intent)
    }

    fn batch_state(
        &mut self,
        _: &product::github::RemoteBatch,
    ) -> Result<product::github::RemoteBatchState, product::github::RemoteError> {
        Ok(product::github::RemoteBatchState::Open)
    }

    fn close_batch(
        &mut self,
        _: &product::github::RemoteBatch,
    ) -> Result<(), product::github::RemoteError> {
        Ok(())
    }
}

#[test]
fn transient_startup_recovery_failure_can_retry_in_the_same_process() {
    let root = std::env::temp_dir().join(format!(
        "product-content-recovery-retry-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).expect("create fixture directory");
    let database = root.join("content.db");
    let mut data_server = start_data(&database, "127.0.0.1:0", "test");
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        let data = product::data_client::DataClient::new(&format!(
            "http://127.0.0.1:{}",
            data_server.port
        ))
        .unwrap();
        let stored = data
            .call(
                "test-snapshot",
                &protocol::DataOperation::ContentSnapshotGet,
                Duration::from_secs(5),
            )
            .await
            .unwrap();
        let protocol::DataOutcome::ContentSnapshot(Some(public)) = stored.outcome else {
            panic!("test Data must expose its stored content snapshot");
        };
        let mut target = public.snapshot.clone();
        target.articles[0].meta.title.push_str(" recovered");
        let digest = product::github::snapshot_digest(&target).unwrap();
        let version = 7;
        let state = protocol::ContentWorkflowState {
            workspace_version: version,
            committed_version: None,
            status: protocol::ContentWorkspaceStatus::Submitting,
            snapshot: target.clone(),
            committed_snapshot: public.snapshot.clone(),
            batch_base_snapshot: public.snapshot.clone(),
            remote_batch: None,
            last_error: None,
            known_article_ids: target
                .articles
                .iter()
                .map(|article| article.meta.id)
                .collect(),
            pending_taxonomy_review: None,
            source_commit: Some(public.commit.clone()),
            pending_remote_operation: Some(protocol::ContentRemoteOperation {
                kind: protocol::ContentRemoteOperationKind::Submit,
                workspace_version: version,
                branch: product::github::managed_branch(version, &digest),
                base_commit: public.commit,
                target_digest: digest,
            }),
            sync: protocol::ContentSyncState::default(),
        };
        data.call(
            "seed-pending",
            &protocol::DataOperation::ContentWorkflowWrite(Box::new(
                protocol::ContentWorkflowWrite {
                    expected_revision: None,
                    state,
                },
            )),
            Duration::from_secs(5),
        )
        .await
        .unwrap();

        let attempts = Arc::new(AtomicUsize::new(0));
        let service = product::content_service::ContentService::load(
            data,
            FailOnceRemote {
                attempts: Arc::clone(&attempts),
                fallback: product::github::MockGithub::default(),
            },
            Box::new(product::model_review::UnavailableModel::new("test")),
        )
        .await
        .unwrap();
        assert_eq!(
            service.view().status,
            product::content_workspace::WorkspaceStatus::Failed
        );
        let retried = service.submit(version).await.unwrap();
        assert_eq!(
            retried.status,
            product::content_workspace::WorkspaceStatus::Submitted
        );
        assert_eq!(attempts.load(Ordering::SeqCst), 2);
    });
    data_server.kill_now();
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn restart_completes_a_legacy_local_discard_without_remote_intent() {
    let root = std::env::temp_dir().join(format!(
        "product-content-local-discard-restart-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).expect("create fixture directory");
    let database = root.join("content.db");
    let mut data_server = start_data(&database, "127.0.0.1:0", "test");
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        let data = product::data_client::DataClient::new(&format!(
            "http://127.0.0.1:{}",
            data_server.port
        ))
        .unwrap();
        let stored = data
            .call(
                "test-snapshot",
                &protocol::DataOperation::ContentSnapshotGet,
                Duration::from_secs(5),
            )
            .await
            .unwrap();
        let protocol::DataOutcome::ContentSnapshot(Some(public)) = stored.outcome else {
            panic!("test Data must expose its stored content snapshot");
        };
        let mut changed = public.snapshot.clone();
        changed.articles[0].meta.title.push_str(" local draft");
        let version = 9;
        data.call(
            "seed-local-discard",
            &protocol::DataOperation::ContentWorkflowWrite(Box::new(
                protocol::ContentWorkflowWrite {
                    expected_revision: None,
                    state: protocol::ContentWorkflowState {
                        workspace_version: version,
                        committed_version: None,
                        status: protocol::ContentWorkspaceStatus::Discarding,
                        snapshot: changed,
                        committed_snapshot: public.snapshot.clone(),
                        batch_base_snapshot: public.snapshot.clone(),
                        remote_batch: None,
                        last_error: None,
                        known_article_ids: public
                            .snapshot
                            .articles
                            .iter()
                            .map(|article| article.meta.id)
                            .collect(),
                        pending_taxonomy_review: None,
                        source_commit: Some(public.commit),
                        pending_remote_operation: None,
                        sync: protocol::ContentSyncState::default(),
                    },
                },
            )),
            Duration::from_secs(5),
        )
        .await
        .unwrap();

        let service = product::content_service::ContentService::load(
            data.clone(),
            product::github::MockGithub::default(),
            Box::new(product::model_review::UnavailableModel::new("test")),
        )
        .await
        .unwrap();
        let view = service.view();
        assert_eq!(
            view.status,
            product::content_workspace::WorkspaceStatus::Clean
        );
        assert_eq!(view.version, version + 1);
        assert_eq!(view.snapshot, public.snapshot);

        let persisted = data
            .call(
                "verify-local-discard",
                &protocol::DataOperation::ContentWorkflowGet,
                Duration::from_secs(5),
            )
            .await
            .unwrap();
        let protocol::DataOutcome::ContentWorkflow(Some(persisted)) = persisted.outcome else {
            panic!("recovered workflow must be persisted");
        };
        assert_eq!(
            persisted.state.status,
            protocol::ContentWorkspaceStatus::Clean
        );
        assert!(persisted.state.pending_remote_operation.is_none());
    });
    data_server.kill_now();
    let _ = std::fs::remove_dir_all(root);
}

#[derive(Default)]
struct UnknownSubmitState {
    batch: Option<product::github::RemoteBatch>,
    submit_calls: usize,
    close_calls: usize,
}

struct UnknownSubmitRemote {
    state: Arc<Mutex<UnknownSubmitState>>,
}

impl product::github::ContentRemote for UnknownSubmitRemote {
    fn read_main_snapshot(
        &mut self,
    ) -> Result<product::github::RemoteMainSnapshot, product::github::RemoteError> {
        Err(product::github::RemoteError::new("not used"))
    }

    fn submit_batch(
        &mut self,
        _snapshot: &protocol::ContentSnapshot,
        _existing: Option<&product::github::RemoteBatch>,
        intent: &product::github::RemoteSubmitIntent,
    ) -> Result<product::github::RemoteSubmission, product::github::RemoteError> {
        let mut state = self.state.lock().unwrap();
        state.submit_calls += 1;
        let batch = state
            .batch
            .get_or_insert_with(|| product::github::RemoteBatch {
                branch: intent.branch.clone(),
                pull_request: 41,
                commit: "remote-commit-41".into(),
                base_commit: intent.base_commit.clone(),
            })
            .clone();
        if state.submit_calls == 1 {
            return Err(product::github::RemoteError::new(
                "response lost after pull request creation",
            ));
        }
        Ok(product::github::RemoteSubmission { batch })
    }

    fn batch_state(
        &mut self,
        _batch: &product::github::RemoteBatch,
    ) -> Result<product::github::RemoteBatchState, product::github::RemoteError> {
        Ok(product::github::RemoteBatchState::Open)
    }

    fn close_batch(
        &mut self,
        batch: &product::github::RemoteBatch,
    ) -> Result<(), product::github::RemoteError> {
        let mut state = self.state.lock().unwrap();
        if state.batch.as_ref() != Some(batch) {
            return Err(product::github::RemoteError::new(
                "attempted to close an unknown batch",
            ));
        }
        state.close_calls += 1;
        Ok(())
    }
}

#[test]
fn abandon_recovers_an_unknown_submit_result_before_closing_the_remote_batch() {
    let root = std::env::temp_dir().join(format!(
        "product-content-abandon-unknown-submit-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();
    let mut data_server = start_data(&root.join("content.db"), "127.0.0.1:0", "test");
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        let data = product::data_client::DataClient::new(&format!(
            "http://127.0.0.1:{}",
            data_server.port
        ))
        .unwrap();
        let stored = data
            .call(
                "abandon-source",
                &protocol::DataOperation::ContentSnapshotGet,
                Duration::from_secs(5),
            )
            .await
            .unwrap();
        let protocol::DataOutcome::ContentSnapshot(Some(public)) = stored.outcome else {
            panic!("test Data must expose a snapshot");
        };
        let mut target = public.snapshot.clone();
        target.articles[0].meta.title.push_str(" pending");
        target.articles[0].meta.updated_at = "2026-09-08T01:00:00Z".into();
        let digest = product::github::snapshot_digest(&target).unwrap();
        let version = 13;
        data.call(
            "abandon-seed-pending-submit",
            &protocol::DataOperation::ContentWorkflowWrite(Box::new(
                protocol::ContentWorkflowWrite {
                    expected_revision: None,
                    state: protocol::ContentWorkflowState {
                        workspace_version: version,
                        committed_version: None,
                        status: protocol::ContentWorkspaceStatus::Submitting,
                        snapshot: target.clone(),
                        committed_snapshot: public.snapshot.clone(),
                        batch_base_snapshot: public.snapshot.clone(),
                        remote_batch: None,
                        last_error: None,
                        known_article_ids: target
                            .articles
                            .iter()
                            .map(|article| article.meta.id)
                            .collect(),
                        pending_taxonomy_review: None,
                        source_commit: Some(public.commit.clone()),
                        pending_remote_operation: Some(protocol::ContentRemoteOperation {
                            kind: protocol::ContentRemoteOperationKind::Submit,
                            workspace_version: version,
                            branch: product::github::managed_branch(version, &digest),
                            base_commit: public.commit,
                            target_digest: digest,
                        }),
                        sync: protocol::ContentSyncState::default(),
                    },
                },
            )),
            Duration::from_secs(5),
        )
        .await
        .unwrap();
        let remote_state = Arc::new(Mutex::new(UnknownSubmitState::default()));
        let service = product::content_service::ContentService::load(
            data.clone(),
            UnknownSubmitRemote {
                state: Arc::clone(&remote_state),
            },
            Box::new(product::model_review::UnavailableModel::new("test")),
        )
        .await
        .unwrap();
        assert_eq!(
            service.view().status,
            product::content_workspace::WorkspaceStatus::Failed
        );
        let abandoned = service.abandon(version).await.unwrap();
        assert_eq!(
            abandoned.status,
            product::content_workspace::WorkspaceStatus::Clean
        );
        assert_eq!(abandoned.snapshot, public.snapshot);
        let (submit_calls, close_calls) = {
            let state = remote_state.lock().unwrap();
            (state.submit_calls, state.close_calls)
        };
        assert_eq!(submit_calls, 2);
        assert_eq!(close_calls, 1);
        let persisted = data
            .call(
                "abandon-verify-workflow",
                &protocol::DataOperation::ContentWorkflowGet,
                Duration::from_secs(5),
            )
            .await
            .unwrap();
        let protocol::DataOutcome::ContentWorkflow(Some(persisted)) = persisted.outcome else {
            panic!("workflow must remain persisted");
        };
        assert!(persisted.state.pending_remote_operation.is_none());
        assert!(persisted.state.remote_batch.is_none());
    });
    data_server.kill_now();
    let _ = std::fs::remove_dir_all(root);
}

struct MergeBetweenReadsRemote {
    reads: Arc<AtomicUsize>,
    before_merge: product::github::RemoteMainSnapshot,
    after_merge: product::github::RemoteMainSnapshot,
}

impl product::github::ContentRemote for MergeBetweenReadsRemote {
    fn read_main_snapshot(
        &mut self,
    ) -> Result<product::github::RemoteMainSnapshot, product::github::RemoteError> {
        if self.reads.fetch_add(1, Ordering::SeqCst) == 0 {
            Ok(self.before_merge.clone())
        } else {
            Ok(self.after_merge.clone())
        }
    }

    fn submit_batch(
        &mut self,
        _: &protocol::ContentSnapshot,
        _: Option<&product::github::RemoteBatch>,
        _: &product::github::RemoteSubmitIntent,
    ) -> Result<product::github::RemoteSubmission, product::github::RemoteError> {
        Err(product::github::RemoteError::new("not used"))
    }

    fn batch_state(
        &mut self,
        _: &product::github::RemoteBatch,
    ) -> Result<product::github::RemoteBatchState, product::github::RemoteError> {
        Ok(product::github::RemoteBatchState::Merged)
    }

    fn close_batch(
        &mut self,
        _: &product::github::RemoteBatch,
    ) -> Result<(), product::github::RemoteError> {
        Err(product::github::RemoteError::new("not used"))
    }
}

#[test]
fn merged_batch_rereads_main_and_keeps_post_submit_local_changes() {
    let root = std::env::temp_dir().join(format!(
        "product-content-sync-merge-race-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();
    let mut data_server = start_data(&root.join("content.db"), "127.0.0.1:0", "test");
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        let data = product::data_client::DataClient::new(&format!(
            "http://127.0.0.1:{}",
            data_server.port
        ))
        .unwrap();
        let stored = data
            .call(
                "merge-race-source",
                &protocol::DataOperation::ContentSnapshotGet,
                Duration::from_secs(5),
            )
            .await
            .unwrap();
        let protocol::DataOutcome::ContentSnapshot(Some(public)) = stored.outcome else {
            panic!("test Data must expose a snapshot");
        };
        let mut committed = public.snapshot.clone();
        for article in &mut committed.articles {
            if article.meta.published_at.is_none() {
                article.meta.published_at = Some(article.meta.created_at.clone());
            }
        }
        let changed_article_id = committed.articles[0].meta.id;
        committed.articles[0].meta.title = "merged title".into();
        committed.articles[0].meta.updated_at = "2026-09-08T01:00:00Z".into();
        let mut local = committed.clone();
        local.articles[0].meta.summary = "next batch local edit".into();
        local.articles[0].meta.updated_at = "2026-09-08T02:00:00Z".into();
        let version = 17;
        data.call(
            "merge-race-seed-workflow",
            &protocol::DataOperation::ContentWorkflowWrite(Box::new(
                protocol::ContentWorkflowWrite {
                    expected_revision: None,
                    state: protocol::ContentWorkflowState {
                        workspace_version: version,
                        committed_version: Some(version - 1),
                        status: protocol::ContentWorkspaceStatus::SubmittedWithChanges,
                        snapshot: local,
                        committed_snapshot: committed.clone(),
                        batch_base_snapshot: public.snapshot.clone(),
                        remote_batch: Some(protocol::ContentRemoteBatch {
                            branch: "content/managed-race".into(),
                            pull_request: 91,
                            commit: "batch-head".into(),
                            base_commit: public.commit.clone(),
                        }),
                        last_error: None,
                        known_article_ids: committed
                            .articles
                            .iter()
                            .map(|article| article.meta.id)
                            .collect(),
                        pending_taxonomy_review: None,
                        source_commit: Some(public.commit.clone()),
                        pending_remote_operation: None,
                        sync: protocol::ContentSyncState::default(),
                    },
                },
            )),
            Duration::from_secs(5),
        )
        .await
        .unwrap();
        let reads = Arc::new(AtomicUsize::new(0));
        let service = product::content_service::ContentService::load(
            data.clone(),
            MergeBetweenReadsRemote {
                reads: Arc::clone(&reads),
                before_merge: product::github::RemoteMainSnapshot {
                    commit: public.commit,
                    snapshot: public.snapshot,
                },
                after_merge: product::github::RemoteMainSnapshot {
                    commit: "main-after-merge".into(),
                    snapshot: committed,
                },
            },
            Box::new(product::model_review::UnavailableModel::new("test")),
        )
        .await
        .unwrap();
        service.synchronize().await.unwrap();
        assert_eq!(reads.load(Ordering::SeqCst), 2);
        let view = service.view();
        assert_eq!(
            view.status,
            product::content_workspace::WorkspaceStatus::Saved
        );
        assert!(view.remote_batch.is_none());
        let local_article = view
            .snapshot
            .articles
            .iter()
            .find(|article| article.meta.id == changed_article_id)
            .expect("locally edited article remains in the workspace");
        assert_eq!(local_article.meta.summary, "next batch local edit");
        let stored = data
            .call(
                "merge-race-verify-public",
                &protocol::DataOperation::ContentSnapshotGet,
                Duration::from_secs(5),
            )
            .await
            .unwrap();
        let protocol::DataOutcome::ContentSnapshot(Some(stored)) = stored.outcome else {
            panic!("synced snapshot must be stored");
        };
        assert_eq!(stored.commit, "main-after-merge");
        let public_article = stored
            .snapshot
            .articles
            .iter()
            .find(|article| article.meta.id == changed_article_id)
            .expect("merged article is present in the public snapshot");
        assert_eq!(public_article.meta.title, "merged title");
        assert_ne!(public_article.meta.summary, "next batch local edit");
    });
    data_server.kill_now();
    let _ = std::fs::remove_dir_all(root);
}
