//! `sceneCode` 常量（ARCH-DATA-API：`端点.场景` 命名）。
//!
//! Product 与 Mock Product API 暴露同一路由集合，两侧必须引用**同一份**常量：
//! 前端在真实后端与 Mock 之间切换时不改变任何请求，场景名拼错在编译期即可发现。
//! 取值集合与已移除的 Go 参考实现行为对齐（2026-09-06 退场）。

pub const ARTICLE_LIST: &str = "public.article_list";
/// Mobile 平铺页的分页检索：type/topic/tag
/// 三个独立维度各单选、维度间 AND；与 `article_list` 的 `term_ids`（同维度 OR）并存。
pub const ARTICLE_BROWSE: &str = "public.article_browse";
pub const ARTICLE_DETAIL: &str = "public.article_detail";
pub const ARTICLE_TYPE_LIST: &str = "public.article_type_list";
pub const TERM_LIST: &str = "public.term_list";
pub const RECOMMENDATION_CURRENT: &str = "public.recommendation_current";
pub const MOBILE_ARTICLE_SHELF: &str = "public.mobile_article_shelf";
/// 公开端 T 型货架：顶部类型筛选 + 当前类型的有界文章集合。
pub const T_SHELF: &str = "public.t_shelf";
pub const TAXONOMY_TREE: &str = "public.taxonomy_tree";
pub const MOBILE_CATEGORY_SHELF: &str = "public.mobile_category_shelf";
/// 页面路由清单：前端导航不持有 URL 字面量，统一由本场景下发。
pub const SITE_ROUTES: &str = "public.site_routes";
pub const MOBILE_PAGE: &str = "public.mobile_page";
pub const ADMIN_SESSION_CREATE: &str = "admin.session.create";
pub const ADMIN_SESSION_DELETE: &str = "admin.session.delete";
pub const ADMIN_ARTICLE_LIST: &str = "admin.article_list";
pub const ADMIN_ARTICLE_DETAIL: &str = "admin.article_detail";
pub const ADMIN_ARTICLE_CREATE: &str = "admin.article_create";
pub const ADMIN_ARTICLE_UPDATE: &str = "admin.article_update";
pub const ADMIN_ARTICLE_PUBLISH: &str = "admin.article_publish";
pub const ADMIN_ARTICLE_UNPUBLISH: &str = "admin.article_unpublish";
pub const ADMIN_ARTICLE_TYPE_LIST: &str = "admin.article_type_list";
pub const ADMIN_ARTICLE_TYPE_CREATE: &str = "admin.article_type_create";
pub const ADMIN_ARTICLE_TYPE_UPDATE: &str = "admin.article_type_update";
pub const ADMIN_TERM_LIST: &str = "admin.term_list";
pub const ADMIN_TERM_CREATE: &str = "admin.term_create";
pub const ADMIN_TERM_UPDATE: &str = "admin.term_update";
pub const ADMIN_RECOMMENDATION_GENERATE: &str = "admin.recommendation_generate";
pub const ADMIN_CONTENT_WORKSPACE: &str = "admin.content_workspace";
pub const ADMIN_CONTENT_ARTICLE_LIST: &str = "admin.content_article_list";
pub const ADMIN_CONTENT_ARTICLE_DETAIL: &str = "admin.content_article_detail";
pub const ADMIN_CONTENT_ARTICLE_SAVE: &str = "admin.content_article_save";
pub const ADMIN_CONTENT_ARTICLE_REMOVE: &str = "admin.content_article_remove";
pub const ADMIN_CONTENT_TAXONOMY_SAVE: &str = "admin.content_taxonomy_save";
pub const ADMIN_CONTENT_TAXONOMY_ANALYZE: &str = "admin.content_taxonomy_analyze";
pub const ADMIN_CONTENT_TAXONOMY_REVIEW: &str = "admin.content_taxonomy_review";
pub const ADMIN_CONTENT_PREVIEW: &str = "admin.content_preview";
pub const ADMIN_CONTENT_SUBMIT: &str = "admin.content_submit";
pub const ADMIN_CONTENT_ABANDON: &str = "admin.content_abandon";
pub const ADMIN_CONTENT_SYNC: &str = "admin.content_sync";
pub const ADMIN_CONTENT_SYNC_STATUS: &str = "admin.content_sync_status";

