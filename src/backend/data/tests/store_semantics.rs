//! 数据后端集成测试：test 语义（SQLite）与 mock 语义的 typed operations 语义、
//! 固定查询数（N+1 边界）与「调用数与条目数无关」证据。
//!
//! 全部经 `Executor`（同步 worker 线程 + `Handle::block_on`）驱动，
//! 与生产请求路径一致，而不是绕过线程池直连数据库。

use std::time::Duration;

use data::executor::{Executor, JobResult};
use data::semantics::{PersistentDb, TempDb};
use data::store::Store;
use protocol::envelope::codes;
use protocol::{
    ArticleGetQuery, ArticleListQuery, DataOperation, DataOutcome, Lane, ShareAttributionRecord,
};
use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection};
use sqlx::{Connection, Row};

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("test runtime")
}

fn unique_db_path(tag: &str) -> TempDb {
    let dir = std::env::temp_dir().join(format!("data-store-{}-{tag}", std::process::id()));
    TempDb::resolve(Some(&dir.join(format!("{tag}.db"))))
}

fn call(
    executor: &Executor,
    runtime: &tokio::runtime::Runtime,
    request_id: &str,
    operation: DataOperation,
) -> JobResult {
    let (tx, rx) = tokio::sync::oneshot::channel();
    executor
        .submit(
            request_id.to_owned(),
            operation,
            Duration::from_secs(10),
            tx,
        )
        .expect("lane accepts the job");
    runtime.block_on(rx).expect("worker replies")
}

#[test]
fn sqlite_store_keeps_query_count_fixed_while_item_count_grows() {
    let runtime = runtime();
    let temp = unique_db_path("query-budget");
    let store = runtime
        .block_on(Store::open_test(temp.clone()))
        .expect("test store opens");
    let executor = Executor::start(store.handle());

    // 夹具 published = 45（9 篇头部 + 36 篇追加）：20 一页触发「加载更多」。
    for (page_size, expected_items) in [(1u32, 1usize), (4, 4), (20, 20), (100, 45)] {
        let result = call(
            &executor,
            &runtime,
            &format!("list-{page_size}"),
            DataOperation::ArticleList(ArticleListQuery {
                page: Some(1),
                page_size: Some(page_size),
                published_only: true,
                ..ArticleListQuery::default()
            }),
        );
        assert_eq!(result.diag.lane, Some(Lane::Io));
        // 关键断言：查询数固定为 3（count + 当前页 + 批量 terms），与条目数无关。
        assert_eq!(
            result.diag.query_count, 3,
            "page_size={page_size} must keep the query count fixed"
        );
        let DataOutcome::ArticleList(page) = result.outcome.expect("ok") else {
            panic!("expected article list");
        };
        assert_eq!(page.items.len(), expected_items);
        assert_eq!(page.page_size, page_size);
        assert_eq!(page.total, 45, "published only");
        assert_eq!(page.has_more, page_size < 45);
        // 每条记录都带关联数据（批量加载，不允许逐条 detail）。
        for item in &page.items {
            assert!(item.article_type.is_some(), "type joined in page query");
            assert_eq!(item.terms.len(), item.term_ids.len());
        }
    }

    // 单篇：2 条查询（详情 + terms）。
    let result = call(
        &executor,
        &runtime,
        "get",
        DataOperation::ArticleGet(ArticleGetQuery {
            id: 11,
            published_only: true,
        }),
    );
    assert_eq!(result.diag.query_count, 2);
    let DataOutcome::ArticleDetail(detail) = result.outcome.expect("ok") else {
        panic!("expected article detail");
    };
    assert_eq!(detail.id, 11);
    assert!(!detail.content_html.is_empty());
    assert_eq!(detail.terms.len(), 2);

    // 类型与 terms：各 1 条查询。
    for (request_id, operation, expected) in [
        (
            "types",
            DataOperation::ArticleTypeList(protocol::ArticleTypeListQuery::default()),
            1u32,
        ),
        (
            "terms",
            DataOperation::TermList(protocol::TermListQuery::default()),
            1u32,
        ),
    ] {
        let result = call(&executor, &runtime, request_id, operation);
        assert_eq!(result.diag.query_count, expected, "{request_id}");
    }

    let (lanes, query_total) = executor.diagnostics();
    let io = lanes.iter().find(|lane| lane.lane == Lane::Io).unwrap();
    assert_eq!(io.completed, 7);
    assert_eq!(io.rejected, 0);
    // 4 次 list(3) + 1 次 get(2) + types(1) + terms(1) = 16。
    assert_eq!(query_total, 16);

    runtime.block_on(store.shutdown());
    store.remove_storage();
    assert!(!temp.path().exists(), "clean shutdown removes the temp db");
}

