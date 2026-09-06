//! 管理侧写入、状态迁移、推荐与 mobile shelf 读模型的集成测试（SQLite 与 mock 两个后端）。
//!
//! 重点：写操作原子性、`draft -> published -> draft` 状态机、摘要校验、
//! 唯一约束失败码、推荐**批量**加载（禁止逐条 detail）、shelf 固定查询数。

use std::time::Duration;

use data::executor::{Executor, JobResult};
use data::semantics::TempDb;
use data::store::Store;
use protocol::envelope::codes;
use protocol::{
    ArticleGetQuery, ArticleId, ArticleListQuery, ArticleShelfQuery, ArticleTypeListQuery,
    ArticleTypeName, ArticleTypeRename, ArticleWrite, DataOperation, DataOutcome,
    MAX_SUMMARY_CHARS, TermListQuery, TermWrite,
};

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("test runtime")
}

fn unique_db(tag: &str) -> TempDb {
    let dir = std::env::temp_dir().join(format!("data-write-{}-{tag}", std::process::id()));
    TempDb::resolve(Some(&dir.join(format!("{tag}.db"))))
}

fn call(
    executor: &Executor,
    rt: &tokio::runtime::Runtime,
    request_id: &str,
    operation: DataOperation,
) -> JobResult {
    let (tx, rx) = tokio::sync::oneshot::channel();
    executor
        .submit(
            request_id.to_owned(),
            operation,
            Duration::from_secs(15),
            tx,
        )
        .expect("lane accepts the job");
    rt.block_on(rx).expect("worker replies")
}

fn write(id: i64, title: &str, summary: &str, type_id: i64, terms: &[i64]) -> ArticleWrite {
    ArticleWrite {
        id,
        title: title.to_owned(),
        summary: summary.to_owned(),
        article_type_id: type_id,
        term_ids: terms.to_vec(),
        content_html: format!("<p>{title}</p>"),
    }
}

fn article_list(
    executor: &Executor,
    rt: &tokio::runtime::Runtime,
    published_only: bool,
) -> Vec<i64> {
    let result = call(
        executor,
        rt,
        "list",
        DataOperation::ArticleList(ArticleListQuery {
            page_size: Some(100),
            published_only,
            ..ArticleListQuery::default()
        }),
    );
    let DataOutcome::ArticleList(page) = result.outcome.expect("ok") else {
        panic!("expected list");
    };
    page.items.iter().map(|item| item.id).collect()
}