pub const PUBLIC_ARTICLES_ENDPOINT: &str = "/api/public/articles";
pub const PUBLIC_ARTICLE_TYPES_ENDPOINT: &str = "/api/public/article-types";
pub const PUBLIC_TERMS_ENDPOINT: &str = "/api/public/terms";
pub const PUBLIC_RECOMMENDATIONS_ENDPOINT: &str = "/api/public/recommendations";
pub const MOBILE_ARTICLE_SHELF_ENDPOINT: &str = "/api/public/mobile/article-shelf";
pub const T_SHELF_ENDPOINT: &str = "/api/public/t-shelf";
pub const PUBLIC_TAXONOMY_ENDPOINT: &str = "/api/public/taxonomy";
pub const MOBILE_CATEGORY_SHELF_ENDPOINT: &str = "/api/public/mobile/category-shelf";
pub const PUBLIC_SITE_ROUTES_ENDPOINT: &str = "/api/public/site-routes";
pub const MOBILE_PAGE_ENDPOINT: &str = "/api/public/mobile/page";
pub const ADMIN_SESSION_ENDPOINT: &str = "/api/admin/session";
pub const ADMIN_ARTICLES_ENDPOINT: &str = "/api/admin/articles";
pub const ADMIN_ARTICLE_TYPES_ENDPOINT: &str = "/api/admin/article-types";
pub const ADMIN_TERMS_ENDPOINT: &str = "/api/admin/terms";
pub const ADMIN_RECOMMENDATIONS_ENDPOINT: &str = "/api/admin/recommendations";
pub const ADMIN_CONTENT_WORKSPACE_ENDPOINT: &str = "/api/admin/content/workspace";
pub const ADMIN_CONTENT_ARTICLES_ENDPOINT: &str = "/api/admin/content/articles";
pub const ADMIN_CONTENT_ARTICLE_REMOVE_ENDPOINT: &str = "/api/admin/content/articles/remove";
pub const ADMIN_CONTENT_TAXONOMY_ENDPOINT: &str = "/api/admin/content/taxonomy";
pub const ADMIN_CONTENT_TAXONOMY_ANALYZE_ENDPOINT: &str = "/api/admin/content/taxonomy/analyze";
pub const ADMIN_CONTENT_TAXONOMY_REVIEW_ENDPOINT: &str = "/api/admin/content/taxonomy/review";
pub const ADMIN_CONTENT_PREVIEW_ENDPOINT: &str = "/api/admin/content/preview";
pub const ADMIN_CONTENT_SUBMIT_ENDPOINT: &str = "/api/admin/content/submit";
pub const ADMIN_CONTENT_ABANDON_ENDPOINT: &str = "/api/admin/content/abandon";
pub const ADMIN_CONTENT_SYNC_ENDPOINT: &str = "/api/admin/content/sync";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ApiRoute {
    pub method: &'static str,
    pub endpoint: &'static str,
    pub scene_code: &'static str,
}

