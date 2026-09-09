//! 固定 seed：Mock 的数据集定义（跨运行、跨进程完全一致）。
//!
//! **与 Data `test` 语义的 seed 完全对齐**（`crates/data/src/fixture.rs`）：同一批
//! id、标题、状态与时间戳，使前端在 `ops runtime backend --data test`（真实）与
//! `ops runtime dev`（Mock）之间切换时看到同一批数据，不需要改断言。
//!
//! 「生成器」的取舍：这里用**显式表 + 编译期拼接**而不是 PRNG——固定 seed 的可复现性
//! 由「没有随机源」直接保证，也避免为 Mock 引入 `rand` 依赖。头部 12 篇逐字面量显式；
//! 追加块 36 篇（id 13..=48）由 [`appended_article`] 宏展开，标题/摘要/正文由 `id`
//! 与类型名在编译期拼接，跨运行、跨进程完全一致（与 Data 侧同一份调用表）。
//!
//! 覆盖的领域边界与 Data 夹具一致：空摘要合法、draft 不出现在公开查询、无 terms
//! 的文章、单篇挂多个 terms、`updated_at DESC, id DESC` 排序。
//!
//! **对齐责任**：修改头部或追加块（id、标题、状态、时间戳、terms）必须同步
//! `src/backend/data/src/fixture.rs`，两侧 shape 测试断言同一组数字。

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
    // 追加块引入的两个维度。
    SeedTerm {
        id: 5,
        name: "tooling",
        kind: "topic",
    },
    SeedTerm {
        id: 6,
        name: "ops",
        kind: "tag",
    },
];

/// 追加块的 `created_at` / `published_at`（晚于头部时间轴，避免污染日期过滤断言）。
const APPEND_CREATED_AT: &str = "2026-09-05T09:00:00.000000000Z";

/// 追加块的 `updated_at` 档位：每 6 篇一档、随 id **非递减** —— 因此默认排序
/// `updated_at DESC, id DESC` 仍等价于 `id DESC`（同档位由 `id DESC` 决胜）。
const STAMP_A: &str = "2026-09-05T13:00:00.000000000Z";
const STAMP_B: &str = "2026-09-05T15:00:00.000000000Z";
const STAMP_C: &str = "2026-09-05T17:00:00.000000000Z";
const STAMP_D: &str = "2026-09-05T19:00:00.000000000Z";
const STAMP_E: &str = "2026-09-05T21:00:00.000000000Z";
const STAMP_F: &str = "2026-09-05T23:00:00.000000000Z";

/// 追加块的单行展开：`(id, 类型id, 类型名, updated_at, terms)` → 完整行。
///
/// 标题/摘要/正文由 `id` 与类型名在编译期拼接，无随机源、无运行时分配；状态恒为
/// `published`（draft 只存在于头部，保住「公开查询不含草稿」的边界样本）。
/// `data/src/fixture.rs` 有一份**逐字相同**的展开与调用表，两侧必须同步修改。
macro_rules! appended_article {
    ($id:literal, $type_id:literal, $type_name:literal, $updated_at:expr, $term_ids:expr) => {
        SeedArticle {
            id: $id,
            title: concat!("追加样本 #", stringify!($id), " · ", $type_name),
            summary: concat!(
                "确定性追加的第 ",
                stringify!($id),
                " 篇样本（",
                $type_name,
                "）。"
            ),
            article_type_id: $type_id,
            content_html: concat!("<p>append-", stringify!($id), "</p>"),
            status: "published",
            created_at: APPEND_CREATED_AT,
            updated_at: $updated_at,
            published_at: Some(APPEND_CREATED_AT),
            term_ids: $term_ids,
        }
    };
}

