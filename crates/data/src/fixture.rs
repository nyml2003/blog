//! 稳定夹具：`mock` 语义的内存数据源，同时是 `test` 语义的 seed 来源。
//!
//! 两个语义共享同一份夹具定义，保证 `ops runtime backend --data mock` 与
//! `--data test` 的可复现性（PLAN 验收 5：test 每次全新临时库 + 稳定 seed）。
//!
//! 数据集刻意覆盖边界：空摘要合法（ARCH-DATA-API）、draft 不出现在公开查询、
//! 无 terms 的文章、单篇文章挂多个 terms、`updated_at DESC, id DESC` 排序。

pub const FIXTURE_STAMP: &str = "2026-09-01T00:00:00.000000000Z";

pub struct FixtureArticleType {
    pub id: i64,
    pub name: &'static str,
}

pub struct FixtureTerm {
    pub id: i64,
    pub name: &'static str,
    pub kind: &'static str,
}

pub struct FixtureArticle {
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

/// 文章类型；`id` 与 Go 参考实现的迁移后主键语义一致（显式 id 插入）。
pub const ARTICLE_TYPES: &[FixtureArticleType] = &[
    FixtureArticleType {
        id: 1,
        name: "Engineering",
    },
    FixtureArticleType {
        id: 2,
        name: "Field Notes",
    },
    FixtureArticleType {
        id: 3,
        name: "Announcements",
    },
];

pub const TERMS: &[FixtureTerm] = &[
    FixtureTerm {
        id: 1,
        name: "rust",
        kind: "topic",
    },
    FixtureTerm {
        id: 2,
        name: "sqlite",
        kind: "topic",
    },
    FixtureTerm {
        id: 3,
        name: "frontend",
        kind: "tag",
    },
    FixtureTerm {
        id: 4,
        name: "runtime",
        kind: "tag",
    },
];

/// 9 篇 published + 3 篇 draft；`updated_at` 随 `id` 递增而递增，
/// 因此默认排序 `updated_at DESC, id DESC` 等价于 id 降序，便于断言。
pub const ARTICLES: &[FixtureArticle] = &[
    FixtureArticle {
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
    FixtureArticle {
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
    FixtureArticle {
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
    FixtureArticle {
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
    FixtureArticle {
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
    FixtureArticle {
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
    FixtureArticle {
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
    FixtureArticle {
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
    FixtureArticle {
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
    FixtureArticle {
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
    FixtureArticle {
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
    FixtureArticle {
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

/// 当前生效推荐集合：最近更新的 6 篇 published 文章（ARCH-DATA-API MVP 规则）。
pub const RECOMMENDATION_ARTICLE_IDS: &[i64] = &[12, 11, 10, 9, 8, 7];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_unique_and_ordering_is_deterministic() {
        let mut ids: Vec<i64> = ARTICLES.iter().map(|a| a.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), ARTICLES.len());

        // published 数量与默认排序（updated_at DESC, id DESC）断言。
        let published: Vec<&FixtureArticle> = ARTICLES
            .iter()
            .filter(|a| a.status == "published")
            .collect();
        assert_eq!(published.len(), 9);
        let mut sorted: Vec<&FixtureArticle> = ARTICLES.iter().collect();
        sorted.sort_by(|a, b| (b.updated_at, b.id).cmp(&(a.updated_at, a.id)));
        assert_eq!(sorted[0].id, 12);
        assert_eq!(sorted[11].id, 1);
    }

    #[test]
    fn references_stay_consistent() {
        for article in ARTICLES {
            assert!(
                ARTICLE_TYPES
                    .iter()
                    .any(|t| t.id == article.article_type_id),
                "article {} references unknown type",
                article.id
            );
            for term_id in article.term_ids {
                assert!(
                    TERMS.iter().any(|t| t.id == *term_id),
                    "article {} references unknown term {}",
                    article.id,
                    term_id
                );
            }
            assert_eq!(
                (article.status == "published"),
                article.published_at.is_some(),
                "article {} status/published_at mismatch",
                article.id
            );
        }
        for id in RECOMMENDATION_ARTICLE_IDS {
            let article = ARTICLES.iter().find(|a| a.id == *id).unwrap();
            assert_eq!(
                article.status, "published",
                "recommendation must reference published only"
            );
        }
        assert_eq!(ARTICLE_TYPES.iter().map(|t| t.id).max(), Some(3));
        assert_eq!(TERMS.iter().map(|t| t.id).max(), Some(4));
    }

    #[test]
    fn empty_summary_is_present() {
        let empty = ARTICLES.iter().find(|a| a.id == 7).unwrap();
        assert_eq!(empty.summary, "");
    }
}
