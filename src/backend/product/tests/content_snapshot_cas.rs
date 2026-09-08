//! Product-side integration evidence for Data content snapshot compare-and-swap semantics.

use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use product::data_client::{DataCallError, DataClient};

fn data_binary() -> PathBuf {
    PathBuf::from(env!("CARGO_TARGET_TMPDIR"))
        .join("..")
        .join("debug")
        .join("data")
}

struct DataProcess {
    child: Child,
    port: u16,
}

impl DataProcess {
    fn start(database: &Path) -> Self {
        let binary = data_binary();
        assert!(
            binary.exists(),
            "missing Data binary {}; run `cargo build -p data` before this test",
            binary.display()
        );
        let mut child = Command::new(binary)
            .args([
                "--listen",
                "127.0.0.1:0",
                "--data-semantics",
                "prod",
                "--data-database-path",
            ])
            .arg(database)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let lines = Arc::new(Mutex::new(Vec::<String>::new()));
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
                    lines.lock().unwrap().push(line);
                }
            });
        }
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let port = lines.lock().unwrap().iter().rev().find_map(|line| {
                line.split_once("listening addr=")?
                    .1
                    .split_whitespace()
                    .next()?
                    .rsplit(':')
                    .next()?
                    .parse()
                    .ok()
            });
            if let Some(port) = port {
                return Self { child, port };
            }
            if let Some(status) = child.try_wait().unwrap() {
                panic!(
                    "Data exited before listening: {status}; logs={:?}",
                    lines.lock().unwrap()
                );
            }
            assert!(
                Instant::now() < deadline,
                "Data did not start: {:?}",
                lines.lock().unwrap()
            );
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}

impl Drop for DataProcess {
    fn drop(&mut self) {
        if self.child.try_wait().ok().flatten().is_none() {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }
}

fn snapshot(title: &str, updated_at: &str) -> protocol::ContentSnapshot {
    protocol::ContentSnapshot {
        taxonomy: protocol::Taxonomy {
            version: protocol::TAXONOMY_SCHEMA_VERSION,
            next_category_id: 3,
            next_tag_id: 1,
            categories: vec![
                protocol::Category {
                    id: 1,
                    name: "Engineering".into(),
                    parent_id: None,
                    position: 10,
                },
                protocol::Category {
                    id: 2,
                    name: "Rust".into(),
                    parent_id: Some(1),
                    position: 10,
                },
            ],
            tags: Vec::new(),
        },
        articles: vec![protocol::ContentSnapshotArticle {
            meta: protocol::ContentArticleMeta {
                id: 1,
                title: title.into(),
                summary: String::new(),
                category_ids: vec![2],
                tag_ids: Vec::new(),
                created_at: "2026-09-08T00:00:00Z".into(),
                updated_at: updated_at.into(),
                published_at: Some("2026-09-08T00:00:00Z".into()),
            },
            content_html: "<p>body</p>".into(),
        }],
    }
}

async fn replace(
    client: &DataClient,
    request_id: &str,
    expected_previous_commit: Option<&str>,
    commit: &str,
    snapshot: protocol::ContentSnapshot,
) -> Result<(), DataCallError> {
    let trace = client
        .call(
            request_id,
            &protocol::DataOperation::ContentSnapshotReplace(protocol::ContentSnapshotReplace {
                expected_previous_commit: expected_previous_commit.map(str::to_owned),
                commit: commit.to_owned(),
                snapshot,
            }),
            Duration::from_secs(10),
        )
        .await?;
    assert!(matches!(trace.outcome, protocol::DataOutcome::Unit(_)));
    Ok(())
}

async fn stored(client: &DataClient, request_id: &str) -> protocol::StoredContentSnapshot {
    let trace = client
        .call(
            request_id,
            &protocol::DataOperation::ContentSnapshotGet,
            Duration::from_secs(10),
        )
        .await
        .unwrap();
    let protocol::DataOutcome::ContentSnapshot(Some(stored)) = trace.outcome else {
        panic!("Data must return a stored content snapshot");
    };
    stored
}

#[test]
fn two_product_writers_cannot_overwrite_a_newer_source_commit() {
    let root = std::env::temp_dir().join(format!(
        "product-content-snapshot-cas-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();
    let process = DataProcess::start(&root.join("content.db"));
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        let endpoint = format!("http://127.0.0.1:{}", process.port);
        let writer_a = DataClient::new(&endpoint).unwrap();
        let writer_b = DataClient::new(&endpoint).unwrap();
        replace(
            &writer_a,
            "product-cas-base",
            None,
            "main-1",
            snapshot("base", "2026-09-08T00:00:00Z"),
        )
        .await
        .unwrap();
        let base_a = stored(&writer_a, "product-cas-read-a").await;
        let base_b = stored(&writer_b, "product-cas-read-b").await;
        assert_eq!(base_a.commit, "main-1");
        assert_eq!(base_b.commit, "main-1");

        let barrier = Arc::new(tokio::sync::Barrier::new(2));
        let write_a = {
            let barrier = Arc::clone(&barrier);
            let writer = writer_a.clone();
            let base = base_a.commit.clone();
            async move {
                barrier.wait().await;
                replace(
                    &writer,
                    "product-cas-write-a",
                    Some(&base),
                    "main-a",
                    snapshot("writer a", "2026-09-08T01:00:00Z"),
                )
                .await
            }
        };
        let write_b = {
            let barrier = Arc::clone(&barrier);
            let writer = writer_b.clone();
            let base = base_b.commit.clone();
            async move {
                barrier.wait().await;
                replace(
                    &writer,
                    "product-cas-write-b",
                    Some(&base),
                    "main-b",
                    snapshot("writer b", "2026-09-08T01:00:00Z"),
                )
                .await
            }
        };
        let (result_a, result_b) = tokio::join!(write_a, write_b);
        assert_eq!(
            usize::from(result_a.is_ok()) + usize::from(result_b.is_ok()),
            1
        );
        let failure = match (&result_a, &result_b) {
            (Err(DataCallError::Failure(failure)), Ok(()))
            | (Ok(()), Err(DataCallError::Failure(failure))) => failure,
            _ => panic!("losing Product writer must receive a stable Data conflict"),
        };
        assert_eq!(
            failure.code,
            protocol::envelope::codes::CONTENT_SNAPSHOT_CHANGED
        );

        let winner = stored(&writer_a, "product-cas-winner").await;
        let stale_retry = replace(
            &writer_b,
            "product-cas-stale-retry",
            Some("main-1"),
            "main-stale",
            snapshot("stale overwrite", "2026-09-08T02:00:00Z"),
        )
        .await
        .unwrap_err();
        let DataCallError::Failure(stale_retry) = stale_retry else {
            panic!("stale retry must remain a domain conflict");
        };
        assert_eq!(
            stale_retry.code,
            protocol::envelope::codes::CONTENT_SNAPSHOT_CHANGED
        );
        assert_eq!(stored(&writer_a, "product-cas-still-winner").await, winner);

        let refreshed = stored(&writer_b, "product-cas-refresh").await;
        replace(
            &writer_b,
            "product-cas-refreshed-write",
            Some(&refreshed.commit),
            "main-after-refresh",
            snapshot("after refresh", "2026-09-08T03:00:00Z"),
        )
        .await
        .unwrap();
        let final_snapshot = stored(&writer_a, "product-cas-final").await;
        assert_eq!(final_snapshot.commit, "main-after-refresh");
        assert_eq!(
            final_snapshot.snapshot.articles[0].meta.title,
            "after refresh"
        );
    });
    drop(process);
    let _ = std::fs::remove_dir_all(root);
}