/// Product 路由、scene 校验和跨语言 golden 测试共同使用的编译期契约。
pub const ROUTES: &[ApiRoute] = &[
    ApiRoute {
        method: "GET",
        endpoint: PUBLIC_ARTICLES_ENDPOINT,
        scene_code: ARTICLE_LIST,
    },
    ApiRoute {
        method: "GET",
        endpoint: PUBLIC_ARTICLES_ENDPOINT,
        scene_code: ARTICLE_BROWSE,
    },
    ApiRoute {
        method: "GET",
        endpoint: PUBLIC_ARTICLES_ENDPOINT,
        scene_code: ARTICLE_DETAIL,
    },
    ApiRoute {
        method: "GET",
        endpoint: PUBLIC_ARTICLE_TYPES_ENDPOINT,
        scene_code: ARTICLE_TYPE_LIST,
    },
    ApiRoute {
        method: "GET",
        endpoint: PUBLIC_TERMS_ENDPOINT,
        scene_code: TERM_LIST,
    },
    ApiRoute {
        method: "GET",
        endpoint: PUBLIC_RECOMMENDATIONS_ENDPOINT,
        scene_code: RECOMMENDATION_CURRENT,
    },
    ApiRoute {
        method: "GET",
        endpoint: MOBILE_ARTICLE_SHELF_ENDPOINT,
        scene_code: MOBILE_ARTICLE_SHELF,
    },
    ApiRoute {
        method: "GET",
        endpoint: T_SHELF_ENDPOINT,
        scene_code: T_SHELF,
    },
    ApiRoute {
        method: "GET",
        endpoint: PUBLIC_TAXONOMY_ENDPOINT,
        scene_code: TAXONOMY_TREE,
    },
    ApiRoute {
        method: "GET",
        endpoint: MOBILE_CATEGORY_SHELF_ENDPOINT,
        scene_code: MOBILE_CATEGORY_SHELF,
    },
    ApiRoute {
        method: "GET",
        endpoint: PUBLIC_SITE_ROUTES_ENDPOINT,
        scene_code: SITE_ROUTES,
    },
    ApiRoute {
        method: "GET",
        endpoint: MOBILE_PAGE_ENDPOINT,
        scene_code: MOBILE_PAGE,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_SESSION_ENDPOINT,
        scene_code: ADMIN_SESSION_CREATE,
    },
    ApiRoute {
        method: "DELETE",
        endpoint: ADMIN_SESSION_ENDPOINT,
        scene_code: ADMIN_SESSION_DELETE,
    },
    ApiRoute {
        method: "GET",
        endpoint: ADMIN_ARTICLES_ENDPOINT,
        scene_code: ADMIN_ARTICLE_LIST,
    },
    ApiRoute {
        method: "GET",
        endpoint: ADMIN_ARTICLES_ENDPOINT,
        scene_code: ADMIN_ARTICLE_DETAIL,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_ARTICLES_ENDPOINT,
        scene_code: ADMIN_ARTICLE_CREATE,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_ARTICLES_ENDPOINT,
        scene_code: ADMIN_ARTICLE_UPDATE,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_ARTICLES_ENDPOINT,
        scene_code: ADMIN_ARTICLE_PUBLISH,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_ARTICLES_ENDPOINT,
        scene_code: ADMIN_ARTICLE_UNPUBLISH,
    },
    ApiRoute {
        method: "GET",
        endpoint: ADMIN_ARTICLE_TYPES_ENDPOINT,
        scene_code: ADMIN_ARTICLE_TYPE_LIST,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_ARTICLE_TYPES_ENDPOINT,
        scene_code: ADMIN_ARTICLE_TYPE_CREATE,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_ARTICLE_TYPES_ENDPOINT,
        scene_code: ADMIN_ARTICLE_TYPE_UPDATE,
    },
    ApiRoute {
        method: "GET",
        endpoint: ADMIN_TERMS_ENDPOINT,
        scene_code: ADMIN_TERM_LIST,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_TERMS_ENDPOINT,
        scene_code: ADMIN_TERM_CREATE,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_TERMS_ENDPOINT,
        scene_code: ADMIN_TERM_UPDATE,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_RECOMMENDATIONS_ENDPOINT,
        scene_code: ADMIN_RECOMMENDATION_GENERATE,
    },
    ApiRoute {
        method: "GET",
        endpoint: ADMIN_CONTENT_WORKSPACE_ENDPOINT,
        scene_code: ADMIN_CONTENT_WORKSPACE,
    },
    ApiRoute {
        method: "GET",
        endpoint: ADMIN_CONTENT_ARTICLES_ENDPOINT,
        scene_code: ADMIN_CONTENT_ARTICLE_LIST,
    },
    ApiRoute {
        method: "GET",
        endpoint: ADMIN_CONTENT_ARTICLES_ENDPOINT,
        scene_code: ADMIN_CONTENT_ARTICLE_DETAIL,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_CONTENT_ARTICLES_ENDPOINT,
        scene_code: ADMIN_CONTENT_ARTICLE_SAVE,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_CONTENT_ARTICLE_REMOVE_ENDPOINT,
        scene_code: ADMIN_CONTENT_ARTICLE_REMOVE,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_CONTENT_TAXONOMY_ENDPOINT,
        scene_code: ADMIN_CONTENT_TAXONOMY_SAVE,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_CONTENT_TAXONOMY_ANALYZE_ENDPOINT,
        scene_code: ADMIN_CONTENT_TAXONOMY_ANALYZE,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_CONTENT_TAXONOMY_REVIEW_ENDPOINT,
        scene_code: ADMIN_CONTENT_TAXONOMY_REVIEW,
    },
    ApiRoute {
        method: "GET",
        endpoint: ADMIN_CONTENT_PREVIEW_ENDPOINT,
        scene_code: ADMIN_CONTENT_PREVIEW,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_CONTENT_SUBMIT_ENDPOINT,
        scene_code: ADMIN_CONTENT_SUBMIT,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_CONTENT_ABANDON_ENDPOINT,
        scene_code: ADMIN_CONTENT_ABANDON,
    },
    ApiRoute {
        method: "POST",
        endpoint: ADMIN_CONTENT_SYNC_ENDPOINT,
        scene_code: ADMIN_CONTENT_SYNC,
    },
    ApiRoute {
        method: "GET",
        endpoint: ADMIN_CONTENT_SYNC_ENDPOINT,
        scene_code: ADMIN_CONTENT_SYNC_STATUS,
    },
];