/// 48 篇 = 9 篇 published 头部 + 36 篇追加 + 3 篇 draft（仅头部）。
///
/// 追加块按 **12 槽位周期重复 3 次**（id 13..=48），类型分布 Engineering 24 /
/// Field Notes 9 / Announcements 3，叠加头部后 published 为 Engineering 28 /
/// Field Notes 12 / Announcements 5——分别覆盖「货架截断 + 平铺页翻到底（28 > 20）」、
/// 「单页到底（12 < 20）」与「无“查看全部”（5 ≤ 6）」三个走查样本。
///
/// terms 槽位让 AND 组合有非平凡收窄：Engineering + `tooling`(topic 5) 命中 9 篇，
/// 再叠加 `ops`(tag 6) 收窄到 3 篇；`rust` + `frontend` 恒为空（空态样本）。
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
    // ---- 追加块周期 1（id 13..=24；槽位类型 E×8 → F×3 → A×1）----
    appended_article!(13, 1, "Engineering", STAMP_A, &[5]),
    appended_article!(14, 1, "Engineering", STAMP_A, &[6]),
    appended_article!(15, 1, "Engineering", STAMP_A, &[5, 6]),
    appended_article!(16, 1, "Engineering", STAMP_A, &[5, 1]),
    appended_article!(17, 1, "Engineering", STAMP_A, &[1]),
    appended_article!(18, 1, "Engineering", STAMP_A, &[2]),
    appended_article!(19, 1, "Engineering", STAMP_B, &[3]),
    appended_article!(20, 1, "Engineering", STAMP_B, &[4]),
    appended_article!(21, 2, "Field Notes", STAMP_B, &[5, 4]),
    appended_article!(22, 2, "Field Notes", STAMP_B, &[6, 1]),
    appended_article!(23, 2, "Field Notes", STAMP_B, &[2, 6]),
    appended_article!(24, 3, "Announcements", STAMP_B, &[3]),
    // ---- 追加块周期 2（id 25..=36）----
    appended_article!(25, 1, "Engineering", STAMP_C, &[5]),
    appended_article!(26, 1, "Engineering", STAMP_C, &[6]),
    appended_article!(27, 1, "Engineering", STAMP_C, &[5, 6]),
    appended_article!(28, 1, "Engineering", STAMP_C, &[5, 1]),
    appended_article!(29, 1, "Engineering", STAMP_C, &[1]),
    appended_article!(30, 1, "Engineering", STAMP_C, &[2]),
    appended_article!(31, 1, "Engineering", STAMP_D, &[3]),
    appended_article!(32, 1, "Engineering", STAMP_D, &[4]),
    appended_article!(33, 2, "Field Notes", STAMP_D, &[5, 4]),
    appended_article!(34, 2, "Field Notes", STAMP_D, &[6, 1]),
    appended_article!(35, 2, "Field Notes", STAMP_D, &[2, 6]),
    appended_article!(36, 3, "Announcements", STAMP_D, &[3]),
    // ---- 追加块周期 3（id 37..=48，最新 updated_at = 当前推荐集合）----
    appended_article!(37, 1, "Engineering", STAMP_E, &[5]),
    appended_article!(38, 1, "Engineering", STAMP_E, &[6]),
    appended_article!(39, 1, "Engineering", STAMP_E, &[5, 6]),
    appended_article!(40, 1, "Engineering", STAMP_E, &[5, 1]),
    appended_article!(41, 1, "Engineering", STAMP_E, &[1]),
    appended_article!(42, 1, "Engineering", STAMP_E, &[2]),
    appended_article!(43, 1, "Engineering", STAMP_F, &[3]),
    appended_article!(44, 1, "Engineering", STAMP_F, &[4]),
    appended_article!(45, 2, "Field Notes", STAMP_F, &[5, 4]),
    appended_article!(46, 2, "Field Notes", STAMP_F, &[6, 1]),
    appended_article!(47, 2, "Field Notes", STAMP_F, &[2, 6]),
    appended_article!(48, 3, "Announcements", STAMP_F, &[3]),
];