#[test]
fn sqlite_backend_supports_writes_transitions_and_shelf() {
    let rt = runtime();
    let temp = unique_db("sqlite");
    let store = {
        let handle = rt.handle().clone();
        handle
            .block_on(Store::open_test(temp.clone()))
            .expect("store opens")
    };
    let executor = Executor::start(store.handle());

    // create → 草稿态，公开列表不可见，管理列表可见。
    let result = call(
        &executor,
        &rt,
        "create",
        DataOperation::ArticleCreate(write(0, "新建文章 A", "第一批摘要", 1, &[1, 2])),
    );
    // 写操作的语句数随 payload 变化（terms 数），不属于「N+1 与条目数无关」的范围。
    assert!(result.diag.query_count >= 3, "insert + terms + 回读");
    let DataOutcome::ArticleDetail(created) = result.outcome.expect("ok") else {
        panic!("expected detail");
    };
    assert_eq!(created.status, "draft");
    assert_eq!(created.summary, "第一批摘要");
    assert!(created.published_at.is_none());
    assert_eq!(created.term_ids, vec![1, 2]);
    let new_id = created.id;

    assert!(!article_list(&executor, &rt, true).contains(&new_id));
    assert!(article_list(&executor, &rt, false).contains(&new_id));

    // publish → 公开可见；重复 publish → INVALID_STATE_TRANSITION。
    let result = call(
        &executor,
        &rt,
        "publish",
        DataOperation::ArticlePublish(ArticleId { id: new_id }),
    );
    assert!(
        result.diag.query_count >= 3,
        "select 状态 + update + 回读(2)"
    );
    let DataOutcome::ArticleDetail(published) = result.outcome.expect("ok") else {
        panic!("expected detail");
    };
    assert_eq!(published.status, "published");
    assert!(published.published_at.is_some());
    assert!(article_list(&executor, &rt, true).contains(&new_id));

    let failure = call(
        &executor,
        &rt,
        "publish-twice",
        DataOperation::ArticlePublish(ArticleId { id: new_id }),
    )
    .outcome
    .unwrap_err();
    assert_eq!(failure.code, codes::INVALID_STATE_TRANSITION);

    // unpublish → 回到草稿，published_at 清空；再次 unpublish → 同样拒绝。
    let result = call(
        &executor,
        &rt,
        "unpublish",
        DataOperation::ArticleUnpublish(ArticleId { id: new_id }),
    );
    let DataOutcome::ArticleDetail(drafted) = result.outcome.expect("ok") else {
        panic!("expected detail");
    };
    assert_eq!(drafted.status, "draft");
    assert!(drafted.published_at.is_none());
    let failure = call(
        &executor,
        &rt,
        "unpublish-twice",
        DataOperation::ArticleUnpublish(ArticleId { id: new_id }),
    )
    .outcome
    .unwrap_err();
    assert_eq!(failure.code, codes::INVALID_STATE_TRANSITION);

    // 摘要校验：>160 个 Unicode 字符拒绝，160 个合法（按字符而非字节）。
    let too_long = "字".repeat(MAX_SUMMARY_CHARS + 1);
    let failure = call(
        &executor,
        &rt,
        "summary-long",
        DataOperation::ArticleCreate(write(0, "长摘要", &too_long, 1, &[])),
    )
    .outcome
    .unwrap_err();
    assert_eq!(failure.code, codes::INVALID_SUMMARY);
    let exact = "字".repeat(MAX_SUMMARY_CHARS);
    let result = call(
        &executor,
        &rt,
        "summary-exact",
        DataOperation::ArticleCreate(write(0, "边界摘要", &exact, 1, &[])),
    );
    let DataOutcome::ArticleDetail(boundary) = result.outcome.expect("ok") else {
        panic!("expected detail");
    };
    assert_eq!(boundary.summary.chars().count(), MAX_SUMMARY_CHARS);

    // update：不改状态，terms 全量替换，摘要去首尾空白。
    let result = call(
        &executor,
        &rt,
        "update",
        DataOperation::ArticleUpdate(write(
            boundary.id,
            "改名后的文章",
            "  更新后的摘要  ",
            2,
            &[3],
        )),
    );
    let DataOutcome::ArticleDetail(updated) = result.outcome.expect("ok") else {
        panic!("expected detail");
    };
    assert_eq!(updated.summary, "更新后的摘要");
    assert_eq!(updated.article_type_id, 2);
    assert_eq!(updated.term_ids, vec![3]);
    assert_eq!(updated.status, "draft");

    // publish 一篇用于推荐，然后 generate + current（固定 3 次查询，批量加载）。
    let _ = call(
        &executor,
        &rt,
        "publish-2",
        DataOperation::ArticleUpdate(write(new_id, "新建文章 A（更新）", "第二批摘要", 1, &[4])),
    );
    let _ = call(
        &executor,
        &rt,
        "publish-3",
        DataOperation::ArticlePublish(ArticleId { id: new_id }),
    );
    let result = call(
        &executor,
        &rt,
        "generate",
        DataOperation::RecommendationGenerate,
    );
    let DataOutcome::Recommendation(generated) = result.outcome.expect("ok") else {
        panic!("expected recommendation");
    };
    assert_eq!(generated.len(), 6, "MVP 规则：最近更新的 6 篇已发布文章");
    assert_eq!(generated[0].id, new_id, "最近更新的文章排第一");
    let result = call(
        &executor,
        &rt,
        "current",
        DataOperation::RecommendationCurrent,
    );
    // 推荐读取保持固定 3 次（ids + 详情 + 批量 terms），与集合大小无关。
    assert_eq!(result.diag.query_count, 3);
    let DataOutcome::Recommendation(current) = result.outcome.expect("ok") else {
        panic!("expected recommendation");
    };
    assert_eq!(
        current.iter().map(|item| item.id).collect::<Vec<_>>(),
        generated.iter().map(|item| item.id).collect::<Vec<_>>()
    );

    // shelf：固定查询数（types + count + 全量行 + 批量 terms = 4，含推荐再加 3），与条目数无关。
    for (request_id, query, expected) in [
        ("shelf-all", ArticleShelfQuery::default(), 4u32),
        (
            "shelf-filtered",
            ArticleShelfQuery {
                article_type_id: Some(1),
                term_ids: vec![4],
                include_recommendation: true,
                ..ArticleShelfQuery::default()
            },
            7u32,
        ),
    ] {
        let result = call(
            &executor,
            &rt,
            request_id,
            DataOperation::ArticleShelf(query),
        );
        assert_eq!(
            result.diag.query_count, expected,
            "{request_id} 查询数与条目数无关"
        );
        let DataOutcome::ArticleShelf(shelf) = result.outcome.expect("ok") else {
            panic!("expected shelf");
        };
        assert_eq!(shelf.article_types.len(), 3);
        assert!(shelf.total >= 1);
        assert!(shelf.articles.iter().all(|item| item.status == "published"));
        assert!(shelf.recommendation.len() <= 6);
    }
    let result = call(
        &executor,
        &rt,
        "shelf-norec",
        DataOperation::ArticleShelf(ArticleShelfQuery {
            include_recommendation: false,
            ..ArticleShelfQuery::default()
        }),
    );
    let DataOutcome::ArticleShelf(shelf) = result.outcome.expect("ok") else {
        panic!("expected shelf");
    };
    assert_eq!(shelf.recommendation, Vec::new(), "无筛选请求才带推荐");
    // 查询数在 include_recommendation=false 时少 3（推荐三步不执行）。
    assert_eq!(result.diag.query_count, 4);

    // 分类与 term 的写入 + 唯一约束。
    let result = call(
        &executor,
        &rt,
        "type-create",
        DataOperation::ArticleTypeCreate(ArticleTypeName {
            name: "Playbooks".to_owned(),
        }),
    );
    let DataOutcome::ArticleType(kind) = result.outcome.expect("ok") else {
        panic!("expected type");
    };
    assert_eq!(kind.name, "Playbooks");
    let failure = call(
        &executor,
        &rt,
        "type-dup",
        DataOperation::ArticleTypeCreate(ArticleTypeName {
            name: " Engineering ".to_owned(),
        }),
    )
    .outcome
    .unwrap_err();
    assert_eq!(failure.code, codes::DUPLICATE_NAME);
    let result = call(
        &executor,
        &rt,
        "type-rename",
        DataOperation::ArticleTypeUpdate(ArticleTypeRename {
            id: kind.id,
            name: "Handbooks".to_owned(),
        }),
    );
    assert!(matches!(result.outcome, Ok(DataOutcome::Unit(_))));
    let failure = call(
        &executor,
        &rt,
        "type-missing",
        DataOperation::ArticleTypeUpdate(ArticleTypeRename {
            id: 9999,
            name: "Ghost".to_owned(),
        }),
    )
    .outcome
    .unwrap_err();
    assert_eq!(failure.code, codes::NOT_FOUND);

    let result = call(
        &executor,
        &rt,
        "term-create",
        DataOperation::TermCreate(TermWrite {
            id: 0,
            name: "nix".to_owned(),
            kind: "tag".to_owned(),
        }),
    );
    let DataOutcome::Term(term) = result.outcome.expect("ok") else {
        panic!("expected term");
    };
    assert_eq!(term.kind, "tag");
    let failure = call(
        &executor,
        &rt,
        "term-dup",
        DataOperation::TermCreate(TermWrite {
            id: 0,
            name: "rust".to_owned(),
            kind: "topic".to_owned(),
        }),
    )
    .outcome
    .unwrap_err();
    assert_eq!(failure.code, codes::DUPLICATE_NAME);
    let failure = call(
        &executor,
        &rt,
        "term-kind",
        DataOperation::TermCreate(TermWrite {
            id: 0,
            name: "bogus".to_owned(),
            kind: "kind".to_owned(),
        }),
    )
    .outcome
    .unwrap_err();
    assert_eq!(failure.code, codes::INVALID_PAYLOAD);
    let result = call(
        &executor,
        &rt,
        "term-list",
        DataOperation::TermList(TermListQuery {
            kind: Some("tag".to_owned()),
        }),
    );
    let DataOutcome::Terms(tags) = result.outcome.expect("ok") else {
        panic!("expected terms");
    };
    assert!(tags.iter().any(|tag| tag.name == "nix"));

    // 不存在的文章 → NOT_FOUND。
    let failure = call(
        &executor,
        &rt,
        "get-missing",
        DataOperation::ArticleGet(ArticleGetQuery {
            id: 4242,
            published_only: false,
        }),
    )
    .outcome
    .unwrap_err();
    assert_eq!(failure.code, codes::NOT_FOUND);

    // 类型列表反映重命名结果。
    let result = call(
        &executor,
        &rt,
        "types",
        DataOperation::ArticleTypeList(ArticleTypeListQuery::default()),
    );
    let DataOutcome::ArticleTypes(types) = result.outcome.expect("ok") else {
        panic!("expected types");
    };
    assert!(types.iter().any(|kind| kind.name == "Handbooks"));

    rt.block_on(store.shutdown());
    store.remove_storage();
}