#[test]
fn share_attribution_is_persistent_and_expires_after_ninety_days() {
    let runtime = runtime();
    let temp = unique_db_path("share-attribution");
    let db_path = temp.path().to_path_buf();
    let store = runtime
        .block_on(Store::open_test(temp.clone()))
        .expect("test store opens");
    let executor = Executor::start(store.handle());
    let now = 2_000_000_000_i64;
    let old = DataOperation::ShareAttributionRecord(ShareAttributionRecord {
        token: "article-old".to_owned(),
        article_id: 1,
        created_at_epoch: now - 90 * 24 * 60 * 60 - 1,
    });
    let current = DataOperation::ShareAttributionRecord(ShareAttributionRecord {
        token: "article-current".to_owned(),
        article_id: 2,
        created_at_epoch: now,
    });
    assert!(call(&executor, &runtime, "share-old", old).outcome.is_ok());
    assert!(
        call(&executor, &runtime, "share-current", current)
            .outcome
            .is_ok()
    );
    drop(executor);
    runtime.block_on(store.shutdown());

    let mut connection = runtime
        .block_on(SqliteConnection::connect_with(
            &SqliteConnectOptions::new().filename(&db_path),
        ))
        .expect("database reopens");
    let rows = runtime
        .block_on(
            sqlx::query("SELECT token FROM share_attribution ORDER BY token")
                .fetch_all(&mut connection),
        )
        .expect("attribution rows load");
    let tokens: Vec<String> = rows
        .iter()
        .map(|row| row.try_get::<String, _>("token").expect("token column"))
        .collect();
    assert_eq!(tokens, vec!["article-current"]);
    runtime
        .block_on(connection.close())
        .expect("database closes");
    store.remove_storage();
}

#[test]
fn sqlite_store_enforces_public_visibility_and_filter_semantics() {
    let runtime = runtime();
    let temp = unique_db_path("visibility");
    let store = runtime
        .block_on(Store::open_test(temp.clone()))
        .expect("test store opens");
    let executor = Executor::start(store.handle());

    // 草稿不泄露给公开查询。
    let result = call(
        &executor,
        &runtime,
        "public-draft",
        DataOperation::ArticleGet(ArticleGetQuery {
            id: 3,
            published_only: true,
        }),
    );
    assert_eq!(result.outcome.unwrap_err().code, codes::NOT_FOUND);

    // 管理侧可以看到草稿。
    let result = call(
        &executor,
        &runtime,
        "admin-draft",
        DataOperation::ArticleGet(ArticleGetQuery {
            id: 3,
            published_only: false,
        }),
    );
    let DataOutcome::ArticleDetail(detail) = result.outcome.expect("ok") else {
        panic!("expected detail");
    };
    assert_eq!(detail.status, "draft");
    assert_eq!(detail.summary, "公网部署另立 plan。");

    // 排序：`updated_at DESC, id DESC`。
    let result = call(
        &executor,
        &runtime,
        "order",
        DataOperation::ArticleList(ArticleListQuery {
            published_only: true,
            page_size: Some(100),
            ..ArticleListQuery::default()
        }),
    );
    let DataOutcome::ArticleList(page) = result.outcome.expect("ok") else {
        panic!("expected list");
    };
    let ids: Vec<i64> = page.items.iter().map(|item| item.id).collect();
    // 追加块时间戳随 id 非递减 → 默认排序等价于 id 降序。
    assert_eq!(ids, (4..=48).rev().collect::<Vec<i64>>());

    // 同一维度 OR：term_ids = [1, 2] 命中任一（topic rust ∪ topic sqlite = 18 篇）。
    let result = call(
        &executor,
        &runtime,
        "term-or",
        DataOperation::ArticleList(ArticleListQuery {
            published_only: true,
            page_size: Some(100),
            term_ids: vec![1, 2],
            ..ArticleListQuery::default()
        }),
    );
    let DataOutcome::ArticleList(page) = result.outcome.expect("ok") else {
        panic!("expected list");
    };
    let ids: Vec<i64> = page.items.iter().map(|item| item.id).collect();
    assert_eq!(
        ids,
        vec![
            47, 46, 42, 41, 40, 35, 34, 30, 29, 28, 23, 22, 18, 17, 16, 11, 10, 4
        ],
        "OR inside the term dimension"
    );

    // 不同维度 AND：type + term。
    let result = call(
        &executor,
        &runtime,
        "type-and-term",
        DataOperation::ArticleList(ArticleListQuery {
            published_only: true,
            page_size: Some(100),
            article_type_id: Some(1),
            term_ids: vec![4],
            ..ArticleListQuery::default()
        }),
    );
    let DataOutcome::ArticleList(page) = result.outcome.expect("ok") else {
        panic!("expected list");
    };
    let ids: Vec<i64> = page.items.iter().map(|item| item.id).collect();
    assert_eq!(ids, vec![44, 32, 20, 11, 9], "Engineering AND runtime");

    // 搜索覆盖标题、摘要和正文，公开查询仍只返回已发布文章。
    let result = call(
        &executor,
        &runtime,
        "search-title",
        DataOperation::ArticleList(ArticleListQuery {
            published_only: true,
            page_size: Some(100),
            search: Some("SQLite".to_owned()),
            ..ArticleListQuery::default()
        }),
    );
    let DataOutcome::ArticleList(page) = result.outcome.expect("ok") else {
        panic!("expected search list");
    };
    assert!(page.items.iter().any(|item| item.id == 10));
    assert!(page.items.iter().all(|item| item.status == "published"));

    // 时间过滤：updated_to 为排他日终点（含当日全天）。
    let result = call(
        &executor,
        &runtime,
        "updated-to",
        DataOperation::ArticleList(ArticleListQuery {
            published_only: true,
            page_size: Some(100),
            updated_to: Some("2026-09-02".to_owned()),
            ..ArticleListQuery::default()
        }),
    );
    let DataOutcome::ArticleList(page) = result.outcome.expect("ok") else {
        panic!("expected list");
    };
    let ids: Vec<i64> = page.items.iter().map(|item| item.id).collect();
    assert_eq!(
        ids,
        vec![9, 8, 7, 6, 5, 4],
        "updated_at <= 2026-09-02 (day inclusive)"
    );

    // 空摘要合法（ARCH-DATA-API）。
    let result = call(
        &executor,
        &runtime,
        "empty-summary",
        DataOperation::ArticleGet(ArticleGetQuery {
            id: 7,
            published_only: true,
        }),
    );
    let DataOutcome::ArticleDetail(detail) = result.outcome.expect("ok") else {
        panic!("expected detail");
    };
    assert_eq!(detail.summary, "");

    runtime.block_on(store.shutdown());
    store.remove_storage();
}