/// 初始生效推荐集合：最近更新的 6 篇 published 文章（ARCH-DATA-API MVP 规则）。
///
/// 追加块的时间戳晚于头部，因此「最近更新」落在 id 43..=48。
pub const RECOMMENDATION_ARTICLE_IDS: &[i64] = &[48, 47, 46, 45, 44, 43];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_matches_the_data_test_fixture_shape() {
        // 与 crates/data/src/fixture.rs 的 `ids_are_unique_and_ordering_is_deterministic`
        // 同一组断言：Mock 与 Data(test) 的前端可见数据集保持一致。
        assert_eq!(ARTICLES.len(), 48, "12 篇显式头部 + 36 篇确定性追加");
        assert_eq!(
            ARTICLES
                .iter()
                .filter(|article| article.status == "published")
                .count(),
            45
        );
        assert_eq!(ARTICLES.iter().filter(|a| a.status == "draft").count(), 3);
        let mut sorted: Vec<&SeedArticle> = ARTICLES.iter().collect();
        sorted.sort_by(|a, b| (b.updated_at, b.id).cmp(&(a.updated_at, a.id)));
        assert_eq!(sorted[0].id, 48);
        assert_eq!(sorted[44].id, 4);
        assert_eq!(sorted[47].id, 1);
        assert_eq!(ARTICLE_TYPES.len(), 3);
        assert_eq!(TERMS.len(), 6);
        assert_eq!(RECOMMENDATION_ARTICLE_IDS.len(), 6);
        assert_eq!(RECOMMENDATION_ARTICLE_IDS, &[48, 47, 46, 45, 44, 43]);
    }

    /// 与 Data 夹具同一组分布/命中矩阵：两侧任一侧改动而另一侧未同步时在此失败。
    #[test]
    fn distribution_matches_the_data_fixture() {
        let published: Vec<&SeedArticle> = ARTICLES
            .iter()
            .filter(|article| article.status == "published")
            .collect();
        let count_of = |type_id: i64| {
            published
                .iter()
                .filter(|article| article.article_type_id == type_id)
                .count()
        };
        assert_eq!(count_of(1), 28, "Engineering：货架截断 + 平铺页翻到底");
        assert_eq!(count_of(2), 12, "Field Notes：单页到底");
        assert_eq!(count_of(3), 5, "Announcements：无「查看全部」");

        let hits = |term_id: i64| {
            published
                .iter()
                .filter(|article| article.term_ids.contains(&term_id))
                .count()
        };
        let typed = |type_id: i64, term_id: i64| {
            published
                .iter()
                .filter(|article| {
                    article.article_type_id == type_id && article.term_ids.contains(&term_id)
                })
                .count()
        };
        assert_eq!(
            (1..=6).map(hits).collect::<Vec<_>>(),
            vec![10, 8, 8, 10, 12, 12]
        );
        assert_eq!(typed(1, 5), 9, "Engineering + tooling");
        assert_eq!(
            published
                .iter()
                .filter(|article| article.article_type_id == 1
                    && article.term_ids.contains(&5)
                    && article.term_ids.contains(&6))
                .count(),
            3,
            "Engineering + tooling + ops（非平凡 AND 收窄）"
        );
        assert_eq!(typed(2, 6), 6, "Field Notes + ops");
        // AND 空态样本 + article_list 的 OR 样本。
        assert_eq!(
            published
                .iter()
                .filter(|article| article.term_ids.contains(&1) && article.term_ids.contains(&3))
                .count(),
            0
        );
        assert_eq!(
            published
                .iter()
                .filter(|article| article.term_ids.contains(&1) || article.term_ids.contains(&3))
                .count(),
            18
        );
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
            Some(48),
            "next id must be predictable"
        );
        assert_eq!(TERMS.iter().map(|term| term.id).max(), Some(6));
    }

    #[test]
    fn empty_summary_is_represented() {
        let empty = ARTICLES.iter().find(|article| article.id == 7).unwrap();
        assert_eq!(empty.summary, "");
    }
}
