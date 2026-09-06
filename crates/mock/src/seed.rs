//! 固定 seed：Mock 的数据集定义（跨运行、跨进程完全一致）。
//!
//! **与 Data `test` 语义的 seed 完全对齐**（`crates/data/src/fixture.rs`）：同一批
//! id、标题、状态与时间戳，使前端在 `ops runtime backend --data test`（真实）与
//! `ops runtime dev`（Mock）之间切换时看到同一批数据，不需要改断言。
//!
//! 「生成器」的取舍：这里用**显式表**而不是 PRNG——固定 seed 的可复现性由「没有
//! 随机源」直接保证，也避免为 Mock 引入 `rand` 依赖；差异只在内容层面（与 Data
//! 完全相同的 9 篇 published + 3 篇 draft、3 个类型、4 个 term、6 篇推荐）。
//!
//! 覆盖的领域边界与 Data 夹具一致：空摘要合法、draft 不出现在公开查询、无 terms
//! 的文章、单篇挂多个 terms、`updated_at DESC, id DESC` 排序。

pub const FIXTURE_STAMP: &str = "2026-09-01T00:00:00.000000000Z";

pub struct SeedArticleType {
    pub id: i64,
    pub name: &'static str,
}

pub struct SeedTerm {
    pub id: i64,
    pub name: &'static str,
    pub kind: &'static str,
}

pub struct SeedArticle {
    pub id: i64,
    pub title: &'static str,
    pub summary: &'static str,
    pub article_type_id: i64,
    pub content_html: &'static str,
    pub status: &'static str,
    pub created_at: &'static str,
    pub updated_at: &'static str,
    pub published_at: Option<&'static str>,
    pub term_ids: &'static [i64],
}

pub const ARTICLE_TYPES: &[SeedArticleType] = &[
    SeedArticleType {
        id: 1,
        name: "Engineering",
    },
    SeedArticleType {
        id: 2,
        name: "Field Notes",
    },
    SeedArticleType {
        id: 3,
        name: "Announcements",
    },
];

pub const TERMS: &[SeedTerm] = &[
    SeedTerm {
        id: 1,
        name: "rust",
        kind: "topic",
    },
    SeedTerm {
        id: 2,
        name: "sqlite",
        kind: "topic",
    },
    SeedTerm {
        id: 3,
        name: "frontend",
        kind: "tag",
    },
    SeedTerm {
        id: 4,
        name: "runtime",
        kind: "tag",
    },
];