#[test]
fn mock_backend_matches_sqlite_semantics_for_writes() {
    let rt = runtime();
    let store = Store::mock();
    let executor = Executor::start(store.handle());

    let result = call(
        &executor,
        &rt,
        "create",
        DataOperation::ArticleCreate(write(0, "Mock 新文章", "mock 摘要", 3, &[2])),
    );
    let DataOutcome::ArticleDetail(created) = result.outcome.expect("ok") else {
        panic!("expected detail");
    };
    assert_eq!(created.status, "draft");
    assert!(created.id > 12, "mock 分配新的自增 id");

    let result = call(
        &executor,
        &rt,
        "publish",
        DataOperation::ArticlePublish(ArticleId { id: created.id }),
    );
    let DataOutcome::ArticleDetail(published) = result.outcome.expect("ok") else {
        panic!("expected detail");
    };
    assert_eq!(published.status, "published");

    // 公开列表出现新文章，且推荐 generate 会把它带上（最近更新第一）。
    let ids = article_list(&executor, &rt, true);
    assert!(ids.contains(&created.id));
    let result = call(
        &executor,
        &rt,
        "generate",
        DataOperation::RecommendationGenerate,
    );
    let DataOutcome::Recommendation(recommendation) = result.outcome.expect("ok") else {
        panic!("expected recommendation");
    };
    assert_eq!(recommendation[0].id, created.id);
    assert_eq!(result.diag.query_count, 7, "与 SQLite 的 generate 步骤一致");

    let result = call(
        &executor,
        &rt,
        "shelf",
        DataOperation::ArticleShelf(ArticleShelfQuery {
            include_recommendation: true,
            ..ArticleShelfQuery::default()
        }),
    );
    assert_eq!(result.diag.query_count, 7, "与 SQLite 路径同一计数口径");
    let DataOutcome::ArticleShelf(shelf) = result.outcome.expect("ok") else {
        panic!("expected shelf");
    };
    assert!(shelf.articles.len() >= 10);
    assert_eq!(shelf.recommendation[0].id, created.id);
}
