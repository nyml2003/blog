//! `sceneCode` 常量（ARCH-DATA-API：`端点.场景` 命名）。
//!
//! Product 与 Mock Product API 暴露同一路由集合，两侧必须引用**同一份**常量：
//! 前端在真实后端与 Mock 之间切换时不改变任何请求，场景名拼错在编译期即可发现。
//! 取值集合与已移除的 Go 参考实现行为对齐（2026-09-06 退场）。

pub const ARTICLE_LIST: &str = "public.article_list";
/// Mobile 平铺页的分页检索（SPEC-MOBILE-BROWSE-IA-001 决策记录 #7）：type/topic/tag
/// 三个独立维度各单选、维度间 AND；与 `article_list` 的 `term_ids`（同维度 OR）并存。
pub const ARTICLE_BROWSE: &str = "public.article_browse";
pub const ARTICLE_DETAIL: &str = "public.article_detail";
pub const ARTICLE_TYPE_LIST: &str = "public.article_type_list";
pub const TERM_LIST: &str = "public.term_list";
pub const RECOMMENDATION_CURRENT: &str = "public.recommendation_current";
pub const MOBILE_ARTICLE_SHELF: &str = "public.mobile_article_shelf";
/// 公开端 T 型货架：顶部类型筛选 + 当前类型的有界文章集合。
pub const T_SHELF: &str = "public.t_shelf";
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

pub const PUBLIC_ARTICLES_ENDPOINT: &str = "/api/public/articles";
pub const PUBLIC_ARTICLE_TYPES_ENDPOINT: &str = "/api/public/article-types";
pub const PUBLIC_TERMS_ENDPOINT: &str = "/api/public/terms";
pub const PUBLIC_RECOMMENDATIONS_ENDPOINT: &str = "/api/public/recommendations";
pub const MOBILE_ARTICLE_SHELF_ENDPOINT: &str = "/api/public/mobile/article-shelf";
pub const T_SHELF_ENDPOINT: &str = "/api/public/t-shelf";
pub const ADMIN_ARTICLES_ENDPOINT: &str = "/api/admin/articles";
pub const ADMIN_ARTICLE_TYPES_ENDPOINT: &str = "/api/admin/article-types";
pub const ADMIN_TERMS_ENDPOINT: &str = "/api/admin/terms";
pub const ADMIN_RECOMMENDATIONS_ENDPOINT: &str = "/api/admin/recommendations";

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
];

/// 管理端点使用的 `admin.*` 场景集合。
pub const ADMIN: &[&str] = &[
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
        assert_eq!(all.len(), 21);
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