#[test]
fn test_semantics_seeds_are_stable_across_runs() {
    let runtime = runtime();

    fn published_titles(store: &Store) -> Vec<(i64, String, String)> {
        let executor = Executor::start(store.handle());
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let (tx, rx) = tokio::sync::oneshot::channel();
        executor
            .submit(
                "seed-check".to_owned(),
                DataOperation::ArticleList(ArticleListQuery {
                    page_size: Some(100),
                    published_only: true,
                    ..ArticleListQuery::default()
                }),
                Duration::from_secs(5),
                tx,
            )
            .unwrap();
        let result = rt.block_on(rx).unwrap();
        let DataOutcome::ArticleList(page) = result.outcome.unwrap() else {
            panic!("expected list");
        };
        executor.release_handles();
        page.items
            .into_iter()
            .map(|item| (item.id, item.title, item.updated_at))
            .collect()
    }

    let first = runtime
        .block_on(Store::open_test(unique_db_path("seed-a")))
        .unwrap();
    let second = runtime
        .block_on(Store::open_test(unique_db_path("seed-b")))
        .unwrap();
    let a = published_titles(&first);
    let b = published_titles(&second);
    assert_eq!(a.len(), 45, "9 篇头部 + 36 篇追加");
    assert_eq!(a, b, "seed must be identical on every fresh temp db");

    let diagnostics = first
        .describe()
        .expect("sqlite semantics exposes diagnostics");
    assert_eq!(diagnostics.applied_migrations, vec![1, 2, 3, 4, 5, 6, 7]);
    assert!(diagnostics.seeded);
    runtime.block_on(first.shutdown());
    runtime.block_on(second.shutdown());
    first.remove_storage();
    second.remove_storage();
}

#[test]
fn mock_semantics_matches_sqlite_semantics_without_any_file() {
    let runtime = runtime();
    let store = Store::mock();
    assert!(
        !store.uses_sqlite(),
        "mock semantics must not create or open any SQLite file"
    );
    assert!(
        store.describe().is_none(),
        "no database object in diagnostics"
    );
    let executor = Executor::start(store.handle());

    let result = call(
        &executor,
        &runtime,
        "mock-list",
        DataOperation::ArticleList(ArticleListQuery {
            page_size: Some(100),
            published_only: true,
            ..ArticleListQuery::default()
        }),
    );
    assert_eq!(result.diag.query_count, 3, "same metering as the SQL path");
    let DataOutcome::ArticleList(page) = result.outcome.expect("ok") else {
        panic!("expected list");
    };
    let ids: Vec<i64> = page.items.iter().map(|item| item.id).collect();
    assert_eq!(
        ids,
        (4..=48).rev().collect::<Vec<i64>>(),
        "mock 与 test 语义同一批数据、同一排序"
    );
    assert_eq!(page.total, 45);
    for item in &page.items {
        assert!(item.article_type.is_some());
        assert_eq!(item.terms.len(), item.term_ids.len());
    }

    let result = call(
        &executor,
        &runtime,
        "mock-get",
        DataOperation::ArticleGet(ArticleGetQuery {
            id: 3,
            published_only: true,
        }),
    );
    assert_eq!(result.outcome.unwrap_err().code, codes::NOT_FOUND);
}

