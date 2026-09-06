//! 数据后端集成测试：test 语义（SQLite）与 mock 语义的 typed operations 语义、
//! 固定查询数（N+1 边界）与「调用数与条目数无关」证据。
//!
//! 全部经 `Executor`（同步 worker 线程 + `Handle::block_on`）驱动，
//! 与生产请求路径一致，而不是绕过线程池直连数据库。

use std::time::Duration;

use data::executor::{Executor, JobResult};
use data::semantics::TempDb;
use data::store::Store;
use protocol::envelope::codes;
use protocol::{ArticleGetQuery, ArticleListQuery, DataOperation, DataOutcome, Lane};

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

    for (page_size, expected_items) in [(1u32, 1usize), (4, 4), (20, 9), (100, 9)] {
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
        assert_eq!(page.total, 9, "published only");
        assert_eq!(page.has_more, page_size < 9);
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
    assert_eq!(ids, vec![12, 11, 10, 9, 8, 7, 6, 5, 4]);

    // 同一维度 OR：term_ids = [1, 2] 命中任一。
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
    assert_eq!(ids, vec![11, 10, 4], "OR inside the term dimension");

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
    assert_eq!(ids, vec![11, 9]);

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
    assert_eq!(a.len(), 9);
    assert_eq!(a, b, "seed must be identical on every fresh temp db");

    let diagnostics = first
        .describe()
        .expect("sqlite semantics exposes diagnostics");
    assert_eq!(diagnostics.applied_migrations, vec![1, 2]);
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
    assert_eq!(ids, vec![12, 11, 10, 9, 8, 7, 6, 5, 4]);
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
