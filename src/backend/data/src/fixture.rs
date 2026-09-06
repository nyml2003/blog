//! 稳定夹具：`mock` 语义的内存数据源，同时是 `test` 语义的 seed 来源。
//!
//! 两个语义共享同一份夹具定义，保证 `ops runtime backend --data mock` 与
//! `--data test` 的可复现性（PLAN 验收 5：test 每次全新临时库 + 稳定 seed）。
//!
//! 数据集刻意覆盖边界：空摘要合法（ARCH-DATA-API）、draft 不出现在公开查询、
//! 无 terms 的文章、单篇文章挂多个 terms、`updated_at DESC, id DESC` 排序。
//!
//! **体量（SPEC-MOBILE-BROWSE-IA-001 走查用）**：48 篇 = 显式头部 12 篇（id 1..=12，
//! 原样保留）+ 确定性追加 36 篇（id 13..=48，全部 published）。追加块没有随机源：
//! 类型/terms/时间戳是固定的字面量表（见 [`ARTICLES`] 上方注释），标题/摘要/正文由
//! `id` 与类型名在编译期拼接（`concat!`），跨运行、跨进程完全一致。
//!
//! **对齐责任**：本文件与 `src/backend/mock/src/seed.rs` 必须保持**同一批** id、标题、
//! 状态与时间戳（两侧 shape 测试断言同一组数字）。修改任一侧的头部或追加块，
//! 必须同步另一侧，否则前端在 Mock 与真实后端之间切换会看到不同数据。

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
    // 追加块引入的两个维度（SPEC-MOBILE-BROWSE-IA-001：AND 组合需要非平凡收窄）。
    FixtureTerm {
        id: 5,
        name: "tooling",
        kind: "topic",
    },
    FixtureTerm {
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
/// `mock/src/seed.rs` 有一份**逐字相同**的展开与调用表，两侧必须同步修改。
macro_rules! appended_article {
    ($id:literal, $type_id:literal, $type_name:literal, $updated_at:expr, $term_ids:expr) => {
        FixtureArticle {
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

/// 当前生效推荐集合：最近更新的 6 篇 published 文章（ARCH-DATA-API MVP 规则）。
///
/// 追加块的时间戳晚于头部，因此「最近更新」落在 id 43..=48。
pub const RECOMMENDATION_ARTICLE_IDS: &[i64] = &[48, 47, 46, 45, 44, 43];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_unique_and_ordering_is_deterministic() {
        let mut ids: Vec<i64> = ARTICLES.iter().map(|a| a.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), ARTICLES.len());
        assert_eq!(ids.len(), 48, "12 篇显式头部 + 36 篇确定性追加");

        // published 数量与默认排序（updated_at DESC, id DESC）断言：
        // 追加块时间戳随 id 非递减 → 排序等价于 id 降序。
        let published: Vec<&FixtureArticle> = ARTICLES
            .iter()
            .filter(|a| a.status == "published")
            .collect();
        assert_eq!(published.len(), 45, "9 篇头部 + 36 篇追加");
        assert_eq!(ARTICLES.iter().filter(|a| a.status == "draft").count(), 3);
        let mut sorted: Vec<&FixtureArticle> = ARTICLES.iter().collect();
        sorted.sort_by(|a, b| (b.updated_at, b.id).cmp(&(a.updated_at, a.id)));
        assert_eq!(sorted[0].id, 48);
        assert_eq!(sorted[44].id, 4);
        assert_eq!(sorted[47].id, 1);
    }

    /// 类型分布（published）：覆盖货架截断 / 单页到底 / 无「查看全部」三个走查样本。
    #[test]
    fn published_distribution_covers_the_browse_walkthrough() {
        let published: Vec<&FixtureArticle> = ARTICLES
            .iter()
            .filter(|a| a.status == "published")
            .collect();
        let count_of = |type_id: i64| {
            published
                .iter()
                .filter(|article| article.article_type_id == type_id)
                .count()
        };
        assert_eq!(
            count_of(1),
            28,
            "Engineering：> 6（货架「查看全部」）且 > 20（平铺页翻到底）"
        );
        assert_eq!(count_of(2), 12, "Field Notes：> 6 且 ≤ 20（单页到底）");
        assert_eq!(count_of(3), 5, "Announcements：≤ 6（无「查看全部」）");
    }

    /// term 命中矩阵（published）：与 `mock/src/seed.rs` 断言同一组数字。
    #[test]
    fn term_hit_matrix_stays_meaningful() {
        let published: Vec<&FixtureArticle> = ARTICLES
            .iter()
            .filter(|a| a.status == "published")
            .collect();
        let hits = |term_id: i64| {
            published
                .iter()
                .filter(|article| article.term_ids.contains(&term_id))
                .count()
        };
        let hits_with_type = |type_id: i64, term_id: i64| {
            published
                .iter()
                .filter(|article| {
                    article.article_type_id == type_id && article.term_ids.contains(&term_id)
                })
                .count()
        };
        for term_id in 1..=6 {
            assert!(hits(term_id) > 0, "term {term_id} must hit at least one");
        }
        // 非平凡收窄：Engineering 28 → +tooling(topic 5) 9 → 再 +ops(tag 6) 3。
        assert_eq!(hits_with_type(1, 5), 9);
        assert_eq!(
            published
                .iter()
                .filter(|article| article.article_type_id == 1
                    && article.term_ids.contains(&5)
                    && article.term_ids.contains(&6))
                .count(),
            3
        );
        assert_eq!(
            hits(1) + hits(2) + hits(3) + hits(4) + hits(5) + hits(6),
            60
        );
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
        assert_eq!(TERMS.iter().map(|t| t.id).max(), Some(6));
    }

    #[test]
    fn empty_summary_is_present() {
        let empty = ARTICLES.iter().find(|a| a.id == 7).unwrap();
        assert_eq!(empty.summary, "");
    }
}
