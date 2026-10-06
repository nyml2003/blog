// 页面契约的唯一声明在 @fluvient-loom/page-kit（页面作者依赖点）；
// 本包（构建链）re-export 供构建侧消费者使用。
export type {
  PageEntry,
  PageFactory,
  PageLayout,
  PageNavMetadata,
  PagePlatform,
  PageRegistration,
  PageRoute,
} from "@fluvient-loom/page-kit";
export { pageRoutes } from "@fluvient-loom/page-kit";