#[test]
fn prod_semantics_keeps_an_unseeded_database_across_reopen() {
    let runtime = runtime();
    let path = std::env::temp_dir()
        .join(format!("data-store-{}-prod", std::process::id()))
        .join("blog.db");
    let persistent = PersistentDb::resolve(&path);

    let first = runtime
        .block_on(Store::open_prod(persistent.clone()))
        .expect("prod store opens");
    let diagnostics = first.describe().expect("prod exposes diagnostics");
    assert!(!diagnostics.seeded, "prod must never load test fixtures");
    assert!(
        path.exists(),
        "prod database is created outside the repository"
    );
    let executor = Executor::start(first.handle());
    let saved = call(
        &executor,
        &runtime,
        "persistent-type",
        DataOperation::ArticleTypeCreate(protocol::ArticleTypeName {
            name: "Persistent".to_owned(),
        }),
    )
    .outcome
    .unwrap();
    let DataOutcome::ArticleType(saved) = saved else {
        panic!("expected article type")
    };
    let handles = executor.take_join_handles();
    drop(executor);
    assert!(data::executor::join_workers(handles, Duration::from_secs(3)).all_exited());
    runtime.block_on(first.shutdown());
    first.remove_storage();
    assert!(path.exists(), "prod database survives normal shutdown");

    let second = runtime
        .block_on(Store::open_prod(persistent))
        .expect("prod store reopens");
    assert!(!second.describe().expect("diagnostics").seeded);
    let executor = Executor::start(second.handle());
    let loaded = call(
        &executor,
        &runtime,
        "reopened-types",
        DataOperation::ArticleTypeList(protocol::ArticleTypeListQuery::default()),
    )
    .outcome
    .unwrap();
    assert_eq!(loaded, DataOutcome::ArticleTypes(vec![saved]));
    let handles = executor.take_join_handles();
    drop(executor);
    assert!(data::executor::join_workers(handles, Duration::from_secs(3)).all_exited());
    runtime.block_on(second.shutdown());
    second.remove_storage();
    let _ = std::fs::remove_dir_all(path.parent().expect("database parent"));
}

fn content_snapshot() -> protocol::ContentSnapshot {
    protocol::ContentSnapshot {
        taxonomy: protocol::Taxonomy {
            version: 1,
            next_category_id: 5,
            next_tag_id: 2,
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
                protocol::Category {
                    id: 3,
                    name: "Research".into(),
                    parent_id: None,
                    position: 5,
                },
                protocol::Category {
                    id: 4,
                    name: "Compilers".into(),
                    parent_id: Some(3),
                    position: 10,
                },
            ],
            tags: vec![protocol::Tag {
                id: 1,
                name: "performance".into(),
            }],
        },
        articles: vec![protocol::ContentSnapshotArticle {
            meta: protocol::ContentArticleMeta {
                id: 1001,
                title: "Borrowing".into(),
                summary: String::new(),
                category_ids: vec![2, 4],
                tag_ids: vec![1],
                created_at: "2026-09-08T00:00:00Z".into(),
                updated_at: "2026-09-08T00:00:00Z".into(),
                published_at: Some("2026-09-08T00:00:00Z".into()),
            },
            content_html: "<p>body</p>".into(),
        }],
    }
}

