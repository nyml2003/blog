/**
 * 浏览器 API 路由契约表（A 形态：单一数据表）。
 * Client 的每次请求都从这里取得 endpoint、method 与 sceneCode；
 * golden 测试可直接遍历全集（对照 docs/api/routes.json）。
 */
export type ClientApiRoute = {
  method: "GET" | "POST" | "DELETE";
  endpoint: string;
  sceneCode: string;
};

/**
 * 完整、可枚举的浏览器 API 契约。Client 的每次请求都从这里取得 endpoint、method 与
 * sceneCode；golden 测试可直接遍历全集，不依赖手工调用每个 Client 方法。
 */
export const CLIENT_API_ROUTES = {
  adminSessionCreate: {
    method: "POST",
    endpoint: "/api/admin/session",
    sceneCode: "admin.session.create",
  },
  adminSessionDelete: {
    method: "DELETE",
    endpoint: "/api/admin/session",
    sceneCode: "admin.session.delete",
  },
  publicArticleList: {
    method: "GET",
    endpoint: "/api/public/articles",
    sceneCode: "public.article_list",
  },
  publicArticleBrowse: {
    method: "GET",
    endpoint: "/api/public/articles",
    sceneCode: "public.article_browse",
  },
  publicArticleDetail: {
    method: "GET",
    endpoint: "/api/public/articles",
    sceneCode: "public.article_detail",
  },
  publicArticleTypeList: {
    method: "GET",
    endpoint: "/api/public/article-types",
    sceneCode: "public.article_type_list",
  },
  publicTermList: {
    method: "GET",
    endpoint: "/api/public/terms",
    sceneCode: "public.term_list",
  },
  publicRecommendationCurrent: {
    method: "GET",
    endpoint: "/api/public/recommendations",
    sceneCode: "public.recommendation_current",
  },
  publicMobileArticleShelf: {
    method: "GET",
    endpoint: "/api/public/mobile/article-shelf",
    sceneCode: "public.mobile_article_shelf",
  },
  publicTShelf: {
    method: "GET",
    endpoint: "/api/public/t-shelf",
    sceneCode: "public.t_shelf",
  },
  publicTaxonomyTree: {
    method: "GET",
    endpoint: "/api/public/taxonomy",
    sceneCode: "public.taxonomy_tree",
  },
  publicMobileCategoryShelf: {
    method: "GET",
    endpoint: "/api/public/mobile/category-shelf",
    sceneCode: "public.mobile_category_shelf",
  },
  publicSiteRoutes: {
    method: "GET",
    endpoint: "/api/public/site-routes",
    sceneCode: "public.site_routes",
  },
  adminArticleList: {
    method: "GET",
    endpoint: "/api/admin/articles",
    sceneCode: "admin.article_list",
  },
  adminArticleDetail: {
    method: "GET",
    endpoint: "/api/admin/articles",
    sceneCode: "admin.article_detail",
  },
  adminArticleCreate: {
    method: "POST",
    endpoint: "/api/admin/articles",
    sceneCode: "admin.article_create",
  },
  adminArticleUpdate: {
    method: "POST",
    endpoint: "/api/admin/articles",
    sceneCode: "admin.article_update",
  },
  adminArticlePublish: {
    method: "POST",
    endpoint: "/api/admin/articles",
    sceneCode: "admin.article_publish",
  },
  adminArticleUnpublish: {
    method: "POST",
    endpoint: "/api/admin/articles",
    sceneCode: "admin.article_unpublish",
  },
  adminArticleTypeList: {
    method: "GET",
    endpoint: "/api/admin/article-types",
    sceneCode: "admin.article_type_list",
  },
  adminArticleTypeCreate: {
    method: "POST",
    endpoint: "/api/admin/article-types",
    sceneCode: "admin.article_type_create",
  },
  adminArticleTypeUpdate: {
    method: "POST",
    endpoint: "/api/admin/article-types",
    sceneCode: "admin.article_type_update",
  },
  adminTermList: {
    method: "GET",
    endpoint: "/api/admin/terms",
    sceneCode: "admin.term_list",
  },
  adminTermCreate: {
    method: "POST",
    endpoint: "/api/admin/terms",
    sceneCode: "admin.term_create",
  },
  adminTermUpdate: {
    method: "POST",
    endpoint: "/api/admin/terms",
    sceneCode: "admin.term_update",
  },
  adminRecommendationGenerate: {
    method: "POST",
    endpoint: "/api/admin/recommendations",
    sceneCode: "admin.recommendation_generate",
  },
  adminContentWorkspace: {
    method: "GET",
    endpoint: "/api/admin/content/workspace",
    sceneCode: "admin.content_workspace",
  },
  adminContentArticleList: {
    method: "GET",
    endpoint: "/api/admin/content/articles",
    sceneCode: "admin.content_article_list",
  },
  adminContentArticleDetail: {
    method: "GET",
    endpoint: "/api/admin/content/articles",
    sceneCode: "admin.content_article_detail",
  },
  adminContentArticleSave: {
    method: "POST",
    endpoint: "/api/admin/content/articles",
    sceneCode: "admin.content_article_save",
  },
  adminContentArticleRemove: {
    method: "POST",
    endpoint: "/api/admin/content/articles/remove",
    sceneCode: "admin.content_article_remove",
  },
  adminContentTaxonomySave: {
    method: "POST",
    endpoint: "/api/admin/content/taxonomy",
    sceneCode: "admin.content_taxonomy_save",
  },
  adminContentTaxonomyAnalyze: {
    method: "POST",
    endpoint: "/api/admin/content/taxonomy/analyze",
    sceneCode: "admin.content_taxonomy_analyze",
  },
  adminContentTaxonomyReview: {
    method: "POST",
    endpoint: "/api/admin/content/taxonomy/review",
    sceneCode: "admin.content_taxonomy_review",
  },
  adminContentPreview: {
    method: "GET",
    endpoint: "/api/admin/content/preview",
    sceneCode: "admin.content_preview",
  },
  adminContentSubmit: {
    method: "POST",
    endpoint: "/api/admin/content/submit",
    sceneCode: "admin.content_submit",
  },
  adminContentAbandon: {
    method: "POST",
    endpoint: "/api/admin/content/abandon",
    sceneCode: "admin.content_abandon",
  },
  adminContentSync: {
    method: "POST",
    endpoint: "/api/admin/content/sync",
    sceneCode: "admin.content_sync",
  },
  adminContentSyncStatus: {
    method: "GET",
    endpoint: "/api/admin/content/sync",
    sceneCode: "admin.content_sync_status",
  },
} as const satisfies Record<string, ClientApiRoute>;
