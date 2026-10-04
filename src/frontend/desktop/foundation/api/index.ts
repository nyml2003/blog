// 薄转发：实现已抽入 @blog/desktop-api（api client + 类型 + 数据资源钩子）。
// 保留路径使既有消费者零改动；P3d 批量迁移时可逐步直连。
export {
  createDesktopApi,
  siteRoutesSchema,
  useDesktopResource,
} from "@blog/desktop-api";
export type {
  AdminArticle,
  AdminSessionLoginInput,
  ArticleSearch,
  ContentArticleDetail,
  ContentArticleSaveResult,
  DesktopApi,
  DesktopApiFailure,
  DesktopArticle,
  SiteRoutes,
  SyncStatus,
  Taxonomy,
  TShelf,
  TShelfInput,
  Workspace,
} from "@blog/desktop-api";