#[test]
fn content_snapshot_replace_is_validated_atomic_and_persistent() {
    let runtime = runtime();
    let path = std::env::temp_dir().join(format!(
        "data-store-{}-snapshot/blog.db",
        std::process::id()
    ));
    let persistent = PersistentDb::resolve(&path);
    let first = runtime
        .block_on(Store::open_prod(persistent.clone()))
        .unwrap();
    let executor = Executor::start(first.handle());
    let snapshot = content_snapshot();
    call(
        &executor,
        &runtime,
        "snapshot-replace",
        DataOperation::ContentSnapshotReplace(protocol::ContentSnapshotReplace {
            expected_previous_commit: None,
            commit: "main-1".into(),
            snapshot: snapshot.clone(),
        }),
    )
    .outcome
    .unwrap();

    let types = call(
        &executor,
        &runtime,
        "projected-types",
        DataOperation::ArticleTypeList(protocol::ArticleTypeListQuery::default()),
    )
    .outcome
    .unwrap();
    let DataOutcome::ArticleTypes(types) = types else {
        panic!("expected projected article types");
    };
    assert_eq!(
        types
            .iter()
            .map(|value| (value.id, value.name.as_str()))
            .collect::<Vec<_>>(),
        vec![(1, "Engineering"), (3, "Research")]
    );

    let terms = call(
        &executor,
        &runtime,
        "projected-terms",
        DataOperation::TermList(protocol::TermListQuery::default()),
    )
    .outcome
    .unwrap();
    let DataOutcome::Terms(terms) = terms else {
        panic!("expected projected terms");
    };
    assert_eq!(
        terms
            .iter()
            .map(|value| (value.id, value.name.as_str(), value.kind.as_str()))
            .collect::<Vec<_>>(),
        vec![
            (3, "performance", "tag"),
            (8, "Compilers", "topic"),
            (4, "Rust", "topic")
        ]
    );

    let list = call(
        &executor,
        &runtime,
        "projected-list",
        DataOperation::ArticleList(ArticleListQuery {
            published_only: true,
            ..ArticleListQuery::default()
        }),
    )
    .outcome
    .unwrap();
    let DataOutcome::ArticleList(list) = list else {
        panic!("expected projected article list");
    };
    assert_eq!(list.items.len(), 1);
    assert_eq!(list.items[0].id, 1001);
    assert_eq!(list.items[0].article_type_id, 3, "lower root position wins");
    assert_eq!(
        list.items[0].article_type.as_ref().unwrap().name,
        "Research"
    );
    assert_eq!(list.items[0].term_ids, vec![3, 8, 4]);

    let detail = call(
        &executor,
        &runtime,
        "projected-detail",
        DataOperation::ArticleGet(ArticleGetQuery {
            id: 1001,
            published_only: true,
        }),
    )
    .outcome
    .unwrap();
    let DataOutcome::ArticleDetail(detail) = detail else {
        panic!("expected projected detail");
    };
    assert_eq!(detail.content_html, "<p>body</p>");
    assert_eq!(detail.article_type_id, 3);

    let shelf = call(
        &executor,
        &runtime,
        "projected-shelf",
        DataOperation::ArticleShelf(protocol::ArticleShelfQuery::default()),
    )
    .outcome
    .unwrap();
    let DataOutcome::ArticleShelf(shelf) = shelf else {
        panic!("expected projected shelf");
    };
    assert_eq!(
        shelf
            .articles
            .iter()
            .map(|value| value.id)
            .collect::<Vec<_>>(),
        vec![1001]
    );
    assert!(
        shelf.recommendation.is_empty(),
        "removed article IDs leave recommendations"
    );

    let browse = call(
        &executor,
        &runtime,
        "projected-category-browse",
        DataOperation::ArticleBrowse(protocol::ArticleBrowseQuery {
            topic_id: Some(8),
            published_only: true,
            ..protocol::ArticleBrowseQuery::default()
        }),
    )
    .outcome
    .unwrap();
    let DataOutcome::ArticleList(browse) = browse else {
        panic!("expected projected category browse");
    };
    assert_eq!(
        browse
            .items
            .iter()
            .map(|value| value.id)
            .collect::<Vec<_>>(),
        vec![1001]
    );

    let same_commit_different = call(
        &executor,
        &runtime,
        "snapshot-same-commit-different",
        DataOperation::ContentSnapshotReplace(protocol::ContentSnapshotReplace {
            expected_previous_commit: Some("main-1".into()),
            commit: "main-1".into(),
            snapshot: {
                let mut changed = snapshot.clone();
                changed.articles[0].meta.title = "Different".into();
                changed
            },
        }),
    )
    .outcome
    .unwrap_err();
    assert_eq!(same_commit_different.code, codes::CONTENT_WORKFLOW_CHANGED);

    let mut invalid = snapshot.clone();
    invalid.articles[0].meta.category_ids = vec![1];
    let failure = call(
        &executor,
        &runtime,
        "snapshot-invalid",
        DataOperation::ContentSnapshotReplace(protocol::ContentSnapshotReplace {
            expected_previous_commit: Some("main-1".into()),
            commit: "main-2".into(),
            snapshot: invalid,
        }),
    )
    .outcome
    .unwrap_err();
    assert_eq!(failure.code, codes::INVALID_PAYLOAD);

    let mut removed = snapshot.clone();
    removed.articles.clear();
    call(
        &executor,
        &runtime,
        "snapshot-remove-article",
        DataOperation::ContentSnapshotReplace(protocol::ContentSnapshotReplace {
            expected_previous_commit: Some("main-1".into()),
            commit: "main-2".into(),
            snapshot: removed.clone(),
        }),
    )
    .outcome
    .unwrap();
    let mut restored_with_changed_publication = snapshot.clone();
    restored_with_changed_publication.articles[0]
        .meta
        .published_at = Some("2026-09-09T00:00:00Z".into());
    let identity_failure = call(
        &executor,
        &runtime,
        "snapshot-restore-changed-identity",
        DataOperation::ContentSnapshotReplace(protocol::ContentSnapshotReplace {
            expected_previous_commit: Some("main-2".into()),
            commit: "main-3".into(),
            snapshot: restored_with_changed_publication,
        }),
    )
    .outcome
    .unwrap_err();
    assert_eq!(identity_failure.code, codes::CONTENT_WORKFLOW_CHANGED);
    let handles = executor.take_join_handles();
    drop(executor);
    assert!(data::executor::join_workers(handles, Duration::from_secs(3)).all_exited());
    runtime.block_on(first.shutdown());

    let second = runtime.block_on(Store::open_prod(persistent)).unwrap();
    let executor = Executor::start(second.handle());
    let loaded = call(
        &executor,
        &runtime,
        "snapshot-get",
        DataOperation::ContentSnapshotGet,
    )
    .outcome
    .unwrap();
    assert_eq!(
        loaded,
        DataOutcome::ContentSnapshot(Some(protocol::StoredContentSnapshot {
            commit: "main-2".into(),
            snapshot: removed
        }))
    );
    let handles = executor.take_join_handles();
    drop(executor);
    assert!(data::executor::join_workers(handles, Duration::from_secs(3)).all_exited());
    runtime.block_on(second.shutdown());
    second.remove_storage();
    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

#[test]
fn content_snapshot_replace_preserves_surviving_recommendations_across_relation_rebuild() {
    let runtime = runtime();
    let temp = unique_db_path("snapshot-recommendation");
    let store = runtime.block_on(Store::open_test(temp.clone())).unwrap();
    let executor = Executor::start(store.handle());
    let stored = call(
        &executor,
        &runtime,
        "seed-snapshot",
        DataOperation::ContentSnapshotGet,
    )
    .outcome
    .unwrap();
    let DataOutcome::ContentSnapshot(Some(mut stored)) = stored else {
        panic!("expected seeded content snapshot");
    };
    stored
        .snapshot
        .articles
        .retain(|article| article.meta.id == 48);
    assert_eq!(stored.snapshot.articles.len(), 1);
    call(
        &executor,
        &runtime,
        "replace-with-recommended-article",
        DataOperation::ContentSnapshotReplace(protocol::ContentSnapshotReplace {
            expected_previous_commit: Some(stored.commit.clone()),
            commit: "main-recommendation".into(),
            snapshot: stored.snapshot,
        }),
    )
    .outcome
    .unwrap();
    let recommendation = call(
        &executor,
        &runtime,
        "surviving-recommendation",
        DataOperation::RecommendationCurrent,
    )
    .outcome
    .unwrap();
    let DataOutcome::Recommendation(recommendation) = recommendation else {
        panic!("expected recommendation");
    };
    assert_eq!(
        recommendation
            .iter()
            .map(|article| article.id)
            .collect::<Vec<_>>(),
        vec![48]
    );
    let handles = executor.take_join_handles();
    drop(executor);
    assert!(data::executor::join_workers(handles, Duration::from_secs(3)).all_exited());
    runtime.block_on(store.shutdown());
    store.remove_storage();
}

#[test]
fn content_snapshot_replace_preserves_taxonomy_times_and_rolls_back_projection_failure() {
    let runtime = runtime();
    let temp = unique_db_path("snapshot-atomic-projection");
    let database = temp.path().to_path_buf();
    let store = runtime
        .block_on(Store::open_prod(PersistentDb::resolve(&database)))
        .unwrap();
    let executor = Executor::start(store.handle());
    let snapshot = content_snapshot();
    call(
        &executor,
        &runtime,
        "atomic-projection-first",
        DataOperation::ContentSnapshotReplace(protocol::ContentSnapshotReplace {
            expected_previous_commit: None,
            commit: "atomic-main-1".into(),
            snapshot: snapshot.clone(),
        }),
    )
    .outcome
    .unwrap();
    let DataOutcome::ArticleTypes(first_types) = call(
        &executor,
        &runtime,
        "atomic-projection-types-first",
        DataOperation::ArticleTypeList(protocol::ArticleTypeListQuery::default()),
    )
    .outcome
    .unwrap() else {
        panic!("expected article types");
    };
    let DataOutcome::Terms(first_terms) = call(
        &executor,
        &runtime,
        "atomic-projection-terms-first",
        DataOperation::TermList(protocol::TermListQuery::default()),
    )
    .outcome
    .unwrap() else {
        panic!("expected terms");
    };

    let mut second = snapshot.clone();
    second.articles[0].meta.title = "Changed without taxonomy edits".into();
    second.articles[0].meta.updated_at = "2026-09-08T01:00:00Z".into();
    call(
        &executor,
        &runtime,
        "atomic-projection-second",
        DataOperation::ContentSnapshotReplace(protocol::ContentSnapshotReplace {
            expected_previous_commit: Some("atomic-main-1".into()),
            commit: "atomic-main-2".into(),
            snapshot: second.clone(),
        }),
    )
    .outcome
    .unwrap();
    let DataOutcome::ArticleTypes(second_types) = call(
        &executor,
        &runtime,
        "atomic-projection-types-second",
        DataOperation::ArticleTypeList(protocol::ArticleTypeListQuery::default()),
    )
    .outcome
    .unwrap() else {
        panic!("expected article types");
    };
    let DataOutcome::Terms(second_terms) = call(
        &executor,
        &runtime,
        "atomic-projection-terms-second",
        DataOperation::TermList(protocol::TermListQuery::default()),
    )
    .outcome
    .unwrap() else {
        panic!("expected terms");
    };
    assert_eq!(first_types, second_types);
    assert_eq!(first_terms, second_terms);

    runtime.block_on(async {
        let options = SqliteConnectOptions::new().filename(&database);
        let mut connection = SqliteConnection::connect_with(&options).await.unwrap();
        sqlx::query(
            "CREATE TRIGGER fail_content_term_insert BEFORE INSERT ON terms \
             BEGIN SELECT RAISE(ABORT, 'forced projection failure'); END",
        )
        .execute(&mut connection)
        .await
        .unwrap();
    });
    let mut rejected = second.clone();
    rejected.articles[0].meta.title = "Must roll back".into();
    rejected.articles[0].meta.updated_at = "2026-09-08T02:00:00Z".into();
    let failure = call(
        &executor,
        &runtime,
        "atomic-projection-fails-mid-transaction",
        DataOperation::ContentSnapshotReplace(protocol::ContentSnapshotReplace {
            expected_previous_commit: Some("atomic-main-2".into()),
            commit: "atomic-main-3".into(),
            snapshot: rejected,
        }),
    )
    .outcome
    .unwrap_err();
    assert_eq!(failure.code, codes::INTERNAL_ERROR);
    let DataOutcome::ContentSnapshot(Some(stored)) = call(
        &executor,
        &runtime,
        "atomic-projection-stored-after-failure",
        DataOperation::ContentSnapshotGet,
    )
    .outcome
    .unwrap() else {
        panic!("expected stored snapshot");
    };
    assert_eq!(stored.commit, "atomic-main-2");
    assert_eq!(stored.snapshot, second);
    let DataOutcome::ArticleDetail(detail) = call(
        &executor,
        &runtime,
        "atomic-projection-public-after-failure",
        DataOperation::ArticleGet(ArticleGetQuery {
            id: 1001,
            published_only: true,
        }),
    )
    .outcome
    .unwrap() else {
        panic!("expected public article");
    };
    assert_eq!(detail.title, "Changed without taxonomy edits");
    let DataOutcome::ArticleTypes(after_failure_types) = call(
        &executor,
        &runtime,
        "atomic-projection-types-after-failure",
        DataOperation::ArticleTypeList(protocol::ArticleTypeListQuery::default()),
    )
    .outcome
    .unwrap() else {
        panic!("expected article types");
    };
    assert_eq!(after_failure_types, second_types);

    let handles = executor.take_join_handles();
    drop(executor);
    assert!(data::executor::join_workers(handles, Duration::from_secs(3)).all_exited());
    runtime.block_on(store.shutdown());
    store.remove_storage();
    let _ = std::fs::remove_dir_all(database.parent().unwrap());
}

#[test]
fn content_snapshot_cas_allows_only_one_interleaved_writer() {
    let runtime = runtime();
    let path = std::env::temp_dir().join(format!(
        "data-store-{}-snapshot-cas/blog.db",
        std::process::id()
    ));
    let store = runtime
        .block_on(Store::open_prod(PersistentDb::resolve(&path)))
        .unwrap();
    let executor = std::sync::Arc::new(Executor::start(store.handle()));
    let base = content_snapshot();
    call(
        &executor,
        &runtime,
        "snapshot-cas-base",
        DataOperation::ContentSnapshotReplace(protocol::ContentSnapshotReplace {
            expected_previous_commit: None,
            commit: "snapshot-base".into(),
            snapshot: base.clone(),
        }),
    )
    .outcome
    .unwrap();

    let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
    let mut writers = Vec::new();
    for suffix in ["a", "b"] {
        let executor = std::sync::Arc::clone(&executor);
        let barrier = std::sync::Arc::clone(&barrier);
        let mut snapshot = base.clone();
        snapshot.articles[0].meta.title = format!("writer {suffix}");
        snapshot.articles[0].meta.updated_at = "2026-09-08T01:00:00Z".into();
        writers.push(std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            barrier.wait();
            call(
                &executor,
                &runtime,
                &format!("snapshot-writer-{suffix}"),
                DataOperation::ContentSnapshotReplace(protocol::ContentSnapshotReplace {
                    expected_previous_commit: Some("snapshot-base".into()),
                    commit: format!("snapshot-{suffix}"),
                    snapshot,
                }),
            )
            .outcome
        }));
    }
    barrier.wait();
    let outcomes = writers
        .into_iter()
        .map(|writer| writer.join().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(outcomes.iter().filter(|outcome| outcome.is_ok()).count(), 1);
    let failures = outcomes
        .iter()
        .filter_map(|outcome| outcome.as_ref().err())
        .collect::<Vec<_>>();
    assert_eq!(failures.len(), 1);
    assert_eq!(failures[0].code, codes::CONTENT_SNAPSHOT_CHANGED);
    let DataOutcome::ContentSnapshot(Some(stored)) = call(
        &executor,
        &runtime,
        "snapshot-cas-result",
        DataOperation::ContentSnapshotGet,
    )
    .outcome
    .unwrap() else {
        panic!("winner snapshot must be stored");
    };
    assert!(matches!(
        stored.commit.as_str(),
        "snapshot-a" | "snapshot-b"
    ));
    assert_eq!(
        stored.snapshot.articles[0].meta.title,
        format!("writer {}", stored.commit.trim_start_matches("snapshot-"))
    );

    executor.release_handles();
    let handles = executor.take_join_handles();
    drop(executor);
    assert!(data::executor::join_workers(handles, Duration::from_secs(3)).all_exited());
    runtime.block_on(store.shutdown());
    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

fn content_workflow_state() -> protocol::ContentWorkflowState {
    let snapshot = content_snapshot();
    protocol::ContentWorkflowState {
        workspace_version: 7,
        committed_version: Some(6),
        status: protocol::ContentWorkspaceStatus::SubmittedWithChanges,
        snapshot: snapshot.clone(),
        committed_snapshot: snapshot.clone(),
        batch_base_snapshot: snapshot.clone(),
        remote_batch: Some(protocol::ContentRemoteBatch {
            branch: "content/batch-3".into(),
            pull_request: 19,
            commit: "pr-head-2".into(),
            base_commit: "main-1".into(),
        }),
        last_error: None,
        known_article_ids: vec![1001],
        pending_taxonomy_review: Some(protocol::PendingTaxonomyReview {
            workspace_version: 7,
            prompt_version: "taxonomy-workflow/v1".into(),
            change_schema_version: 1,
            article_ids: vec![1001],
            proposal_json: r#"{"version":1,"operations":[{"operation":"rename_tag","tag_id":1,"name":"perf"}]}"#.into(),
            applied_snapshot: snapshot,
            diff_json: r#"{"taxonomy_before":{},"taxonomy_after":{},"articles":[]}"#.into(),
            warnings: Vec::new(),
        }),
        source_commit: Some("main-1".into()),
        pending_remote_operation: None,
        sync: protocol::ContentSyncState::default(),
    }
}

#[test]
fn content_workflow_cas_persists_pending_review_and_active_pr_across_reopen() {
    let runtime = runtime();
    let path = std::env::temp_dir().join(format!(
        "data-store-{}-workflow/blog.db",
        std::process::id()
    ));
    let persistent = PersistentDb::resolve(&path);
    let first = runtime
        .block_on(Store::open_prod(persistent.clone()))
        .unwrap();
    let executor = Executor::start(first.handle());
    let state = content_workflow_state();
    let stored = call(
        &executor,
        &runtime,
        "workflow-create",
        DataOperation::ContentWorkflowWrite(Box::new(protocol::ContentWorkflowWrite {
            expected_revision: None,
            state: state.clone(),
        })),
    )
    .outcome
    .unwrap();
    assert_eq!(
        stored,
        DataOutcome::ContentWorkflow(Some(protocol::StoredContentWorkflow {
            revision: 1,
            state: state.clone(),
        }))
    );
    let stale = call(
        &executor,
        &runtime,
        "workflow-stale",
        DataOperation::ContentWorkflowWrite(Box::new(protocol::ContentWorkflowWrite {
            expected_revision: None,
            state: state.clone(),
        })),
    )
    .outcome
    .unwrap_err();
    assert_eq!(stale.code, codes::CONTENT_WORKFLOW_CHANGED);
    let handles = executor.take_join_handles();
    drop(executor);
    assert!(data::executor::join_workers(handles, Duration::from_secs(3)).all_exited());
    runtime.block_on(first.shutdown());

    let second = runtime.block_on(Store::open_prod(persistent)).unwrap();
    let executor = Executor::start(second.handle());
    let loaded = call(
        &executor,
        &runtime,
        "workflow-recover",
        DataOperation::ContentWorkflowGet,
    )
    .outcome
    .unwrap();
    assert_eq!(
        loaded,
        DataOutcome::ContentWorkflow(Some(protocol::StoredContentWorkflow { revision: 1, state }))
    );
    let handles = executor.take_join_handles();
    drop(executor);
    assert!(data::executor::join_workers(handles, Duration::from_secs(3)).all_exited());
    runtime.block_on(second.shutdown());
    second.remove_storage();
    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

#[test]
fn content_workflow_cas_allows_only_one_interleaved_writer() {
    let runtime = runtime();
    let path = std::env::temp_dir().join(format!(
        "data-store-{}-workflow-cas/blog.db",
        std::process::id()
    ));
    let store = runtime
        .block_on(Store::open_prod(PersistentDb::resolve(&path)))
        .unwrap();
    let executor = std::sync::Arc::new(Executor::start(store.handle()));
    let base = content_workflow_state();
    call(
        &executor,
        &runtime,
        "workflow-cas-base",
        DataOperation::ContentWorkflowWrite(Box::new(protocol::ContentWorkflowWrite {
            expected_revision: None,
            state: base.clone(),
        })),
    )
    .outcome
    .unwrap();

    let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
    let mut writers = Vec::new();
    for suffix in ["a", "b"] {
        let executor = std::sync::Arc::clone(&executor);
        let barrier = std::sync::Arc::clone(&barrier);
        let mut state = base.clone();
        state.snapshot.articles[0].meta.summary = format!("workflow writer {suffix}");
        writers.push(std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            barrier.wait();
            call(
                &executor,
                &runtime,
                &format!("workflow-writer-{suffix}"),
                DataOperation::ContentWorkflowWrite(Box::new(protocol::ContentWorkflowWrite {
                    expected_revision: Some(1),
                    state,
                })),
            )
            .outcome
        }));
    }
    barrier.wait();
    let outcomes = writers
        .into_iter()
        .map(|writer| writer.join().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(outcomes.iter().filter(|outcome| outcome.is_ok()).count(), 1);
    let failures = outcomes
        .iter()
        .filter_map(|outcome| outcome.as_ref().err())
        .collect::<Vec<_>>();
    assert_eq!(failures.len(), 1);
    assert_eq!(failures[0].code, codes::CONTENT_WORKFLOW_CHANGED);
    let DataOutcome::ContentWorkflow(Some(stored)) = call(
        &executor,
        &runtime,
        "workflow-cas-result",
        DataOperation::ContentWorkflowGet,
    )
    .outcome
    .unwrap() else {
        panic!("winner workflow must be stored");
    };
    assert_eq!(stored.revision, 2);
    assert!(matches!(
        stored.state.snapshot.articles[0].meta.summary.as_str(),
        "workflow writer a" | "workflow writer b"
    ));

    executor.release_handles();
    let handles = executor.take_join_handles();
    drop(executor);
    assert!(data::executor::join_workers(handles, Duration::from_secs(3)).all_exited());
    runtime.block_on(store.shutdown());
    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}