/// 9 篇 published + 3 篇 draft；`updated_at` 随 `id` 递增而递增，
/// 因此默认排序 `updated_at DESC, id DESC` 等价于 id 降序，便于断言。
pub const ARTICLES: &[SeedArticle] = &[
    SeedArticle {
        id: 12,
        title: "Ops runtime 验收清单",
        summary: "把运行模式、端口与注入固定为可验收契约。",
        article_type_id: 2,
        content_html: "<p>runtime acceptance checklist</p>",
        status: "published",
        created_at: "2026-08-05T09:00:00.000000000Z",
        updated_at: "2026-09-05T12:00:00.000000000Z",
        published_at: Some("2026-08-05T10:00:00.000000000Z"),
        term_ids: &[4],
    },
    SeedArticle {
        id: 11,
        title: "Tokio current_thread 运行时实践",
        summary: "单线程 runtime 承载网关与业务逻辑。",
        article_type_id: 1,
        content_html: "<p>current_thread runtime notes</p>",
        status: "published",
        created_at: "2026-08-04T09:00:00.000000000Z",
        updated_at: "2026-09-04T12:00:00.000000000Z",
        published_at: Some("2026-08-04T10:00:00.000000000Z"),
        term_ids: &[1, 4],
    },
    SeedArticle {
        id: 10,
        title: "SQLite 迁移自动化",
        summary: "迁移在 Data 启动时自动执行。",
        article_type_id: 1,
        content_html: "<p>automatic migrations</p>",
        status: "published",
        created_at: "2026-08-03T09:00:00.000000000Z",
        updated_at: "2026-09-03T12:00:00.000000000Z",
        published_at: Some("2026-08-03T10:00:00.000000000Z"),
        term_ids: &[2],
    },
    SeedArticle {
        id: 9,
        title: "背压即契约",
        summary: "通道满返回 503 是运行契约的一部分。",
        article_type_id: 1,
        content_html: "<p>backpressure as contract</p>",
        status: "published",
        created_at: "2026-08-02T09:00:00.000000000Z",
        updated_at: "2026-09-02T12:00:00.000000000Z",
        published_at: Some("2026-08-02T10:00:00.000000000Z"),
        term_ids: &[4],
    },
    SeedArticle {
        id: 8,
        title: "前端 Client 注入点",
        summary: "注入面收敛在 composition root。",
        article_type_id: 2,
        content_html: "<p>client injection seam</p>",
        status: "published",
        created_at: "2026-08-01T09:00:00.000000000Z",
        updated_at: "2026-09-01T12:00:00.000000000Z",
        published_at: Some("2026-08-01T10:00:00.000000000Z"),
        term_ids: &[3],
    },
    SeedArticle {
        id: 7,
        title: "发布流程速记",
        summary: "",
        article_type_id: 3,
        content_html: "<p>publishing notes with empty summary</p>",
        status: "published",
        created_at: "2026-07-31T09:00:00.000000000Z",
        updated_at: "2026-08-31T12:00:00.000000000Z",
        published_at: Some("2026-07-31T10:00:00.000000000Z"),
        term_ids: &[],
    },
    SeedArticle {
        id: 6,
        title: "Mock 场景清单",
        summary: "正常、空数据、延迟、不可用与协议错误。",
        article_type_id: 2,
        content_html: "<p>mock scenarios</p>",
        status: "published",
        created_at: "2026-07-30T09:00:00.000000000Z",
        updated_at: "2026-08-30T12:00:00.000000000Z",
        published_at: Some("2026-07-30T10:00:00.000000000Z"),
        term_ids: &[3, 4],
    },
    SeedArticle {
        id: 5,
        title: "端口分配策略",
        summary: "候选端口 + 有界递增 + 实际绑定为准。",
        article_type_id: 1,
        content_html: "<p>port allocation</p>",
        status: "published",
        created_at: "2026-07-29T09:00:00.000000000Z",
        updated_at: "2026-08-29T12:00:00.000000000Z",
        published_at: Some("2026-07-29T10:00:00.000000000Z"),
        term_ids: &[],
    },
    SeedArticle {
        id: 4,
        title: "日志前缀约定",
        summary: "每行带稳定来源前缀。",
        article_type_id: 3,
        content_html: "<p>log prefixes</p>",
        status: "published",
        created_at: "2026-07-28T09:00:00.000000000Z",
        updated_at: "2026-08-28T12:00:00.000000000Z",
        published_at: Some("2026-07-28T10:00:00.000000000Z"),
        term_ids: &[2],
    },
    SeedArticle {
        id: 3,
        title: "草稿：TLS 终止计划",
        summary: "公网部署另立 plan。",
        article_type_id: 1,
        content_html: "<p>tls termination draft</p>",
        status: "draft",
        created_at: "2026-07-27T09:00:00.000000000Z",
        updated_at: "2026-08-27T12:00:00.000000000Z",
        published_at: None,
        term_ids: &[1],
    },
    SeedArticle {
        id: 2,
        title: "草稿：全文搜索",
        summary: "MVP 不含全文搜索。",
        article_type_id: 2,
        content_html: "<p>search draft</p>",
        status: "draft",
        created_at: "2026-07-26T09:00:00.000000000Z",
        updated_at: "2026-08-26T12:00:00.000000000Z",
        published_at: None,
        term_ids: &[3],
    },
    SeedArticle {
        id: 1,
        title: "草稿：缓存与跨请求去重",
        summary: "本期不做全局缓存。",
        article_type_id: 2,
        content_html: "<p>cache draft</p>",
        status: "draft",
        created_at: "2026-07-25T09:00:00.000000000Z",
        updated_at: "2026-08-25T12:00:00.000000000Z",
        published_at: None,
        term_ids: &[4],
    },
];

/// 初始生效推荐集合：最近更新的 6 篇 published 文章（ARCH-DATA-API MVP 规则）。
pub const RECOMMENDATION_ARTICLE_IDS: &[i64] = &[12, 11, 10, 9, 8, 7];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_matches_the_data_test_fixture_shape() {
        // 与 crates/data/src/fixture.rs 的 `ids_are_unique_and_ordering_is_deterministic`
        // 同一组断言：Mock 与 Data(test) 的前端可见数据集保持一致。
        assert_eq!(ARTICLES.len(), 12);
        assert_eq!(
            ARTICLES
                .iter()
                .filter(|article| article.status == "published")
                .count(),
            9
        );
        let mut sorted: Vec<&SeedArticle> = ARTICLES.iter().collect();
        sorted.sort_by(|a, b| (b.updated_at, b.id).cmp(&(a.updated_at, a.id)));
        assert_eq!(sorted[0].id, 12);
        assert_eq!(sorted[11].id, 1);
        assert_eq!(ARTICLE_TYPES.len(), 3);
        assert_eq!(TERMS.len(), 4);
        assert_eq!(RECOMMENDATION_ARTICLE_IDS.len(), 6);
    }

    #[test]
    fn references_stay_consistent() {
        for article in ARTICLES {
            assert!(
                ARTICLE_TYPES
                    .iter()
                    .any(|kind| kind.id == article.article_type_id),
                "article {} references unknown type",
                article.id
            );
            for term_id in article.term_ids {
                assert!(
                    TERMS.iter().any(|term| term.id == *term_id),
                    "article {} references unknown term {term_id}",
                    article.id
                );
            }
            assert_eq!(
                article.status == "published",
                article.published_at.is_some(),
                "article {} status/published_at mismatch",
                article.id
            );
        }
        for id in RECOMMENDATION_ARTICLE_IDS {
            let article = ARTICLES.iter().find(|article| article.id == *id).unwrap();
            assert_eq!(article.status, "published");
        }
        assert_eq!(
            ARTICLES.iter().map(|article| article.id).max(),
            Some(12),
            "next id must be predictable"
        );
    }

    #[test]
    fn empty_summary_is_represented() {
        let empty = ARTICLES.iter().find(|article| article.id == 7).unwrap();
        assert_eq!(empty.summary, "");
    }
}