pub fn supports(method: &str, endpoint: &str, scene_code: &str) -> bool {
    ROUTES.iter().any(|route| {
        route.method == method && route.endpoint == endpoint && route.scene_code == scene_code
    })
}

/// 公开端点使用的 `public.*` 场景集合（Mock 场景覆盖的输入来源）。
pub const PUBLIC: &[&str] = &[
    ARTICLE_LIST,
    ARTICLE_BROWSE,
    ARTICLE_DETAIL,
    ARTICLE_TYPE_LIST,
    TERM_LIST,
    RECOMMENDATION_CURRENT,
    MOBILE_ARTICLE_SHELF,
    T_SHELF,
    TAXONOMY_TREE,
    MOBILE_CATEGORY_SHELF,
    SITE_ROUTES,
    MOBILE_PAGE,
];

/// 管理端点使用的 `admin.*` 场景集合。
pub const ADMIN: &[&str] = &[
    ADMIN_SESSION_CREATE,
    ADMIN_SESSION_DELETE,
    ADMIN_ARTICLE_LIST,
    ADMIN_ARTICLE_DETAIL,
    ADMIN_ARTICLE_CREATE,
    ADMIN_ARTICLE_UPDATE,
    ADMIN_ARTICLE_PUBLISH,
    ADMIN_ARTICLE_UNPUBLISH,
    ADMIN_ARTICLE_TYPE_LIST,
    ADMIN_ARTICLE_TYPE_CREATE,
    ADMIN_ARTICLE_TYPE_UPDATE,
    ADMIN_TERM_LIST,
    ADMIN_TERM_CREATE,
    ADMIN_TERM_UPDATE,
    ADMIN_RECOMMENDATION_GENERATE,
    ADMIN_CONTENT_WORKSPACE,
    ADMIN_CONTENT_ARTICLE_LIST,
    ADMIN_CONTENT_ARTICLE_DETAIL,
    ADMIN_CONTENT_ARTICLE_SAVE,
    ADMIN_CONTENT_ARTICLE_REMOVE,
    ADMIN_CONTENT_TAXONOMY_SAVE,
    ADMIN_CONTENT_TAXONOMY_ANALYZE,
    ADMIN_CONTENT_TAXONOMY_REVIEW,
    ADMIN_CONTENT_PREVIEW,
    ADMIN_CONTENT_SUBMIT,
    ADMIN_CONTENT_ABANDON,
    ADMIN_CONTENT_SYNC,
    ADMIN_CONTENT_SYNC_STATUS,
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scene_names_are_unique_and_prefixed_by_endpoint() {
        let mut all: Vec<&str> = PUBLIC.to_vec();
        all.extend_from_slice(ADMIN);
        let mut sorted = all.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(all.len(), sorted.len(), "scene codes must be unique");
        assert_eq!(all.len(), 40);
        for scene in all {
            assert!(
                scene.starts_with("public.") || scene.starts_with("admin."),
                "sceneCode must be `端点.场景`: {scene}"
            );
        }
    }

    #[test]
    fn api_routes_are_unique_and_cover_every_scene() {
        let mut triples = ROUTES
            .iter()
            .map(|route| (route.method, route.endpoint, route.scene_code))
            .collect::<Vec<_>>();
        let route_count = triples.len();
        triples.sort_unstable();
        triples.dedup();
        assert_eq!(
            route_count,
            triples.len(),
            "API route triples must be unique"
        );

        let mut route_scenes = ROUTES
            .iter()
            .map(|route| route.scene_code)
            .collect::<Vec<_>>();
        route_scenes.sort_unstable();
        let mut all_scenes = PUBLIC
            .iter()
            .chain(ADMIN.iter())
            .copied()
            .collect::<Vec<_>>();
        all_scenes.sort_unstable();
        assert_eq!(route_scenes, all_scenes);
    }

    #[test]
    fn admin_scenes_are_not_public() {
        for scene in ADMIN {
            assert!(!PUBLIC.contains(scene), "{scene} must not be public");
        }
    }
}
